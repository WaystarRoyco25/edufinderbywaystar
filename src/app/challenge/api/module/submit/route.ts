import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type AnswerKeyRow = { id: string; a: string };

/**
 * Grades a user's answers for a module.
 * Authoritative answer comparison happens server-side; the client never
 * sees `correct_answer` until AFTER they submit.
 */
export async function POST(request: Request) {
  const authed = await createSupabaseServerClient();
  const { data: { user } } = await authed.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { module_id?: string; answers?: Record<string, string> }
    | null;

  if (!body?.module_id || typeof body.answers !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: mod, error: modErr } = await admin
    .from("modules")
    .select("id, user_id, answer_key, submitted_at")
    .eq("id", body.module_id)
    .single();

  if (modErr || !mod) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }
  if (mod.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (mod.submitted_at) {
    return NextResponse.json({ error: "Already submitted" }, { status: 409 });
  }

  const key = mod.answer_key as AnswerKeyRow[];
  const results = key.map(({ id, a }) => {
    const picked = body.answers?.[id] ?? null;
    return { id, correct_answer: a, picked_answer: picked, is_correct: picked === a };
  });

  const score = results.filter((r) => r.is_correct).length;

  const { error: updErr } = await admin
    .from("modules")
    .update({
      submitted_at: new Date().toISOString(),
      score,
      total: results.length,
      answers: body.answers,
    })
    .eq("id", mod.id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    score,
    total: results.length,
    results,
  });
}
