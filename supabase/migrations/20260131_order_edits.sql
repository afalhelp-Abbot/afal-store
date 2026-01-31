-- Migration: Order Edits Feature
-- Allows editing orders during confirmation (pending/packed status only)
-- Includes audit trail and inventory safety

-- 1. Add edit tracking columns to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS alternate_phone text,
ADD COLUMN IF NOT EXISTS edited_at timestamptz,
ADD COLUMN IF NOT EXISTS edited_by uuid,
ADD COLUMN IF NOT EXISTS edit_version int NOT NULL DEFAULT 0;

-- 2. Create order_edits audit table
CREATE TABLE IF NOT EXISTS order_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  edited_by uuid,
  reason text,
  diff jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_edits_order_id ON order_edits(order_id);
CREATE INDEX IF NOT EXISTS idx_order_edits_created_at ON order_edits(created_at DESC);

-- 3. RPC: Recalculate order totals
CREATE OR REPLACE FUNCTION recalculate_order_totals(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subtotal numeric;
  v_shipping numeric;
  v_discount numeric;
  v_total numeric;
BEGIN
  -- Sum line totals
  SELECT COALESCE(SUM(line_total), 0) INTO v_subtotal
  FROM order_lines
  WHERE order_id = p_order_id;

  -- Get shipping and discount from order
  SELECT 
    COALESCE(shipping_amount, 0),
    COALESCE(discount_total, 0)
  INTO v_shipping, v_discount
  FROM orders
  WHERE id = p_order_id;

  v_total := v_subtotal + v_shipping - v_discount;

  RETURN jsonb_build_object(
    'subtotal', v_subtotal,
    'shipping', v_shipping,
    'discount', v_discount,
    'total', v_total
  );
END;
$$;

-- 4. RPC: Apply order edit (main function)
CREATE OR REPLACE FUNCTION apply_order_edit(
  p_order_id uuid,
  p_customer_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_alternate_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_discount_total numeric DEFAULT NULL,
  p_shipping_amount numeric DEFAULT NULL,
  p_lines jsonb DEFAULT NULL, -- Array of {id, qty, unit_price} or {variant_id, qty, unit_price} for new lines
  p_reason text DEFAULT NULL,
  p_edited_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_old_data jsonb;
  v_new_data jsonb;
  v_diff jsonb;
  v_line RECORD;
  v_line_input jsonb;
  v_old_qty int;
  v_new_qty int;
  v_qty_delta int;
  v_variant_id uuid;
  v_unit_price numeric;
  v_line_total numeric;
  v_existing_line_ids uuid[];
  v_input_line_ids uuid[];
  v_lines_to_delete uuid[];
  v_old_lines jsonb;
  v_new_lines jsonb;
BEGIN
  -- 1. Load current order and validate status
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  
  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status NOT IN ('pending', 'packed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order cannot be edited in status: ' || v_order.status);
  END IF;

  -- 2. Store old data for diff
  v_old_data := jsonb_build_object(
    'customer_name', v_order.customer_name,
    'phone', v_order.phone,
    'alternate_phone', v_order.alternate_phone,
    'email', v_order.email,
    'address', v_order.address,
    'city', v_order.city,
    'notes', v_order.notes,
    'discount_total', v_order.discount_total,
    'shipping_amount', v_order.shipping_amount
  );

  -- Get old lines
  SELECT jsonb_agg(jsonb_build_object(
    'id', ol.id,
    'variant_id', ol.variant_id,
    'qty', ol.qty,
    'unit_price', ol.unit_price,
    'line_total', ol.line_total
  )) INTO v_old_lines
  FROM order_lines ol
  WHERE ol.order_id = p_order_id;

  v_old_data := v_old_data || jsonb_build_object('lines', COALESCE(v_old_lines, '[]'::jsonb));

  -- 3. Update customer fields (only if provided)
  UPDATE orders SET
    customer_name = COALESCE(p_customer_name, customer_name),
    phone = COALESCE(p_phone, phone),
    alternate_phone = COALESCE(p_alternate_phone, alternate_phone),
    email = COALESCE(p_email, email),
    address = COALESCE(p_address, address),
    city = COALESCE(p_city, city),
    notes = COALESCE(p_notes, notes),
    discount_total = COALESCE(p_discount_total, discount_total),
    shipping_amount = COALESCE(p_shipping_amount, shipping_amount),
    edited_at = now(),
    edited_by = p_edited_by,
    edit_version = edit_version + 1
  WHERE id = p_order_id;

  -- 4. Process line edits if provided
  IF p_lines IS NOT NULL AND jsonb_array_length(p_lines) > 0 THEN
    -- Get existing line IDs
    SELECT array_agg(id) INTO v_existing_line_ids
    FROM order_lines
    WHERE order_id = p_order_id;

    -- Get input line IDs (for existing lines being updated)
    SELECT array_agg((elem->>'id')::uuid) INTO v_input_line_ids
    FROM jsonb_array_elements(p_lines) AS elem
    WHERE elem->>'id' IS NOT NULL;

    -- Find lines to delete (existing but not in input)
    IF v_existing_line_ids IS NOT NULL THEN
      v_lines_to_delete := ARRAY(
        SELECT unnest(v_existing_line_ids)
        EXCEPT
        SELECT unnest(COALESCE(v_input_line_ids, ARRAY[]::uuid[]))
      );

      -- Delete removed lines (and restore inventory if needed)
      FOR v_line IN SELECT * FROM order_lines WHERE id = ANY(v_lines_to_delete) LOOP
        -- Restore inventory for deleted lines
        UPDATE variants SET stock = stock + v_line.qty WHERE id = v_line.variant_id;
        DELETE FROM order_lines WHERE id = v_line.id;
      END LOOP;
    END IF;

    -- Process each line in input
    FOR v_line_input IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
      v_variant_id := (v_line_input->>'variant_id')::uuid;
      v_new_qty := (v_line_input->>'qty')::int;
      v_unit_price := (v_line_input->>'unit_price')::numeric;

      IF v_new_qty <= 0 THEN
        CONTINUE; -- Skip invalid qty
      END IF;

      IF v_line_input->>'id' IS NOT NULL THEN
        -- Update existing line
        SELECT qty INTO v_old_qty FROM order_lines WHERE id = (v_line_input->>'id')::uuid;
        v_qty_delta := v_new_qty - COALESCE(v_old_qty, 0);

        -- Check stock availability for increases
        IF v_qty_delta > 0 THEN
          IF NOT EXISTS (
            SELECT 1 FROM variants 
            WHERE id = (SELECT variant_id FROM order_lines WHERE id = (v_line_input->>'id')::uuid)
            AND stock >= v_qty_delta
          ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Insufficient stock for quantity increase');
          END IF;
        END IF;

        -- Update line
        v_line_total := v_new_qty * COALESCE(v_unit_price, (SELECT unit_price FROM order_lines WHERE id = (v_line_input->>'id')::uuid));
        
        UPDATE order_lines SET
          qty = v_new_qty,
          unit_price = COALESCE(v_unit_price, unit_price),
          line_total = v_line_total
        WHERE id = (v_line_input->>'id')::uuid;

        -- Adjust inventory
        UPDATE variants SET stock = stock - v_qty_delta
        WHERE id = (SELECT variant_id FROM order_lines WHERE id = (v_line_input->>'id')::uuid);

      ELSE
        -- New line - check stock
        IF NOT EXISTS (SELECT 1 FROM variants WHERE id = v_variant_id AND stock >= v_new_qty) THEN
          RETURN jsonb_build_object('success', false, 'error', 'Insufficient stock for new item');
        END IF;

        -- Get price from variant if not provided
        IF v_unit_price IS NULL THEN
          SELECT price INTO v_unit_price FROM variants WHERE id = v_variant_id;
        END IF;

        v_line_total := v_new_qty * v_unit_price;

        -- Insert new line
        INSERT INTO order_lines (order_id, variant_id, qty, unit_price, line_total)
        VALUES (p_order_id, v_variant_id, v_new_qty, v_unit_price, v_line_total);

        -- Deduct inventory
        UPDATE variants SET stock = stock - v_new_qty WHERE id = v_variant_id;
      END IF;
    END LOOP;
  END IF;

  -- 5. Build new data for diff
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  
  v_new_data := jsonb_build_object(
    'customer_name', v_order.customer_name,
    'phone', v_order.phone,
    'alternate_phone', v_order.alternate_phone,
    'email', v_order.email,
    'address', v_order.address,
    'city', v_order.city,
    'notes', v_order.notes,
    'discount_total', v_order.discount_total,
    'shipping_amount', v_order.shipping_amount
  );

  SELECT jsonb_agg(jsonb_build_object(
    'id', ol.id,
    'variant_id', ol.variant_id,
    'qty', ol.qty,
    'unit_price', ol.unit_price,
    'line_total', ol.line_total
  )) INTO v_new_lines
  FROM order_lines ol
  WHERE ol.order_id = p_order_id;

  v_new_data := v_new_data || jsonb_build_object('lines', COALESCE(v_new_lines, '[]'::jsonb));

  -- 6. Create diff and audit log
  v_diff := jsonb_build_object('before', v_old_data, 'after', v_new_data);

  INSERT INTO order_edits (order_id, edited_by, reason, diff)
  VALUES (p_order_id, p_edited_by, p_reason, v_diff);

  -- 7. Return success with new totals
  RETURN jsonb_build_object(
    'success', true,
    'totals', recalculate_order_totals(p_order_id),
    'edit_version', v_order.edit_version
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION recalculate_order_totals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION apply_order_edit(uuid, text, text, text, text, text, text, text, numeric, numeric, jsonb, text, uuid) TO authenticated;
