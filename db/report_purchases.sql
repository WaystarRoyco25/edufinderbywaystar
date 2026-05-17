-- =======================================================================
-- EduFinder Insight! Report - report_purchases table
-- Run this in the Supabase SQL editor after `security.sql`.
--
-- Records each completed PayPal purchase of an Insight! Report. The
-- Next.js server, using the service-role key, is the only writer; it
-- inserts a row only after it has captured the payment with the PayPal
-- Orders v2 API.
--
-- One purchase unlocks one report. A row whose `consumed_at` is still NULL
-- is an unused report credit; generating a report stamps `consumed_at`, so
-- the same credit cannot be spent twice. Scrapping a report never clears
-- `consumed_at`, so starting over always requires a new purchase.
--
-- This script is idempotent and safe to re-run.
-- =======================================================================

-- --- REPORT PURCHASES TABLE --------------------------------------------
CREATE TABLE IF NOT EXISTS report_purchases (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount_value NUMERIC(10, 2) NOT NULL,
    amount_currency TEXT NOT NULL DEFAULT 'USD',
    paypal_order_id TEXT NOT NULL,
    paypal_capture_id TEXT,
    consumed_at TIMESTAMPTZ,
    -- The report this credit paid for. Deliberately carries no foreign key:
    -- scrapping a report deletes the prediction_reports row, but the credit
    -- must stay spent, so this id may point at an already-deleted report.
    consumed_report_id UUID
);

ALTER TABLE report_purchases
    ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS consumed_report_id UUID;

CREATE INDEX IF NOT EXISTS report_purchases_user_id_idx
    ON report_purchases(user_id);

-- One row per PayPal order. The capture route relies on this uniqueness so
-- a retried or double-fired capture cannot grant the same credit twice.
CREATE UNIQUE INDEX IF NOT EXISTS report_purchases_paypal_order_id_idx
    ON report_purchases(paypal_order_id);

-- --- ROW LEVEL SECURITY -------------------------------------------------
-- `report_purchases`: deny direct browser reads/writes. The Next.js server
-- reads and writes rows with the service-role key after verifying the
-- PayPal capture against the authenticated user.
ALTER TABLE report_purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "report purchases select own" ON report_purchases;
DROP POLICY IF EXISTS "report purchases insert own" ON report_purchases;
DROP POLICY IF EXISTS "report purchases update own" ON report_purchases;
DROP POLICY IF EXISTS "report purchases delete own" ON report_purchases;
REVOKE ALL ON report_purchases FROM anon, authenticated;
