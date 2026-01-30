-- Leopards Courier API Integration - Database Changes
-- Run this in Supabase SQL Editor

-- 1. Add 'delivered' to allowed order statuses
-- First drop existing constraint, then add new one with 'delivered'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('pending', 'packed', 'shipped', 'delivered', 'cancelled', 'return_in_transit', 'returned'));

-- 2. Add courier_booked_at timestamp to orders (tracks when CN was generated)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_booked_at timestamptz;

-- 3. Create courier_city_mappings table (scalable for multiple couriers)
CREATE TABLE IF NOT EXISTS courier_city_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id uuid REFERENCES couriers(id) NOT NULL,
  our_city_name text NOT NULL,
  courier_city_name text NOT NULL,
  courier_city_code text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (courier_id, our_city_name)
);

-- 4. Create courier_api_logs table for debugging and audit
CREATE TABLE IF NOT EXISTS courier_api_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id uuid REFERENCES couriers(id),
  order_id uuid REFERENCES orders(id),
  endpoint text,
  request_payload jsonb,
  response_payload jsonb,
  success boolean,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- 5. Create courier_status_logs table for tracking status changes from webhooks
CREATE TABLE IF NOT EXISTS courier_status_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id),
  courier_id uuid REFERENCES couriers(id),
  tracking_number text,
  old_status text,
  new_status text,
  courier_status text,
  raw_payload jsonb,
  created_at timestamptz DEFAULT now()
);

-- 6. Add api_type to couriers table to identify integration type
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS api_type text DEFAULT 'manual';
-- Values: 'manual', 'leopards', 'daewoo', 'tcs', etc.

-- 7. Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_orders_courier_tracking ON orders(courier_tracking_number) WHERE courier_tracking_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_courier_city_mappings_lookup ON courier_city_mappings(courier_id, our_city_name);
CREATE INDEX IF NOT EXISTS idx_courier_api_logs_order ON courier_api_logs(order_id);
