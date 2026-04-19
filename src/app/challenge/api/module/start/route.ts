import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { rollModuleBlueprint, type Difficulty, type TypeCode } from "@/lib/blueprint";

export const dynamic = "force-dynamic";

/**
 * Starts a new module for the authenticated user.
 * - Rolls a 27-slot blueprint.
 * - Picks one random question per slot from Supabase.
 * - Persists the (module, question_ids, correct answers) server-side.
 * - Returns questions to the client WITHOUT correct_answer.
 */
export async function POST(request: Request) {
  const authed = await createSupabaseServerClient();
  const { data: { user } } = await authed.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { difficulty?: Difficulty };
  const difficulty: Difficulty = body.difficulty === "harder" ? "harder" : "standard";

  const slots = rollModuleBlueprint();

  // Admin client to bypass RLS for reads of the question pool.
  const admin = createSupabaseAdminClient();

  const slotCounts = slots.reduce<Record<string, number>>((acc, c) => {
    acc[c] = (acc[c] ?? 0) + 1;
    return acc;
  }, {});

  const chosen: {
    id: string;
    question_type: string;
    passage: string;
    stem: string;
    choices: Record<string, string>;
    correct_answer: string;
  }[] = [];

  for (const [code, need] of Object.entries(slotCounts)) {
    const { data, error } = await admin
      .from("questions")
      .select("id, question_type, passage, stem, choices, correct_answer")
      .eq("difficulty", difficulty)
      .eq("question_type", code)
      .limit(200);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length < need) {
      return NextResponse.json(
        { error: `Not enough ${difficulty}/${code} questions (need ${need}, have ${data?.length ?? 0})` },
        { status: 500 },
      );
    }

    // Fisher–Yates shuffle, take `need`.
    const shuffled = [...data];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    chosen.push(...shuffled.slice(0, need));
  }

  // Shuffle overall order so types don't cluster.
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }

  // Persist the module server-side. Answer key lives only in DB / server memory.
  const answerKey = chosen.map((q) => ({ id: q.id, a: q.correct_answer }));
  const { data: moduleRow, error: moduleErr } = await admin
    .from("modules")
    .insert({
      user_id: user.id,
      difficulty,
      question_ids: chosen.map((q) => q.id),
      answer_key: answerKey,
    })
    .select("id")
    .single();

  if (moduleErr || !moduleRow) {
    return NextResponse.json(
      { error: moduleErr?.message ?? "Could not create module" },
      { status: 500 },
    );
  }

  // Strip correct_answer before returning to the client.
  const publicQuestions = chosen.map(({ correct_answer: _discard, ...safe }) => safe);

  return NextResponse.json({
    module_id: moduleRow.id,
    difficulty,
    slots: slots as TypeCode[],
    questions: publicQuestions,
  });
}
