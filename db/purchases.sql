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

-- --- ATOMIC MODULE-1 CLAIM ----------------------------------------------
-- Creates module 1 of a new exam ONLY when the buyer still has an unused
-- practice test, with no check-then-insert race.
--
-- "Tests used" is COUNT(modules WHERE module_number = 1); "tests purchased"
-- is SUM(purchases.tests_granted). There is no per-credit row to flip
-- atomically, so a transaction-scoped advisory lock keyed by the user
-- serializes every concurrent module-1 creation for that one user: the
-- COUNT < SUM re-check and the INSERT happen as one indivisible step.
-- Different users never contend (distinct lock keys).
--
-- Returns the new modules.id, or NULL when no test is available. The caller
-- (the Next.js server, service role) selects questions and inserts the
-- answer key; only the gated row insert lives here.
--
-- Idempotent (CREATE OR REPLACE). Safe to re-run.
CREATE OR REPLACE FUNCTION public.claim_challenge_module_one(
    p_user_id       UUID,
    p_difficulty    TEXT,
    p_question_ids  UUID[],
    p_expires_at    TIMESTAMPTZ,
    p_current_index INT DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_used      INT;
    v_purchased INT;
    v_new_id    UUID;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('challenge_m1:' || p_user_id::text));

    SELECT count(*) INTO v_used
      FROM modules
     WHERE user_id = p_user_id
       AND module_number = 1;

    SELECT COALESCE(sum(tests_granted), 0) INTO v_purchased
      FROM purchases
     WHERE user_id = p_user_id;

    IF v_used >= v_purchased THEN
        RETURN NULL;
    END IF;

    INSERT INTO modules (
        user_id, difficulty, question_ids, parent_module_id,
        module_number, expires_at, current_index, answers
    )
    VALUES (
        p_user_id, p_difficulty, p_question_ids, NULL,
        1, p_expires_at, p_current_index, '{}'::jsonb
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_challenge_module_one(
    UUID, TEXT, UUID[], TIMESTAMPTZ, INT) FROM anon, authenticated;
