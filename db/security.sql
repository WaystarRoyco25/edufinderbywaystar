-- =======================================================================
-- SAT Factory - Supabase security setup
-- Run this in the Supabase SQL editor after creating/uploading `questions`.
--
-- Security model:
--   1. The Next.js server, using the service-role key, owns all module
--      creation, progress writes, grading, review reads, and prediction
--      report draft writes.
--   2. Browser clients never read `questions`, `modules`, report drafts, or
--      answer keys directly through the public Supabase key.
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

-- --- PREDICTION REPORT DRAFTS ------------------------------------------
CREATE TABLE IF NOT EXISTS prediction_report_drafts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
    submitted_at TIMESTAMPTZ
);

ALTER TABLE prediction_report_drafts
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'prediction_report_drafts'
          AND constraint_name = 'prediction_report_drafts_status_check'
    ) THEN
        ALTER TABLE prediction_report_drafts
            ADD CONSTRAINT prediction_report_drafts_status_check
            CHECK (status IN ('draft', 'submitted'));
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS prediction_report_drafts_user_id_idx
    ON prediction_report_drafts(user_id);

-- --- PREDICTION REPORTS -------------------------------------------------
CREATE TABLE IF NOT EXISTS prediction_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    draft_id UUID NOT NULL REFERENCES prediction_report_drafts(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'needs_review')),
    applicant_profile JSONB,
    report_json JSONB,
    verification_json JSONB,
    model_usage JSONB,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

ALTER TABLE prediction_reports
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS draft_id UUID REFERENCES prediction_report_drafts(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'queued',
    ADD COLUMN IF NOT EXISTS applicant_profile JSONB,
    ADD COLUMN IF NOT EXISTS report_json JSONB,
    ADD COLUMN IF NOT EXISTS verification_json JSONB,
    ADD COLUMN IF NOT EXISTS model_usage JSONB,
    ADD COLUMN IF NOT EXISTS error_message TEXT,
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'prediction_reports'
          AND constraint_name = 'prediction_reports_status_check'
    ) THEN
        ALTER TABLE prediction_reports
            ADD CONSTRAINT prediction_reports_status_check
            CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'needs_review'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS prediction_reports_user_id_idx
    ON prediction_reports(user_id);
CREATE INDEX IF NOT EXISTS prediction_reports_draft_id_idx
    ON prediction_reports(draft_id);
CREATE INDEX IF NOT EXISTS prediction_reports_status_created_at_idx
    ON prediction_reports(status, created_at);

CREATE TABLE IF NOT EXISTS prediction_report_evidence (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    report_id UUID NOT NULL REFERENCES prediction_reports(id) ON DELETE CASCADE,
    evidence_key TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('google', 'reddit', 'x')),
    school TEXT NOT NULL,
    cycle TEXT,
    outcome TEXT,
    round TEXT,
    program TEXT,
    applicant_facts JSONB NOT NULL DEFAULT '{}'::jsonb,
    quote_excerpt TEXT NOT NULL,
    url TEXT NOT NULL,
    retrieved_at TIMESTAMPTZ NOT NULL,
    credibility_score NUMERIC,
    model_id TEXT,
    raw JSONB
);

ALTER TABLE prediction_report_evidence
    ADD COLUMN IF NOT EXISTS evidence_key TEXT,
    ADD COLUMN IF NOT EXISTS source_type TEXT,
    ADD COLUMN IF NOT EXISTS school TEXT,
    ADD COLUMN IF NOT EXISTS cycle TEXT,
    ADD COLUMN IF NOT EXISTS outcome TEXT,
    ADD COLUMN IF NOT EXISTS round TEXT,
    ADD COLUMN IF NOT EXISTS program TEXT,
    ADD COLUMN IF NOT EXISTS applicant_facts JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS quote_excerpt TEXT,
    ADD COLUMN IF NOT EXISTS url TEXT,
    ADD COLUMN IF NOT EXISTS retrieved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS credibility_score NUMERIC,
    ADD COLUMN IF NOT EXISTS model_id TEXT,
    ADD COLUMN IF NOT EXISTS raw JSONB;

CREATE INDEX IF NOT EXISTS prediction_report_evidence_report_id_idx
    ON prediction_report_evidence(report_id);
CREATE INDEX IF NOT EXISTS prediction_report_evidence_school_idx
    ON prediction_report_evidence(school);

-- --- GENIUS EDITOR DRAFTS ----------------------------------------------
CREATE TABLE IF NOT EXISTS genius_editor_drafts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE genius_editor_drafts
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS genius_editor_drafts_user_id_idx
    ON genius_editor_drafts(user_id);

-- --- GENIUS AI BOARDS ---------------------------------------------------
CREATE TABLE IF NOT EXISTS genius_editor_boards (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    draft_id UUID NOT NULL REFERENCES genius_editor_drafts(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'needs_review')),
    input_hash TEXT NOT NULL,
    signal_profile JSONB,
    board_json JSONB,
    verification_json JSONB,
    model_usage JSONB,
    feedback_json JSONB,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

ALTER TABLE genius_editor_boards
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS draft_id UUID REFERENCES genius_editor_drafts(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'queued',
    ADD COLUMN IF NOT EXISTS input_hash TEXT,
    ADD COLUMN IF NOT EXISTS signal_profile JSONB,
    ADD COLUMN IF NOT EXISTS board_json JSONB,
    ADD COLUMN IF NOT EXISTS verification_json JSONB,
    ADD COLUMN IF NOT EXISTS model_usage JSONB,
    ADD COLUMN IF NOT EXISTS feedback_json JSONB,
    ADD COLUMN IF NOT EXISTS error_message TEXT,
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'genius_editor_boards'
          AND constraint_name = 'genius_editor_boards_status_check'
    ) THEN
        ALTER TABLE genius_editor_boards
            ADD CONSTRAINT genius_editor_boards_status_check
            CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'needs_review'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS genius_editor_boards_user_id_idx
    ON genius_editor_boards(user_id);
CREATE INDEX IF NOT EXISTS genius_editor_boards_draft_id_idx
    ON genius_editor_boards(draft_id);
CREATE INDEX IF NOT EXISTS genius_editor_boards_status_created_at_idx
    ON genius_editor_boards(status, created_at);
CREATE INDEX IF NOT EXISTS genius_editor_boards_input_hash_idx
    ON genius_editor_boards(draft_id, input_hash);

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

-- `prediction_report_drafts`: server routes own draft reads/writes with the
-- service-role key after checking the authenticated user.
ALTER TABLE prediction_report_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prediction drafts select own" ON prediction_report_drafts;
DROP POLICY IF EXISTS "prediction drafts insert own" ON prediction_report_drafts;
DROP POLICY IF EXISTS "prediction drafts update own" ON prediction_report_drafts;
DROP POLICY IF EXISTS "prediction drafts delete own" ON prediction_report_drafts;
REVOKE ALL ON prediction_report_drafts FROM anon, authenticated;

-- `prediction_reports` and `prediction_report_evidence`: server routes and
-- worker use the service-role key after checking ownership or worker secret.
ALTER TABLE prediction_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prediction reports select own" ON prediction_reports;
DROP POLICY IF EXISTS "prediction reports insert own" ON prediction_reports;
DROP POLICY IF EXISTS "prediction reports update own" ON prediction_reports;
DROP POLICY IF EXISTS "prediction reports delete own" ON prediction_reports;
REVOKE ALL ON prediction_reports FROM anon, authenticated;

ALTER TABLE prediction_report_evidence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prediction evidence select own" ON prediction_report_evidence;
DROP POLICY IF EXISTS "prediction evidence insert own" ON prediction_report_evidence;
DROP POLICY IF EXISTS "prediction evidence update own" ON prediction_report_evidence;
DROP POLICY IF EXISTS "prediction evidence delete own" ON prediction_report_evidence;
REVOKE ALL ON prediction_report_evidence FROM anon, authenticated;

-- `genius_editor_drafts`: server routes own draft reads/writes with the
-- service-role key after checking the authenticated user.
ALTER TABLE genius_editor_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "genius drafts select own" ON genius_editor_drafts;
DROP POLICY IF EXISTS "genius drafts insert own" ON genius_editor_drafts;
DROP POLICY IF EXISTS "genius drafts update own" ON genius_editor_drafts;
DROP POLICY IF EXISTS "genius drafts delete own" ON genius_editor_drafts;
REVOKE ALL ON genius_editor_drafts FROM anon, authenticated;

-- `genius_editor_boards`: server routes and worker use the service-role key
-- after checking ownership or worker secret.
ALTER TABLE genius_editor_boards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "genius boards select own" ON genius_editor_boards;
DROP POLICY IF EXISTS "genius boards insert own" ON genius_editor_boards;
DROP POLICY IF EXISTS "genius boards update own" ON genius_editor_boards;
DROP POLICY IF EXISTS "genius boards delete own" ON genius_editor_boards;
REVOKE ALL ON genius_editor_boards FROM anon, authenticated;
