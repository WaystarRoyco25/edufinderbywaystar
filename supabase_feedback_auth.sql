-- EduFinder feedback account capture.
-- Run this in the Supabase SQL editor before relying on account-tied
-- inquiries in production.

CREATE TABLE IF NOT EXISTS public.feedback (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    message TEXT NOT NULL
);

ALTER TABLE public.feedback
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS user_email TEXT;

CREATE INDEX IF NOT EXISTS feedback_user_id_idx
    ON public.feedback(user_id);

CREATE OR REPLACE FUNCTION public.set_feedback_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.user_id := auth.uid();
    NEW.user_email := auth.jwt() ->> 'email';
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_feedback_account ON public.feedback;
CREATE TRIGGER set_feedback_account
    BEFORE INSERT ON public.feedback
    FOR EACH ROW
    EXECUTE FUNCTION public.set_feedback_account();

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feedback insert authenticated" ON public.feedback;
CREATE POLICY "feedback insert authenticated"
    ON public.feedback
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.feedback FROM anon, authenticated;
GRANT INSERT ON public.feedback TO authenticated;

-- Homepage review counters read only aggregate vote totals from school_stats.
-- Keep this aggregate relation readable to signed-out visitors.
GRANT SELECT ON public.school_stats TO anon, authenticated;
