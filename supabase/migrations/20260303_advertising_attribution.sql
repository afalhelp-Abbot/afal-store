-- ============================================
-- ADVERTISING ATTRIBUTION - PHASE 1 MIGRATION
-- ============================================
-- Version: 1.0
-- Date: 2026-03-03
-- Description: Sessions, LP Events, and Orders attribution tracking
-- 
-- Features:
-- - Session tracking with visitor_id for cross-session linkage
-- - LP events with dedupe and pixel diagnostics
-- - Orders attribution with dual capture (session + order-level)
-- - Indexes optimized for Attribution and Funnel reporting

-- ============================================
-- 1. SESSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Visitor tracking (cross-session linkage)
  -- NOT NULL enforced for data integrity; client must generate before session creation
  visitor_id TEXT NOT NULL,
  
  -- Entry context
  entry_product_id UUID REFERENCES products(id),
  entry_lp_slug TEXT,
  
  -- Attribution data
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  fbclid TEXT,
  fbc TEXT,
  fbp TEXT,
  referrer TEXT,
  
  -- Device/Geo
  user_agent TEXT,
  device_category TEXT,  -- 'mobile' | 'desktop' | 'tablet'
  geo_country TEXT,      -- from CF/Vercel headers, not raw IP
  geo_city TEXT,         -- best-effort, nullable
  
  -- Checkout behavior (aggregated)
  first_checkout_at TIMESTAMPTZ,
  checkout_open_count INT NOT NULL DEFAULT 0
);

-- Device category constraint (prevents junk values) - idempotent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_device_category_check'
  ) THEN
    ALTER TABLE sessions
    ADD CONSTRAINT sessions_device_category_check
    CHECK (device_category IN ('mobile', 'desktop', 'tablet') OR device_category IS NULL);
  END IF;
END $$;

-- Indexes for sessions
CREATE INDEX IF NOT EXISTS sessions_created_at_idx ON sessions(created_at);
CREATE INDEX IF NOT EXISTS sessions_visitor_created_idx ON sessions(visitor_id, created_at);
CREATE INDEX IF NOT EXISTS sessions_entry_product_idx ON sessions(entry_product_id);
CREATE INDEX IF NOT EXISTS sessions_utm_campaign_idx ON sessions(utm_campaign);

-- ============================================
-- 2. LP_EVENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS lp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,  -- for dedupe: {session_id}:{event_type} or {order_id}
  order_id UUID REFERENCES orders(id),
  
  -- Pixel diagnostics
  pixel_attempted_at TIMESTAMPTZ,
  pixel_loaded BOOLEAN,
  pixel_blocked_suspected BOOLEAN,
  pixel_error_code TEXT,  -- 'fbq_missing' | 'script_load_failed' | 'blocked_suspected' | null
  
  metadata JSONB,  -- max 2KB, whitelist keys only per event type
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT lp_events_event_id_unique UNIQUE (event_id),
  CONSTRAINT lp_events_event_type_check CHECK (event_type IN ('view_content', 'initiate_checkout', 'purchase'))
);

-- Indexes for lp_events
CREATE INDEX IF NOT EXISTS lp_events_session_created_idx ON lp_events(session_id, created_at);
CREATE INDEX IF NOT EXISTS lp_events_type_created_idx ON lp_events(event_type, created_at);

-- ============================================
-- 3. ORDERS TABLE ADDITIONS
-- ============================================
-- Only add columns that don't exist
-- Note: utm_source, utm_medium, utm_campaign already exist in orders table

-- Attribution link to session (ON DELETE SET NULL allows session purging without breaking orders)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS attribution_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL;

-- Additional UTM fields (utm_source/medium/campaign already exist)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS utm_content TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS utm_term TEXT;

-- Meta attribution cookies
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fbclid TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fbc TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fbp TEXT;

-- Referrer and entry context (fallback when session missing)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS referrer TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS entry_lp_slug TEXT;

-- Device info (fallback when session missing)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS device_category TEXT;

-- Tracking config snapshot for audits
-- Example: { "schema_version": 1, "pixel_enabled": true, "pixel_id": "...", "content_id_source": "sku", ... }
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_snapshot JSONB;

-- Device category constraint for orders (prevents junk values)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_device_category_check'
  ) THEN
    ALTER TABLE orders
    ADD CONSTRAINT orders_device_category_check
    CHECK (device_category IN ('mobile', 'desktop', 'tablet') OR device_category IS NULL);
  END IF;
END $$;

-- Indexes for orders (new)
CREATE INDEX IF NOT EXISTS orders_attribution_session_idx ON orders(attribution_session_id);
CREATE INDEX IF NOT EXISTS orders_utm_campaign_idx ON orders(utm_campaign);
CREATE INDEX IF NOT EXISTS orders_created_status_idx ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at);
CREATE INDEX IF NOT EXISTS orders_entry_lp_slug_idx ON orders(entry_lp_slug);

-- ============================================
-- 4. COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON TABLE sessions IS 'Tracks LP visits for attribution. Reuse within 30 min per visitor_id + entry_product_id.';
COMMENT ON TABLE lp_events IS 'Milestone events: view_content, initiate_checkout, purchase. Dedupe via event_id.';
COMMENT ON COLUMN sessions.visitor_id IS 'Anonymous UUID stored in localStorage. Required for cross-session linkage.';
COMMENT ON COLUMN orders.attribution_session_id IS 'Last-touch attribution. Links to session within 7-day window.';
COMMENT ON COLUMN orders.tracking_snapshot IS 'Pixel/GA4 config at order time. schema_version: 1';

-- ============================================
-- 5. ROW LEVEL SECURITY (RLS) FOR PUBLIC INSERTS
-- ============================================
-- Allow anonymous inserts but with validation constraints

-- Enable RLS on sessions
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow insert only with valid visitor_id (8-64 chars, prevents empty/huge payloads)
CREATE POLICY sessions_insert_policy ON sessions
  FOR INSERT
  WITH CHECK (
    visitor_id IS NOT NULL 
    AND length(visitor_id) >= 8 
    AND length(visitor_id) <= 64
    AND (entry_lp_slug IS NULL OR length(entry_lp_slug) <= 100)
    AND (utm_campaign IS NULL OR length(utm_campaign) <= 200)
    AND (utm_source IS NULL OR length(utm_source) <= 100)
    AND (utm_medium IS NULL OR length(utm_medium) <= 100)
    AND (referrer IS NULL OR length(referrer) <= 500)
  );

-- Policy: Allow select for authenticated users only (admin reads)
CREATE POLICY sessions_select_policy ON sessions
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy: Allow update for authenticated users only
CREATE POLICY sessions_update_policy ON sessions
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Enable RLS on lp_events
ALTER TABLE lp_events ENABLE ROW LEVEL SECURITY;

-- Policy: Allow insert with valid session_id and event_id
CREATE POLICY lp_events_insert_policy ON lp_events
  FOR INSERT
  WITH CHECK (
    session_id IS NOT NULL
    AND event_id IS NOT NULL
    AND length(event_id) >= 8
    AND length(event_id) <= 200
    AND event_type IN ('view_content', 'initiate_checkout', 'purchase')
    AND (metadata IS NULL OR length(metadata::text) <= 2000)
  );

-- Policy: Allow select for authenticated users only
CREATE POLICY lp_events_select_policy ON lp_events
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy: Allow update for authenticated users only (for upserts from server)
CREATE POLICY lp_events_update_policy ON lp_events
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- ============================================
-- 6. DATA RETENTION POLICY (Documentation)
-- ============================================
-- Recommended retention periods:
-- - sessions: 90-180 days (can be purged; orders.attribution_session_id will become NULL)
-- - lp_events: 90-180 days (cascades with sessions)
-- - orders attribution fields: permanent (part of order record)
-- - orders.tracking_snapshot: permanent (audit trail)
--
-- Note: user_agent and geo_city/geo_country are derived data, not raw PII.
-- No IP addresses are stored.

-- ============================================
-- END MIGRATION
-- ============================================
