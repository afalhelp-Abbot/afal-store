-- Migration: Courier Sync Logs for Rate-Limit Guardrails
-- Tracks all sync operations for M&P and other courier APIs

-- 1. Create courier_sync_logs table
CREATE TABLE IF NOT EXISTS courier_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id uuid REFERENCES couriers(id) ON DELETE SET NULL,
  courier_api_type text NOT NULL,
  sync_type text NOT NULL, -- 'status_sync', 'payment_report', 'bulk_tracking'
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed', 'rate_limited'
  total_orders int DEFAULT 0,
  orders_updated int DEFAULT 0,
  api_calls_made int DEFAULT 0,
  errors jsonb,
  error_message text,
  triggered_by text, -- 'manual', 'scheduled', 'webhook'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courier_sync_logs_courier_id ON courier_sync_logs(courier_id);
CREATE INDEX IF NOT EXISTS idx_courier_sync_logs_started_at ON courier_sync_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_courier_sync_logs_status ON courier_sync_logs(status);

-- 2. Add last_sync_at to couriers table for rate limiting
ALTER TABLE couriers 
ADD COLUMN IF NOT EXISTS last_sync_at timestamptz,
ADD COLUMN IF NOT EXISTS sync_enabled boolean DEFAULT true;

-- 3. Create mnp_payment_records table to store payment report data
CREATE TABLE IF NOT EXISTS mnp_payment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id text NOT NULL,
  paid_on timestamptz NOT NULL,
  rr_amount numeric NOT NULL DEFAULT 0, -- COD collected
  invoice_amount numeric NOT NULL DEFAULT 0, -- Fees
  net_payable numeric NOT NULL DEFAULT 0, -- What we receive
  instrument_mode text, -- IBFT, Cheque, etc.
  instrument_number text, -- Bank transaction reference
  zone_name text,
  branch_name text,
  account_no text,
  date_from date,
  date_to date,
  raw_response jsonb, -- Store full API response for audit
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payment_id, paid_on)
);

CREATE INDEX IF NOT EXISTS idx_mnp_payment_records_paid_on ON mnp_payment_records(paid_on DESC);
CREATE INDEX IF NOT EXISTS idx_mnp_payment_records_synced_at ON mnp_payment_records(synced_at DESC);

COMMENT ON TABLE courier_sync_logs IS 'Audit log for all courier API sync operations';
COMMENT ON TABLE mnp_payment_records IS 'M&P payment/settlement records from Payment Report API';
