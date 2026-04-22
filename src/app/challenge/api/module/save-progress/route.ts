import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Records partial progress on an in-flight module: the user's current
 * answers-so-far and which question they're looking at. Called on every
 * answer pick and every navigation between questions so that if the user
 * closes the tab, the server-side state is already up to date.
 *
 * The 32-minute clock is authoritative server-side (expires_at), so this
 * endpoint refuses updates past that point — a late save shouldn't be
 * able to overwrite answers after auto-grading.
 */
export async function POST(request: Request) {
  const authed = await createSupabaseServerClient();
  const { data: { user } } = await authed.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | {
        module_id?: string;
        answers?: Record<string, string>;
        current_index?: number;
      }
    | null;

  if (!body?.module_id) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // One-time sanity check: if the service role key is missing at runtime the
  // admin client silently falls back to anon, which hits RLS and returns 0
  // rows for every lookup. That shows up as a 404 here and is very easy to
  // miss, so log a boolean (never the value itself).
  console.log("save-progress:start", {
    module_id: body.module_id,
    has_service_role_key: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  });

  const admin = createSupabaseAdminClient();

  const { data: mod, error } = await admin
    .from("modules")
    .select("id, user_id, submitted_at, expires_at")
    .eq("id", body.module_id)
    .single();
  if (error || !mod) {
    console.error("save-progress:lookup_failed", {
      module_id: body.module_id,
      error,
    });
    return NextResponse.json(
      {
        error: "Module not found",
        supabase_code: error?.code,
        supabase_message: error?.message,
      },
      { status: 404 },
    );
  }
  if (mod.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (mod.submitted_at) {
    return NextResponse.json({ error: "Already submitted" }, { status: 409 });
  }
  if (mod.expires_at && new Date(mod.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Module expired" }, { status: 410 });
  }

  const update: Record<string, unknown> = {};
  if (body.answers && typeof body.answers === "object") {
    update.answers = body.answers;
  }
  if (typeof body.current_index === "number" && body.current_index >= 0) {
    update.current_index = Math.floor(body.current_index);
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error: updErr } = await admin
    .from("modules")
    .update(update)
    .eq("id", mod.id);
  if (updErr) {
    console.error("save-progress:update_failed", {
      module_id: mod.id,
      error: updErr,
    });
    return NextResponse.json(
      {
        error: updErr.message,
        supabase_code: updErr.code,
      },
      { status: 500 },
    );
  }

  console.log("save-progress:updated", {
    module_id: mod.id,
    current_index: update.current_index,
    answer_count:
      update.answers && typeof update.answers === "object"
        ? Object.keys(update.answers as Record<string, string>).length
        : undefined,
  });

  return NextResponse.json({ ok: true });
}
