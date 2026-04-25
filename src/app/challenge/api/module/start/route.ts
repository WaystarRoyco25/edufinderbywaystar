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
// Hard 32-minute cap per module. Stored on the module row as expires_at
// so the clock keeps ticking even while the user is signed out.
const MODULE_DURATION_MS = 32 * 60 * 1000;

type PublicQuestion = {
  id: string;
  question_type: string;
  passage: string;
  stem: string;
  choices: Record<string, string>;
  // v2 structural extras — null/undefined for legacy archive rows.
  table_json: unknown;
  underlined_text: string | null;
  text_1: string | null;
  text_2: string | null;
  highlighted_word: string | null;
  notes_bullets: string[] | null;
};

type FullQuestion = PublicQuestion & { correct_answer: string };

type AnswerKeyRow = { id: string; a: string };

type ModuleRow = {
  id: string;
  user_id: string;
  difficulty: string;
  module_number: number;
  parent_module_id: string | null;
  question_ids: string[];
  answers: unknown;
  score: number | null;
  total: number | null;
  submitted_at: string | null;
  expires_at: string | null;
  current_index: number | null;
};

type TakingResponse = {
  kind: "taking";
  module_id: string;
  difficulty: Difficulty;
  module_number: 1 | 2;
  parent_module_id: string | null;
  questions: PublicQuestion[];
  expires_at: string;
  current_index: number;
  answers: Record<string, string>;
};

type SubmittedResponse = {
  kind: "submitted";
  module_id: string;
  module_number: 1 | 2;
  parent_module_id: string | null;
  score: number;
  total: number;
  reason: "already_submitted" | "auto_submitted_on_resume";
};

type PairKey = `${TypeCode}|${Difficulty}`;
const pairKey = (t: TypeCode, d: Difficulty): PairKey => `${t}|${d}` as PairKey;

type Admin = ReturnType<typeof createSupabaseAdminClient>;
type RouteError = { error: string; status: number };

async function loadAnswerKey(
  admin: Admin,
  moduleId: string,
): Promise<AnswerKeyRow[] | RouteError> {
  const { data, error } = await admin
    .from("module_answer_keys")
    .select("answer_key")
    .eq("module_id", moduleId)
    .single();

  if (error || !data || !Array.isArray(data.answer_key)) {
    return { error: "Answer key unavailable", status: 500 };
  }

  return data.answer_key.filter(
    (row): row is AnswerKeyRow =>
      !!row &&
      typeof row === "object" &&
      typeof (row as AnswerKeyRow).id === "string" &&
      typeof (row as AnswerKeyRow).a === "string",
  );
}

// Grades an expired unsubmitted module using only the answers the client
// managed to save before abandoning. Called the next time the owner tries
// to resume it.
async function finalizeExpiredModule(
  admin: Admin,
  mod: ModuleRow,
): Promise<SubmittedResponse | RouteError> {
  const key = await loadAnswerKey(admin, mod.id);
  if ("error" in key) return key;

  const stored = (mod.answers as Record<string, string> | null) ?? {};
  const score = key.filter(({ id, a }) => stored[id] === a).length;
  const total = key.length;

  const { error: updateErr } = await admin
    .from("modules")
    .update({
      submitted_at: new Date().toISOString(),
      score,
      total,
    })
    .eq("id", mod.id);
  if (updateErr) return { error: updateErr.message, status: 500 };

  return {
    kind: "submitted",
    module_id: mod.id,
    module_number: mod.module_number as 1 | 2,
    parent_module_id: mod.parent_module_id,
    score,
    total,
    reason: "auto_submitted_on_resume",
  };
}

// Converts a stored module row into the shape the client needs to keep
// taking it — or finalizes it if the 32-minute window has already closed.
async function resumeExistingModule(
  admin: Admin,
  mod: ModuleRow,
): Promise<TakingResponse | SubmittedResponse | { error: string; status: number }> {
  if (mod.submitted_at) {
    return {
      kind: "submitted",
      module_id: mod.id,
      module_number: mod.module_number as 1 | 2,
      parent_module_id: mod.parent_module_id,
      score: mod.score ?? 0,
      total: mod.total ?? 0,
      reason: "already_submitted",
    };
  }

  let expiresAt = mod.expires_at ? new Date(mod.expires_at) : null;
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    return finalizeExpiredModule(admin, mod);
  }

  // Legacy rows written before the migration can have null expires_at. If we
  // just synthesize one per request, the 32-minute window keeps restarting
  // on every refresh — which is exactly the "timer resets" symptom. Persist
  // it once so all future resumes see the same deadline.
  if (!expiresAt) {
    expiresAt = new Date(Date.now() + MODULE_DURATION_MS);
    const { error: backfillErr } = await admin
      .from("modules")
      .update({ expires_at: expiresAt.toISOString() })
      .eq("id", mod.id);
    if (backfillErr) return { error: backfillErr.message, status: 500 };
  }

  const { data: rawQs, error: qErr } = await admin
    .from("questions")
    .select(
      "id, question_type, passage, stem, choices, table_json, underlined_text, text_1, text_2, highlighted_word, notes_bullets"
    )
    .in("id", mod.question_ids);
  if (qErr) return { error: qErr.message, status: 500 };

  const byId = new Map((rawQs ?? []).map((q) => [q.id as string, q as PublicQuestion]));
  const orderedQuestions = mod.question_ids
    .map((id) => byId.get(id))
    .filter((q): q is PublicQuestion => !!q);

  return {
    kind: "taking",
    module_id: mod.id,
    difficulty: mod.difficulty as Difficulty,
    module_number: mod.module_number as 1 | 2,
    parent_module_id: mod.parent_module_id,
    questions: orderedQuestions,
    expires_at: expiresAt.toISOString(),
    current_index: mod.current_index ?? 0,
    answers: (mod.answers as Record<string, string> | null) ?? {},
  };
}

// Fresh module: roll blueprint, draw questions from the pools (excluding
// anything the parent module already used), persist the row.
async function createNewModule(
  admin: Admin,
  userId: string,
  parentModuleId: string | null,
  overallDifficulty: Difficulty,
  moduleNumber: 1 | 2,
  excludeQuestionIds: string[],
): Promise<TakingResponse | { error: string; status: number }> {
  const hardCount =
    overallDifficulty === "harder" ? HARD_COUNT_HARDER_LEAN : HARD_COUNT_STANDARD_LEAN;

  const slots = rollModuleBlueprint();
  const mix = assignDifficultyMix(slots, hardCount);

  const demand: Partial<Record<PairKey, number>> = {};
  for (let i = 0; i < slots.length; i++) {
    const k = pairKey(slots[i], mix[i]);
    demand[k] = (demand[k] ?? 0) + 1;
  }

  const excludeIds = new Set<string>(excludeQuestionIds);
  const picks: Partial<Record<PairKey, FullQuestion[]>> = {};

  for (const key of Object.keys(demand) as PairKey[]) {
    const [code, diff] = key.split("|") as [TypeCode, Difficulty];
    const need = demand[key]!;

    // First pass: just the IDs for this (type, difficulty) bucket. We used
    // to pull `passage`+`stem`+`choices` for up to 500 rows per bucket on
    // every module start — fine at ~1k questions, wasteful once the pool
    // grows. Fetching only `id` keeps this light even for very large pools.
    const { data: idRows, error: idErr } = await admin
      .from("questions")
      .select("id")
      .eq("difficulty", diff)
      .eq("question_type", code);
    if (idErr) return { error: idErr.message, status: 500 };

    const availableIds = ((idRows as { id: string }[]) ?? [])
      .map((r) => r.id)
      .filter((id) => !excludeIds.has(id));
    if (availableIds.length < need) {
      return {
        error: `Not enough ${diff}/${code} questions (need ${need}, have ${availableIds.length} after exclusions)`,
        status: 500,
      };
    }

    // Partial Fisher–Yates: we only need `need` winners, so shuffle the
    // last `need` positions into place and stop — O(need) instead of
    // O(pool) — then fetch the full rows for just the winners.
    const pickCount = Math.min(need, availableIds.length);
    for (let i = availableIds.length - 1; i >= availableIds.length - pickCount; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availableIds[i], availableIds[j]] = [availableIds[j], availableIds[i]];
    }
    const winnerIds = availableIds.slice(availableIds.length - pickCount);

    const { data: winnerRows, error: winnerErr } = await admin
      .from("questions")
      .select(
        "id, question_type, passage, stem, choices, correct_answer, table_json, underlined_text, text_1, text_2, highlighted_word, notes_bullets"
      )
      .in("id", winnerIds);
    if (winnerErr) return { error: winnerErr.message, status: 500 };

    const byWinnerId = new Map(
      ((winnerRows as FullQuestion[]) ?? []).map((q) => [q.id, q]),
    );
    const taken = winnerIds
      .map((id) => byWinnerId.get(id))
      .filter((q): q is FullQuestion => !!q);
    if (taken.length < need) {
      return {
        error: `Could not load ${diff}/${code} picks (expected ${need}, got ${taken.length})`,
        status: 500,
      };
    }

    picks[key] = taken;
    for (const q of taken) excludeIds.add(q.id);
  }

  const chosen: FullQuestion[] = [];
  const cursor: Partial<Record<PairKey, number>> = {};
  for (let i = 0; i < slots.length; i++) {
    const key = pairKey(slots[i], mix[i]);
    const idx = cursor[key] ?? 0;
    chosen.push(picks[key]![idx]);
    cursor[key] = idx + 1;
  }
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + MODULE_DURATION_MS);
  const answerKey = chosen.map((q) => ({ id: q.id, a: q.correct_answer }));

  const { data: moduleRow, error: moduleErr } = await admin
    .from("modules")
    .insert({
      user_id: userId,
      difficulty: overallDifficulty,
      question_ids: chosen.map((q) => q.id),
      parent_module_id: parentModuleId,
      module_number: moduleNumber,
      expires_at: expiresAt.toISOString(),
      current_index: 0,
      answers: {},
    })
    .select("id")
    .single();
  if (moduleErr || !moduleRow) {
    return { error: moduleErr?.message ?? "Could not create module", status: 500 };
  }

  const { error: keyErr } = await admin
    .from("module_answer_keys")
    .insert({
      module_id: moduleRow.id,
      answer_key: answerKey,
    });
  if (keyErr) {
    await admin.from("modules").delete().eq("id", moduleRow.id);
    return { error: keyErr.message, status: 500 };
  }

  const publicQuestions: PublicQuestion[] = chosen.map((q) => ({
    id: q.id,
    question_type: q.question_type,
    passage: q.passage,
    stem: q.stem,
    choices: q.choices,
    table_json: (q as unknown as { table_json?: unknown }).table_json ?? null,
    underlined_text: (q as unknown as { underlined_text?: string | null }).underlined_text ?? null,
    text_1: (q as unknown as { text_1?: string | null }).text_1 ?? null,
    text_2: (q as unknown as { text_2?: string | null }).text_2 ?? null,
    highlighted_word: (q as unknown as { highlighted_word?: string | null }).highlighted_word ?? null,
    notes_bullets: (q as unknown as { notes_bullets?: string[] | null }).notes_bullets ?? null,
  }));

  return {
    kind: "taking",
    module_id: moduleRow.id,
    difficulty: overallDifficulty,
    module_number: moduleNumber,
    parent_module_id: parentModuleId,
    questions: publicQuestions,
    expires_at: expiresAt.toISOString(),
    current_index: 0,
    answers: {},
  };
}

const MODULE_COLUMNS =
  "id, user_id, difficulty, module_number, parent_module_id, question_ids, answers, score, total, submitted_at, expires_at, current_index";

/**
 * Starts, resumes, or finalizes a module for the authenticated user.
 *
 * Body shapes:
 *   {}                             → module 1 of a new exam, or resume existing unsubmitted M1
 *   { parent_module_id: "<id>" }   → module 2 for that exam (resume if one already exists)
 *   { module_id: "<id>" }          → resume/view a specific module
 *
 * Response is either `{ kind: "taking", ... }` (show questions) or
 * `{ kind: "submitted", ... }` (already graded — client should go to dashboard).
 */
export async function POST(request: Request) {
  const authed = await createSupabaseServerClient();
  const { data: { user } } = await authed.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    module_id?: string;
    parent_module_id?: string;
  };

  const admin = createSupabaseAdminClient();

  // -- Case 1: resume a specific module by id ------------------------------
  if (body.module_id) {
    const { data: mod, error } = await admin
      .from("modules")
      .select(MODULE_COLUMNS)
      .eq("id", body.module_id)
      .single();
    if (error || !mod) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 });
    }
    if (mod.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const result = await resumeExistingModule(admin, mod as ModuleRow);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  }

  // -- Case 2: start or resume module 2 for a given parent -----------------
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
      .select(MODULE_COLUMNS)
      .eq("parent_module_id", parent.id)
      .maybeSingle();
    if (existing) {
      const result = await resumeExistingModule(admin, existing as ModuleRow);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json(result);
    }

    const pScore = parent.score ?? 0;
    const pTotal = parent.total ?? 1;
    const overallDifficulty: Difficulty =
      pScore / pTotal >= ADAPTIVE_THRESHOLD ? "harder" : "standard";

    const created = await createNewModule(
      admin,
      user.id,
      parent.id,
      overallDifficulty,
      2,
      (parent.question_ids ?? []) as string[],
    );
    if ("error" in created) {
      return NextResponse.json({ error: created.error }, { status: created.status });
    }
    return NextResponse.json(created);
  }

  // -- Case 3: "new exam" — reuse a live M1 if the user already has one ----
  // Prevents accidentally stacking multiple in-progress exams. An expired
  // M1 is finalized silently and a fresh one is created in its place.
  const { data: pendingM1 } = await admin
    .from("modules")
    .select(MODULE_COLUMNS)
    .eq("user_id", user.id)
    .eq("module_number", 1)
    .is("submitted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pendingM1) {
    const expiresAt = pendingM1.expires_at ? new Date(pendingM1.expires_at) : null;
    if (!expiresAt || expiresAt.getTime() > Date.now()) {
      const result = await resumeExistingModule(admin, pendingM1 as ModuleRow);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json(result);
    }
    const finalized = await finalizeExpiredModule(admin, pendingM1 as ModuleRow);
    if ("error" in finalized) {
      return NextResponse.json({ error: finalized.error }, { status: finalized.status });
    }
    // Fall through to create a fresh M1.
  }

  const created = await createNewModule(admin, user.id, null, "standard", 1, []);
  if ("error" in created) {
    return NextResponse.json({ error: created.error }, { status: created.status });
  }
  return NextResponse.json(created);
}
