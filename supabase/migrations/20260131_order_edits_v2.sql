-- Migration: Order Edits Feature V2
-- Fixes: Use reserved instead of stock_on_hand, CN lock, concurrency check

-- Drop and recreate the apply_order_edit function with all guardrails
CREATE OR REPLACE FUNCTION apply_order_edit(
  p_order_id uuid,
  p_expected_edit_version int DEFAULT NULL,  -- For concurrency check
  p_customer_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_alternate_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_discount_total numeric DEFAULT NULL,
  p_shipping_amount numeric DEFAULT NULL,
  p_lines jsonb DEFAULT NULL,
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
  v_cn_booked boolean;
  v_has_line_changes boolean := false;
  v_has_financial_changes boolean := false;
  v_available int;
  v_current_reserved int;
  v_inventory_deltas jsonb := '[]'::jsonb;
BEGIN
  -- 1. Load current order and validate status (with row lock)
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  
  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Check status is editable
  IF v_order.status NOT IN ('pending', 'packed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order cannot be edited in status: ' || v_order.status);
  END IF;

  -- 2. Concurrency check: verify edit_version matches expected
  IF p_expected_edit_version IS NOT NULL AND v_order.edit_version != p_expected_edit_version THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order was edited by another user. Please refresh and try again.', 'code', 'CONCURRENCY_ERROR');
  END IF;

  -- 3. Check if CN is booked
  v_cn_booked := (v_order.courier_tracking_number IS NOT NULL AND v_order.courier_tracking_number != '');

  -- 4. Detect if payload contains line or financial changes
  IF p_lines IS NOT NULL AND jsonb_array_length(p_lines) > 0 THEN
    v_has_line_changes := true;
  END IF;
  
  IF p_discount_total IS NOT NULL AND p_discount_total != COALESCE(v_order.discount_total, 0) THEN
    v_has_financial_changes := true;
  END IF;
  
  IF p_shipping_amount IS NOT NULL AND p_shipping_amount != COALESCE(v_order.shipping_amount, 0) THEN
    v_has_financial_changes := true;
  END IF;

  -- 5. CN Lock: Block line/financial edits if CN is booked
  IF v_cn_booked AND (v_has_line_changes OR v_has_financial_changes) THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'CN already booked. Line items and totals cannot be edited. Only contact/address/notes allowed.',
      'code', 'CN_LOCKED'
    );
  END IF;

  -- 6. Store old data for diff
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

  SELECT jsonb_agg(jsonb_build_object(
    'id', ol.id, 'variant_id', ol.variant_id, 'qty', ol.qty,
    'unit_price', ol.unit_price, 'line_total', ol.line_total
  )) INTO v_old_lines FROM order_lines ol WHERE ol.order_id = p_order_id;

  v_old_data := v_old_data || jsonb_build_object('lines', COALESCE(v_old_lines, '[]'::jsonb));

  -- 7. Update customer fields (always allowed)
  UPDATE orders SET
    customer_name = COALESCE(p_customer_name, customer_name),
    phone = COALESCE(p_phone, phone),
    alternate_phone = COALESCE(p_alternate_phone, alternate_phone),
    email = COALESCE(p_email, email),
    address = COALESCE(p_address, address),
    city = COALESCE(p_city, city),
    notes = COALESCE(p_notes, notes),
    discount_total = CASE WHEN v_cn_booked THEN discount_total ELSE COALESCE(p_discount_total, discount_total) END,
    shipping_amount = CASE WHEN v_cn_booked THEN shipping_amount ELSE COALESCE(p_shipping_amount, shipping_amount) END,
    edited_at = now(),
    edited_by = p_edited_by,
    edit_version = edit_version + 1
  WHERE id = p_order_id;

  -- 8. Process line edits (only if not CN locked)
  IF NOT v_cn_booked AND p_lines IS NOT NULL AND jsonb_array_length(p_lines) > 0 THEN
    -- Get existing line IDs
    SELECT array_agg(id) INTO v_existing_line_ids FROM order_lines WHERE order_id = p_order_id;

    -- Get input line IDs (for existing lines being updated)
    SELECT array_agg((elem->>'id')::uuid) INTO v_input_line_ids
    FROM jsonb_array_elements(p_lines) AS elem WHERE elem->>'id' IS NOT NULL;

    -- Find lines to delete (existing but not in input)
    IF v_existing_line_ids IS NOT NULL THEN
      v_lines_to_delete := ARRAY(
        SELECT unnest(v_existing_line_ids) EXCEPT SELECT unnest(COALESCE(v_input_line_ids, ARRAY[]::uuid[]))
      );

      -- Delete removed lines and DECREASE reserved (not stock_on_hand)
      FOR v_line IN SELECT * FROM order_lines WHERE id = ANY(v_lines_to_delete) LOOP
        -- Decrease reserved for this variant
        UPDATE inventory 
        SET reserved = GREATEST(0, reserved - v_line.qty)
        WHERE variant_id = v_line.variant_id;
        
        -- Track delta for audit
        v_inventory_deltas := v_inventory_deltas || jsonb_build_object(
          'variant_id', v_line.variant_id,
          'action', 'line_removed',
          'reserved_delta', -v_line.qty
        );
        
        DELETE FROM order_lines WHERE id = v_line.id;
      END LOOP;
    END IF;

    -- Process each line in input
    FOR v_line_input IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
      v_variant_id := (v_line_input->>'variant_id')::uuid;
      v_new_qty := (v_line_input->>'qty')::int;
      v_unit_price := (v_line_input->>'unit_price')::numeric;

      IF v_new_qty <= 0 THEN CONTINUE; END IF;

      IF v_line_input->>'id' IS NOT NULL THEN
        -- Update existing line
        SELECT qty, variant_id INTO v_old_qty, v_variant_id 
        FROM order_lines WHERE id = (v_line_input->>'id')::uuid;
        
        v_qty_delta := v_new_qty - COALESCE(v_old_qty, 0);

        -- Check availability for increases
        IF v_qty_delta > 0 THEN
          SELECT (stock_on_hand - reserved) INTO v_available
          FROM inventory WHERE variant_id = v_variant_id;
          
          IF COALESCE(v_available, 0) < v_qty_delta THEN
            RETURN jsonb_build_object('success', false, 'error', 'Insufficient available stock for quantity increase. Available: ' || COALESCE(v_available, 0));
          END IF;
        END IF;

        -- Update line
        v_line_total := v_new_qty * COALESCE(v_unit_price, (SELECT unit_price FROM order_lines WHERE id = (v_line_input->>'id')::uuid));
        
        UPDATE order_lines SET 
          qty = v_new_qty, 
          unit_price = COALESCE(v_unit_price, unit_price), 
          line_total = v_line_total
        WHERE id = (v_line_input->>'id')::uuid;

        -- Adjust RESERVED (not stock_on_hand)
        IF v_qty_delta != 0 THEN
          UPDATE inventory 
          SET reserved = GREATEST(0, reserved + v_qty_delta)
          WHERE variant_id = v_variant_id;
          
          v_inventory_deltas := v_inventory_deltas || jsonb_build_object(
            'variant_id', v_variant_id,
            'action', 'qty_changed',
            'old_qty', v_old_qty,
            'new_qty', v_new_qty,
            'reserved_delta', v_qty_delta
          );
        END IF;

      ELSE
        -- New line - check availability
        SELECT (stock_on_hand - reserved) INTO v_available
        FROM inventory WHERE variant_id = v_variant_id;
        
        IF COALESCE(v_available, 0) < v_new_qty THEN
          RETURN jsonb_build_object('success', false, 'error', 'Insufficient available stock for new item. Available: ' || COALESCE(v_available, 0));
        END IF;

        -- Get price from variant if not provided
        IF v_unit_price IS NULL THEN
          SELECT price INTO v_unit_price FROM variants WHERE id = v_variant_id;
        END IF;

        v_line_total := v_new_qty * v_unit_price;

        -- Insert new line
        INSERT INTO order_lines (order_id, variant_id, qty, unit_price, line_total)
        VALUES (p_order_id, v_variant_id, v_new_qty, v_unit_price, v_line_total);

        -- Increase RESERVED (not stock_on_hand)
        UPDATE inventory 
        SET reserved = reserved + v_new_qty 
        WHERE variant_id = v_variant_id;
        
        v_inventory_deltas := v_inventory_deltas || jsonb_build_object(
          'variant_id', v_variant_id,
          'action', 'line_added',
          'qty', v_new_qty,
          'reserved_delta', v_new_qty
        );
      END IF;
    END LOOP;
  END IF;

  -- 9. Build new data for diff
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
    'id', ol.id, 'variant_id', ol.variant_id, 'qty', ol.qty,
    'unit_price', ol.unit_price, 'line_total', ol.line_total
  )) INTO v_new_lines FROM order_lines ol WHERE ol.order_id = p_order_id;

  v_new_data := v_new_data || jsonb_build_object('lines', COALESCE(v_new_lines, '[]'::jsonb));

  -- 10. Create diff and audit log (include inventory deltas)
  v_diff := jsonb_build_object(
    'before', v_old_data, 
    'after', v_new_data,
    'inventory_deltas', v_inventory_deltas
  );

  INSERT INTO order_edits (order_id, edited_by, reason, diff)
  VALUES (p_order_id, p_edited_by, p_reason, v_diff);

  -- 11. Return success with new totals and updated edit_version
  RETURN jsonb_build_object(
    'success', true,
    'totals', recalculate_order_totals(p_order_id),
    'edit_version', v_order.edit_version,
    'cn_booked', v_cn_booked
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION apply_order_edit(uuid, int, text, text, text, text, text, text, text, numeric, numeric, jsonb, text, uuid) TO authenticated;
