import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireDashboardUser } from "@/lib/dashboard/guard";
import { countAvailableGeniusCredits } from "@/lib/genius/purchase";
import {
  geniusBoardUrl,
  listGeniusBoardsForUser,
  type GeniusBoardRow,
} from "@/lib/genius/server";
import type {
  GeniusAiBoard,
  GeniusBoardStatus,
  GeniusSignalProfile,
} from "@/lib/genius/types";
import EmbeddedDraftFrame from "../embedded-draft-frame";
import SignOutButton from "../sign-out-button";

export const dynamic = "force-dynamic";

type DashboardSearchParams = Promise<{
  draft?: string | string[];
  reset?: string | string[];
}>;

function hasFlag(value: string | string[] | undefined): boolean {
  return Array.isArray(value) ? value.includes("1") : value === "1";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });
}

const STATUS_META: Record<
  GeniusBoardStatus,
  { label: string; className: string }
> = {
  completed: { label: "Ready", className: "bg-blue-50 text-[#3b82f6]" },
  needs_review: {
    label: "Needs review",
    className: "bg-amber-50 text-amber-600",
  },
  processing: { label: "Generating", className: "bg-blue-50 text-[#3b82f6]" },
  queued: { label: "Queued", className: "bg-gray-100 text-gray-600" },
  failed: { label: "Failed", className: "bg-red-50 text-red-600" },
};

function signalSummary(
  value: unknown,
): { answered: number; total: number } | null {
  if (!value || typeof value !== "object") return null;
  const profile = value as Partial<GeniusSignalProfile>;
  if (
    typeof profile.answeredCount !== "number" ||
    typeof profile.totalQuestions !== "number"
  ) {
    return null;
  }
  return { answered: profile.answeredCount, total: profile.totalQuestions };
}

function angleCount(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const board = value as Partial<GeniusAiBoard>;
  return Array.isArray(board.angles) ? board.angles.length : null;
}

export default async function GeniusDashboardPage({
  searchParams,
}: {
  searchParams: DashboardSearchParams;
}) {
  const params = await searchParams;
  const draftRequested = hasFlag(params.draft);
  const resetRequested = hasFlag(params.reset);
  const loginPath = `/dashboard/genius${draftRequested ? "?draft=1" : ""}`;
  const user = await requireDashboardUser(loginPath);

  const admin = createSupabaseAdminClient();
  const [boards, credits] = await Promise.all([
    listGeniusBoardsForUser(admin, user.id),
    countAvailableGeniusCredits(admin, user.id),
  ]);
  const showDraft = draftRequested && credits > 0;
  const editorSrc = `/genius?embed=dashboard&start=1${
    resetRequested ? "&reset=1" : ""
  }`;

  return (
    <main className="space-y-8">
      <section className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50 px-6 py-3">
          <p className="min-w-0 truncate text-xs text-gray-500">
            Signed in as{" "}
            <span className="font-medium text-gray-700">{user.email}</span>
          </p>
          <div className="shrink-0">
            <SignOutButton />
          </div>
        </div>

        <div className="space-y-5 p-6">
          <h1 className="text-3xl font-bold tracking-wide">
            The Genius! Editor
          </h1>

          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <GeniusCreditsStatus
              credits={credits}
              hasBoards={boards.length > 0}
            />
            <div className="shrink-0">
              <Link
                href={
                  credits > 0
                    ? "/dashboard/genius?draft=1"
                    : "/genius/purchase"
                }
                className="block w-full rounded-lg bg-[#3b82f6] px-5 py-2.5 text-center font-semibold text-white shadow transition hover:bg-[#2563eb] sm:inline-block sm:w-auto"
              >
                {credits > 0 ? "Generate a Board" : "Buy an Editor Run"}
              </Link>
              <p className="mt-2 text-xs text-gray-500 sm:text-right">
                Each run builds one fresh board of essay angles.
              </p>
            </div>
          </div>
        </div>
      </section>

      {showDraft && (
        <EmbeddedDraftFrame
          title="Draft your Genius! Editor board"
          description="Answer the discovery prompts here, then generate the idea board from the saved draft."
          src={editorSrc}
          closeHref="/dashboard/genius"
          heightClassName="h-[1120px]"
        />
      )}

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-gray-800 border-b-2 border-[#3b82f6] pb-2">
          Your Idea Boards
        </h2>
        {boards.length === 0 ? (
          <p className="rounded-lg border border-gray-100 bg-white p-4 text-sm text-gray-500 shadow-sm">
            You have not generated a Genius! Editor board yet. Every board you
            generate will be saved here.
          </p>
        ) : (
          <ul className="space-y-3">
            {boards.map((board) => (
              <BoardCard key={board.id} board={board} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function GeniusCreditsStatus({
  credits,
  hasBoards,
}: {
  credits: number;
  hasBoards: boolean;
}) {
  const positive = credits > 0;
  let detail: string;
  if (positive) {
    detail = "You can generate a new idea board now.";
  } else if (hasBoards) {
    detail = "Buy another editor run to build a fresh board.";
  } else {
    detail = "Buy an editor run to build your first board.";
  }
  return (
    <div className="flex items-center gap-4">
      <div
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-lg text-2xl font-bold ${
          positive ? "bg-blue-50 text-[#3b82f6]" : "bg-amber-50 text-amber-600"
        }`}
      >
        {credits}
      </div>
      <div className="text-sm">
        <p className="text-base font-semibold">
          Editor {credits === 1 ? "run" : "runs"} available
        </p>
        <p className="mt-0.5 text-gray-500">{detail}</p>
      </div>
    </div>
  );
}

function BoardCard({ board }: { board: GeniusBoardRow }) {
  const status = STATUS_META[board.status];
  const signal = signalSummary(board.signal_profile);
  const angles =
    board.status === "completed" ? angleCount(board.board_json) : null;

  return (
    <li className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-800">
              Idea board generated on {formatDate(board.created_at)}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status.className}`}
            >
              {status.label}
            </span>
          </div>
          {angles !== null ? (
            <p className="text-gray-600">
              {angles} essay {angles === 1 ? "angle" : "angles"}
              {signal
                ? ` · built from ${signal.answered} of ${signal.total} answers`
                : ""}
            </p>
          ) : signal ? (
            <p className="text-gray-600">
              Built from {signal.answered} of {signal.total} discovery answers
            </p>
          ) : (
            <p className="text-gray-500">Editor answers were not recorded.</p>
          )}
          {board.status === "failed" && board.error_message && (
            <p className="text-red-600">{board.error_message}</p>
          )}
        </div>
        <Link
          href={geniusBoardUrl(board.id)}
          className="shrink-0 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#3b82f6]"
        >
          View board
        </Link>
      </div>
    </li>
  );
}
