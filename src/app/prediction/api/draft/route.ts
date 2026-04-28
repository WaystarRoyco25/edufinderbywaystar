import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const FIELD_NAMES = [
  "name",
  "email",
  "grade",
  "school",
  "citizenship",
  "intendedMajor",
  "gpaUnweighted",
  "gpaWeighted",
  "satTotal",
  "satSection",
  "apIbTrack",
  "apIbDetail",
  "extracurriculars",
  "awards",
  "leadership",
  "school1",
  "school2",
  "school3",
  "school4",
  "school5",
  "notes",
] as const;

const FIELD_NAME_SET = new Set<string>(FIELD_NAMES);
const DRAFT_COLUMNS = "id, payload, status, updated_at, submitted_at";
const MAX_FIELD_LENGTH = 5000;

type DraftStatus = "draft" | "submitted";

function normalizeStatus(value: unknown): DraftStatus {
  return value === "submitted" ? "submitted" : "draft";
}

function normalizePayload(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const payload: Record<string, string> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, raw]) => {
    if (!FIELD_NAME_SET.has(key) || typeof raw !== "string") return;
    payload[key] = raw.slice(0, MAX_FIELD_LENGTH);
  });
  return payload;
}

async function getAuthenticatedUser() {
  const authed = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authed.auth.getUser();
  return user;
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("prediction_report_drafts")
    .select(DRAFT_COLUMNS)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("prediction draft lookup failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ draft: data ?? null });
}

export async function PUT(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | {
        payload?: unknown;
        status?: unknown;
      }
    | null;

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const status = normalizeStatus(body.status);
  const submittedAt = status === "submitted" ? new Date().toISOString() : null;
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("prediction_report_drafts")
    .upsert(
      {
        user_id: user.id,
        payload: normalizePayload(body.payload),
        status,
        submitted_at: submittedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select(DRAFT_COLUMNS)
    .single();

  if (error) {
    console.error("prediction draft save failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ draft: data });
}
