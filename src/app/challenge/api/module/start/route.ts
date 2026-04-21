import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  rollModuleBlueprint,
  assignDifficultyMix,
  type Difficulty,
  type TypeCode,
} from "@/lib/blueprint";

export const dynamic = "force-dynamic";

// A 27-slot module is always a *mix* of the two pools.
//   - "standard" leaning = 20 standard + 7 harder  (module 1, easier module 2)
//   - "harder"   leaning = 20 harder  + 7 standard (adaptive-up module 2)
const HARD_COUNT_STANDARD_LEAN = 7;
const HARD_COUNT_HARDER_LEAN = 20;
// ≥ 60% correct on module 1 routes the user into the harder module 2.
const ADAPTIVE_THRESHOLD = 0.6;

type Question = {
  id: string;
  question_type: string;
  passage: string;
  stem: string;
  choices: Record<string, string>;
  correct_answer: string;
};

type PairKey = `${TypeCode}|${Difficulty}`;
const pairKey = (t: TypeCode, d: Difficulty): PairKey => `${t}|${d}` as PairKey;

/**
 * Starts a module for the authenticated user.
 *
 * Call shape:
 *   POST {}                                 → module 1 of a fresh exam
 *   POST { parent_module_id: "<m1 id>" }    → module 2 (adaptive)
 *
 * For module 2, leaning is decided from module 1's score and all 27
 * question IDs from module 1 are excluded from the pool so the full
 * 54-question exam has no overlap.
 */
export async function POST(request: Request) {
  const authed = await createSupabaseServerClient();
  const { data: { user } } = await authed.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    parent_module_id?: string;
  };

  const admin = createSupabaseAdminClient();

  // --- Resolve module context ---------------------------------------------
  let parentQuestionIds: string[] = [];
  let parentModuleId: string | null = null;
  let moduleNumber: 1 | 2 = 1;
  let overallDifficulty: Difficulty = "standard";

  if (body.parent_module_id) {
    const { data: parent, error: parentErr } = await admin
      .from("modules")
      .select("id, user_id, question_ids, submitted_at, module_number, score, total")
      .eq("id", body.parent_module_id)
      .single();
    if (parentErr || !parent) {
      return NextResponse.json({ error: "Parent module not found" }, { status: 404 });
    }
    if (parent.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!parent.submitted_at) {
      return NextResponse.json({ error: "Parent module not yet submitted" }, { status: 409 });
    }
    if (parent.module_number !== 1) {
      return NextResponse.json({ error: "Parent is not module 1" }, { status: 400 });
    }

    const { data: existing } = await admin
      .from("modules")
      .select("id")
      .eq("parent_module_id", parent.id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "Module 2 already exists for this exam", existing_module_id: existing.id },
        { status: 409 },
      );
    }

    parentModuleId = parent.id;
    parentQuestionIds = (parent.question_ids ?? []) as string[];
    moduleNumber = 2;
    const score = parent.score ?? 0;
    const total = parent.total ?? 1;
    overallDifficulty = score / total >= ADAPTIVE_THRESHOLD ? "harder" : "standard";
  }

  const hardCount =
    overallDifficulty === "harder" ? HARD_COUNT_HARDER_LEAN : HARD_COUNT_STANDARD_LEAN;

  // --- Roll blueprint + per-slot difficulty -------------------------------
  const slots = rollModuleBlueprint();
  const mix = assignDifficultyMix(slots, hardCount);

  // Aggregate demand per (type, difficulty) pair.
  const demand: Partial<Record<PairKey, number>> = {};
  for (let i = 0; i < slots.length; i++) {
    const k = pairKey(slots[i], mix[i]);
    demand[k] = (demand[k] ?? 0) + 1;
  }

  // --- Draw from each pool, excluding module 1's ids ----------------------
  const excludeIds = new Set<string>(parentQuestionIds);
  const picks: Partial<Record<PairKey, Question[]>> = {};

  for (const key of Object.keys(demand) as PairKey[]) {
    const [code, diff] = key.split("|") as [TypeCode, Difficulty];
    const need = demand[key]!;

    const { data, error } = await admin
      .from("questions")
      .select("id, question_type, passage, stem, choices, correct_answer")
      .eq("difficulty", diff)
      .eq("question_type", code)
      .limit(500);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const available = (data ?? []).filter((q) => !excludeIds.has(q.id));
    if (available.length < need) {
      return NextResponse.json(
        {
          error: `Not enough ${diff}/${code} questions (need ${need}, have ${available.length} after exclusions)`,
        },
        { status: 500 },
      );
    }

    // Fisher–Yates shuffle, take `need`.
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    const taken = available.slice(0, need);
    picks[key] = taken;
    for (const q of taken) excludeIds.add(q.id);
  }

  // Walk the blueprint in order and pop one question per slot from the
  // matching pair's bucket.
  const chosen: Question[] = [];
  const cursor: Partial<Record<PairKey, number>> = {};
  for (let i = 0; i < slots.length; i++) {
    const key = pairKey(slots[i], mix[i]);
    const idx = cursor[key] ?? 0;
    chosen.push(picks[key]![idx]);
    cursor[key] = idx + 1;
  }

  // Shuffle final order so types/difficulties don't cluster.
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }

  // --- Persist -------------------------------------------------------------
  const answerKey = chosen.map((q) => ({ id: q.id, a: q.correct_answer }));
  const { data: moduleRow, error: moduleErr } = await admin
    .from("modules")
    .insert({
      user_id: user.id,
      difficulty: overallDifficulty,
      question_ids: chosen.map((q) => q.id),
      answer_key: answerKey,
      parent_module_id: parentModuleId,
      module_number: moduleNumber,
    })
    .select("id")
    .single();

  if (moduleErr || !moduleRow) {
    return NextResponse.json(
      { error: moduleErr?.message ?? "Could not create module" },
      { status: 500 },
    );
  }

  const publicQuestions = chosen.map(({ correct_answer: _discard, ...safe }) => safe);

  return NextResponse.json({
    module_id: moduleRow.id,
    difficulty: overallDifficulty,
    module_number: moduleNumber,
    parent_module_id: parentModuleId,
    slots: slots as TypeCode[],
    questions: publicQuestions,
  });
}
