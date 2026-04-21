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

  const admin = createSupabaseAdminClient();

  const { data: mod, error } = await admin
    .from("modules")
    .select("id, user_id, submitted_at, expires_at")
    .eq("id", body.module_id)
    .single();
  if (error || !mod) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
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
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
