-- =======================================================================
-- EduFinder Challenge! Series - purchases table
-- Run this in the Supabase SQL editor after `security.sql`.
--
-- Records each completed PayPal purchase of a Challenge! Series practice
-- test package. The Next.js server, using the service-role key, is the
-- only writer; it inserts a row only after it has captured the payment
-- with the PayPal Orders v2 API. The dashboard sums `tests_granted` per
-- user to show how many practice tests are still available.
--
-- This script is idempotent and safe to re-run.
-- =======================================================================

-- --- PURCHASES TABLE ----------------------------------------------------
CREATE TABLE IF NOT EXISTS purchases (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    package TEXT NOT NULL CHECK (package IN ('three', 'five')),
    tests_granted INT NOT NULL CHECK (tests_granted > 0),
    amount_value NUMERIC(10, 2) NOT NULL,
    amount_currency TEXT NOT NULL DEFAULT 'USD',
    paypal_order_id TEXT NOT NULL,
    paypal_capture_id TEXT
);

CREATE INDEX IF NOT EXISTS purchases_user_id_idx ON purchases(user_id);

-- One row per PayPal order. The capture route relies on this uniqueness so
-- a retried or double-fired capture cannot grant the same tests twice.
CREATE UNIQUE INDEX IF NOT EXISTS purchases_paypal_order_id_idx
    ON purchases(paypal_order_id);

-- --- ROW LEVEL SECURITY -------------------------------------------------
-- `purchases`: deny direct browser reads/writes. The Next.js server reads
-- and writes rows with the service-role key after verifying the PayPal
-- capture against the authenticated user.
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "purchases select own" ON purchases;
DROP POLICY IF EXISTS "purchases insert own" ON purchases;
DROP POLICY IF EXISTS "purchases update own" ON purchases;
DROP POLICY IF EXISTS "purchases delete own" ON purchases;
REVOKE ALL ON purchases FROM anon, authenticated;
