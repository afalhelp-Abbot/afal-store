-- Migration: Admin Audit Logs Feature
-- Creates product_edits table and unified admin_audit_logs VIEW

-- 1. Create product_edits table for tracking product changes
CREATE TABLE IF NOT EXISTS product_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES variants(id) ON DELETE SET NULL,
  edited_by uuid,
  reason text,
  diff jsonb NOT NULL DEFAULT '{}',
  summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_edits_product_id ON product_edits(product_id);
CREATE INDEX IF NOT EXISTS idx_product_edits_created_at ON product_edits(created_at DESC);

-- 2. Create unified admin_audit_logs VIEW
-- Combines: order_edits, inventory_changes, product_edits, courier_status_logs
CREATE OR REPLACE VIEW admin_audit_logs AS

-- Order Edits
SELECT 
  oe.id,
  'order_edit' AS event_type,
  'order' AS entity_type,
  oe.order_id AS entity_id,
  o.short_code AS entity_code,
  COALESCE(
    'Edited order #' || o.short_code || COALESCE(' - ' || oe.reason, ''),
    'Order edit'
  ) AS summary,
  oe.diff AS metadata,
  oe.edited_by AS actor_id,
  p.email AS actor_email,
  oe.created_at
FROM order_edits oe
LEFT JOIN orders o ON o.id = oe.order_id
LEFT JOIN profiles p ON p.id = oe.edited_by

UNION ALL

-- Inventory Changes
SELECT 
  ic.id,
  'inventory_change' AS event_type,
  'inventory' AS entity_type,
  ic.variant_id AS entity_id,
  v.sku AS entity_code,
  CASE 
    WHEN ic.reason = 'stock_in' THEN 'Stock in: ' || v.sku || ' (' || COALESCE(ic.delta::text, '0') || ')'
    WHEN ic.reason = 'set_stock' THEN 'Set stock: ' || v.sku || ' to ' || COALESCE((ic.delta)::text, '0')
    WHEN ic.reason = 'manual_adjust' THEN 'Manual adjust: ' || v.sku || ' (' || COALESCE(ic.delta::text, '0') || ')'
    ELSE COALESCE(ic.reason, 'Inventory change') || ': ' || v.sku
  END AS summary,
  jsonb_build_object(
    'delta', ic.delta,
    'reason', ic.reason
  ) AS metadata,
  NULL::uuid AS actor_id,
  NULL::text AS actor_email,
  ic.created_at
FROM inventory_changes ic
LEFT JOIN variants v ON v.id = ic.variant_id

UNION ALL

-- Product Edits
SELECT 
  pe.id,
  'product_edit' AS event_type,
  'product' AS entity_type,
  COALESCE(pe.product_id, pe.variant_id) AS entity_id,
  COALESCE(pr.slug, v.sku) AS entity_code,
  COALESCE(pe.summary, 'Product edit: ' || COALESCE(pr.name, v.sku, 'Unknown')) AS summary,
  pe.diff AS metadata,
  pe.edited_by AS actor_id,
  p.email AS actor_email,
  pe.created_at
FROM product_edits pe
LEFT JOIN products pr ON pr.id = pe.product_id
LEFT JOIN variants v ON v.id = pe.variant_id
LEFT JOIN profiles p ON p.id = pe.edited_by

UNION ALL

-- Courier Status Logs (order status changes via courier webhooks)
SELECT 
  csl.id,
  'courier_status' AS event_type,
  'order' AS entity_type,
  csl.order_id AS entity_id,
  o.short_code AS entity_code,
  'Courier status: ' || COALESCE(csl.status_code, '') || ' - ' || COALESCE(csl.status_desc, '') AS summary,
  jsonb_build_object(
    'courier_id', csl.courier_id,
    'tracking_number', csl.tracking_number,
    'status_code', csl.status_code,
    'status_desc', csl.status_desc,
    'raw_payload', csl.raw_payload
  ) AS metadata,
  NULL::uuid AS actor_id,
  'system (courier webhook)'::text AS actor_email,
  csl.created_at
FROM courier_status_logs csl
LEFT JOIN orders o ON o.id = csl.order_id

ORDER BY created_at DESC;

-- Grant access
GRANT SELECT ON admin_audit_logs TO authenticated;
