-- Migration: Add actor metadata columns for multi-country tracking
-- Allows tracking timezone and IP country for audit accountability

-- 1. Add columns to order_edits table
ALTER TABLE order_edits 
ADD COLUMN IF NOT EXISTS actor_timezone text,
ADD COLUMN IF NOT EXISTS actor_ip text,
ADD COLUMN IF NOT EXISTS ip_country text,
ADD COLUMN IF NOT EXISTS user_agent text;

-- 2. Drop and recreate apply_order_edit with new params
DROP FUNCTION IF EXISTS apply_order_edit(uuid, int, text, text, text, text, text, text, text, numeric, numeric, jsonb, text, uuid);

-- 2. Add columns to inventory_changes table (if we want to track there too)
ALTER TABLE inventory_changes 
ADD COLUMN IF NOT EXISTS actor_timezone text,
ADD COLUMN IF NOT EXISTS actor_ip text,
ADD COLUMN IF NOT EXISTS ip_country text;

-- 3. Add columns to product_edits table
ALTER TABLE product_edits 
ADD COLUMN IF NOT EXISTS actor_timezone text,
ADD COLUMN IF NOT EXISTS actor_ip text,
ADD COLUMN IF NOT EXISTS ip_country text,
ADD COLUMN IF NOT EXISTS user_agent text;

-- 4. Update the admin_audit_logs VIEW to include new columns
DROP VIEW IF EXISTS admin_audit_logs;

CREATE OR REPLACE VIEW admin_audit_logs AS

-- Order Edits
SELECT 
  oe.id::text AS id,
  'order_edit'::text AS event_type,
  'order'::text AS entity_type,
  oe.order_id::text AS entity_id,
  o.short_code::text AS entity_code,
  COALESCE('Edited order #' || o.short_code || COALESCE(' - ' || oe.reason, ''), 'Order edit')::text AS summary,
  oe.diff AS metadata,
  oe.edited_by::text AS actor_id,
  p.email::text AS actor_email,
  oe.actor_timezone::text AS actor_timezone,
  oe.ip_country::text AS ip_country,
  oe.created_at
FROM order_edits oe
LEFT JOIN orders o ON o.id = oe.order_id
LEFT JOIN profiles p ON p.id = oe.edited_by

UNION ALL

-- Inventory Changes
SELECT 
  ic.id::text AS id,
  'inventory_change'::text AS event_type,
  'inventory'::text AS entity_type,
  ic.variant_id::text AS entity_id,
  v.sku::text AS entity_code,
  (CASE 
    WHEN ic.reason = 'stock_in' THEN 'Stock in: ' || COALESCE(v.sku, '') || ' (' || COALESCE(ic.delta::text, '0') || ')'
    WHEN ic.reason = 'set_stock' THEN 'Set stock: ' || COALESCE(v.sku, '') || ' to ' || COALESCE(ic.delta::text, '0')
    ELSE COALESCE(ic.reason, 'Inventory change') || ': ' || COALESCE(v.sku, '')
  END)::text AS summary,
  jsonb_build_object('delta', ic.delta, 'reason', ic.reason) AS metadata,
  ic.actor::text AS actor_id,
  pr.email::text AS actor_email,
  ic.actor_timezone::text AS actor_timezone,
  ic.ip_country::text AS ip_country,
  ic.created_at
FROM inventory_changes ic
LEFT JOIN variants v ON v.id = ic.variant_id
LEFT JOIN profiles pr ON pr.id = ic.actor

UNION ALL

-- Product Edits
SELECT 
  pe.id::text AS id,
  'product_edit'::text AS event_type,
  'product'::text AS entity_type,
  COALESCE(pe.product_id, pe.variant_id)::text AS entity_id,
  COALESCE(prod.slug, v.sku)::text AS entity_code,
  COALESCE(pe.summary, 'Product edit: ' || COALESCE(prod.name, v.sku, 'Unknown'))::text AS summary,
  pe.diff AS metadata,
  pe.edited_by::text AS actor_id,
  p.email::text AS actor_email,
  pe.actor_timezone::text AS actor_timezone,
  pe.ip_country::text AS ip_country,
  pe.created_at
FROM product_edits pe
LEFT JOIN products prod ON prod.id = pe.product_id
LEFT JOIN variants v ON v.id = pe.variant_id
LEFT JOIN profiles p ON p.id = pe.edited_by

UNION ALL

-- Courier Status Logs (system events, no actor metadata)
SELECT 
  csl.id::text AS id,
  'courier_status'::text AS event_type,
  'order'::text AS entity_type,
  csl.order_id::text AS entity_id,
  o.short_code::text AS entity_code,
  ('Courier: ' || COALESCE(csl.old_status, '') || ' → ' || COALESCE(csl.new_status, ''))::text AS summary,
  jsonb_build_object('courier_id', csl.courier_id, 'tracking_number', csl.tracking_number, 'old_status', csl.old_status, 'new_status', csl.new_status, 'courier_status', csl.courier_status) AS metadata,
  NULL::text AS actor_id,
  'system (courier)'::text AS actor_email,
  NULL::text AS actor_timezone,
  NULL::text AS ip_country,
  csl.created_at
FROM courier_status_logs csl
LEFT JOIN orders o ON o.id = csl.order_id

ORDER BY created_at DESC;

GRANT SELECT ON admin_audit_logs TO authenticated;
