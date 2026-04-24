-- =======================================================================
-- SAT Factory - Supabase security setup
-- Run this in the Supabase SQL editor after creating/uploading `questions`.
--
-- Security model:
--   1. The Next.js server, using the service-role key, owns all module
--      creation, progress writes, grading, and review reads.
--   2. Browser clients never read `questions`, `modules`, or answer keys
--      directly through the public Supabase key.
--   3. Answer keys live in `module_answer_keys`, separate from the attempt
--      metadata table, with no client RLS policies.
-- =======================================================================

-- --- MODULES TABLE ------------------------------------------------------
CREATE TABLE IF NOT EXISTS modules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('standard', 'harder')),
    question_ids UUID[] NOT NULL,
    answers JSONB DEFAULT '{}'::jsonb,
    score INT,
    total INT,
    submitted_at TIMESTAMPTZ,
    parent_module_id UUID REFERENCES modules(id) ON DELETE SET NULL,
    module_number INT NOT NULL DEFAULT 1 CHECK (module_number IN (1, 2)),
    expires_at TIMESTAMPTZ,
    current_index INT DEFAULT 0
);

ALTER TABLE modules
    ADD COLUMN IF NOT EXISTS answers JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS parent_module_id UUID REFERENCES modules(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS module_number INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS current_index INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS modules_user_id_idx ON modules(user_id);
CREATE INDEX IF NOT EXISTS modules_parent_module_id_idx ON modules(parent_module_id);

-- --- ANSWER KEYS --------------------------------------------------------
CREATE TABLE IF NOT EXISTS module_answer_keys (
    module_id UUID PRIMARY KEY REFERENCES modules(id) ON DELETE CASCADE,
    answer_key JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Migrate existing answer keys out of `modules` before dropping the column.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'modules'
          AND column_name = 'answer_key'
    ) THEN
        INSERT INTO module_answer_keys (module_id, answer_key)
        SELECT id, answer_key
        FROM modules
        WHERE answer_key IS NOT NULL
        ON CONFLICT (module_id) DO UPDATE
            SET answer_key = EXCLUDED.answer_key;

        ALTER TABLE modules DROP COLUMN answer_key;
    END IF;
END $$;

-- --- ROW LEVEL SECURITY -------------------------------------------------
-- `questions`: deny all client access. The service role bypasses RLS and is
-- the only path used by the Next.js API routes for question and answer data.
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "no client read" ON questions;

-- `modules`: deny direct browser reads/writes. Server routes fetch a user's
-- own rows with the service-role key after checking the authenticated user.
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "modules select own" ON modules;
DROP POLICY IF EXISTS "modules insert own" ON modules;
DROP POLICY IF EXISTS "modules update own" ON modules;
DROP POLICY IF EXISTS "modules delete own" ON modules;
REVOKE ALL ON modules FROM anon, authenticated;

-- `module_answer_keys`: no anon/authenticated grants and no client policies.
ALTER TABLE module_answer_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "module answer keys select own" ON module_answer_keys;
DROP POLICY IF EXISTS "module answer keys insert own" ON module_answer_keys;
DROP POLICY IF EXISTS "module answer keys update own" ON module_answer_keys;
DROP POLICY IF EXISTS "module answer keys delete own" ON module_answer_keys;
REVOKE ALL ON module_answer_keys FROM anon, authenticated;
