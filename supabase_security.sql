-- =======================================================================
-- SAT Factory — Supabase security setup
-- Run this in the Supabase SQL editor AFTER you've created the `questions`
-- table and uploaded the pool.
--
-- What this does:
--   1. Creates a `modules` table to record attempts.
--   2. Enables Row Level Security (RLS) on both tables.
--   3. Locks down `questions` so users cannot read correct_answer or
--      explanations directly — that data is only visible to your server
--      (service role) when grading.
--   4. Users can only see THEIR OWN modules.
-- =======================================================================

-- --- MODULES TABLE ------------------------------------------------------
CREATE TABLE IF NOT EXISTS modules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('standard', 'harder')),
    question_ids UUID[] NOT NULL,
    answer_key JSONB NOT NULL,
    answers JSONB,
    score INT,
    total INT,
    submitted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS modules_user_id_idx ON modules(user_id);

-- --- ROW LEVEL SECURITY -------------------------------------------------
-- `questions`: deny all client access; only the service role (your server)
-- can read the full row including correct_answer + explanations.
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "no client read" ON questions;
-- No SELECT policy == no rows visible to anon/authenticated. The service
-- role bypasses RLS entirely, which is what our /api routes use.

-- `modules`: users can read and insert their own rows only.
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "modules select own" ON modules;
CREATE POLICY "modules select own" ON modules
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "modules insert own" ON modules;
CREATE POLICY "modules insert own" ON modules
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Updates + deletes: block clients entirely. Server (service role) handles
-- the grading write, so no client-side write policy is needed.
DROP POLICY IF EXISTS "modules update own" ON modules;
DROP POLICY IF EXISTS "modules delete own" ON modules;
