import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import CompletedProgressChart, { type ProgressExam } from "./completed-progress-chart";
import SignOutButton from "./sign-out-button";

type ModuleRow = {
  id: string;
  created_at: string;
  difficulty: string;
  score: number | null;
  total: number | null;
  submitted_at: string | null;
  module_number: number;
  parent_module_id: string | null;
  expires_at: string | null;
};

type ModuleSlot = {
  module: ModuleRow;
  state: "taking" | "expired" | "submitted";
};

type Exam = {
  m1: ModuleSlot;
  m2: ModuleSlot | null;
  createdAt: Date;
  status:
    | "m1_in_progress" // M1 not yet submitted and still within 32-min window
    | "m1_expired" // M1 window passed but still unsubmitted (next touch auto-grades)
    | "awaiting_m2" // M1 done, M2 not started
    | "m2_in_progress"
    | "m2_expired"
    | "completed";
};

function classify(m: ModuleRow, now: number): ModuleSlot {
  if (m.submitted_at) return { module: m, state: "submitted" };
  if (m.expires_at && new Date(m.expires_at).getTime() <= now) {
    return { module: m, state: "expired" };
  }
  return { module: m, state: "taking" };
}

function examStatus(m1: ModuleSlot, m2: ModuleSlot | null): Exam["status"] {
  if (m1.state === "taking") return "m1_in_progress";
  if (m1.state === "expired") return "m1_expired";
  // M1 submitted from here on.
  if (!m2) return "awaiting_m2";
  if (m2.state === "taking") return "m2_in_progress";
  if (m2.state === "expired") return "m2_expired";
  return "completed";
}

function formatDate(d: Date): string {
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });
}

function minutesLeft(m: ModuleRow, now: number): number {
  if (!m.expires_at) return 0;
  const diff = new Date(m.expires_at).getTime() - now;
  return Math.max(0, Math.ceil(diff / 60000));
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function scoreSummary(e: Exam): ProgressExam {
  const m1 = e.m1.module;
  const m2 = e.m2!.module;
  const score = (m1.score ?? 0) + (m2.score ?? 0);
  const total = (m1.total ?? 0) + (m2.total ?? 0);
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;

  return {
    id: m1.id,
    displayDate: formatDate(e.createdAt),
    shortDate: formatShortDate(e.createdAt),
    module1Score: m1.score ?? 0,
    module1Total: m1.total ?? 0,
    module2Score: m2.score ?? 0,
    module2Total: m2.total ?? 0,
    score,
    total,
    pct,
  };
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/challenge/login");

  // Legacy OTP-only users (signed up through edufinder before passwords
  // existed) need to set one before they can use SAT_Factory.
  if (!user.user_metadata?.password_set) {
    redirect("/challenge/login?next=/challenge/dashboard");
  }

  const admin = createSupabaseAdminClient();
  const [modulesResult, purchasesResult] = await Promise.all([
    admin
      .from("modules")
      .select(
        "id, created_at, difficulty, score, total, submitted_at, module_number, parent_module_id, expires_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200),
    admin.from("purchases").select("tests_granted").eq("user_id", user.id),
  ]);
  const modules = modulesResult.data;
  const purchaseRows = (purchasesResult.data ?? []) as {
    tests_granted: number;
  }[];

  // Read once per request so every row on the page is judged against the
  // same "now". The linter would prefer a pure render, but this is an
  // async server component so a dynamic timestamp is fine here.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const all = (modules ?? []) as ModuleRow[];
  const m1List = all.filter((m) => m.module_number === 1);
  const m2ByParent = new Map<string, ModuleRow>();
  for (const m of all.filter((m) => m.module_number === 2)) {
    if (m.parent_module_id) m2ByParent.set(m.parent_module_id, m);
  }

  const exams: Exam[] = m1List.map((m1) => {
    const m1Slot = classify(m1, now);
    const m2Row = m2ByParent.get(m1.id) ?? null;
    const m2Slot = m2Row ? classify(m2Row, now) : null;
    return {
      m1: m1Slot,
      m2: m2Slot,
      createdAt: new Date(m1.created_at),
      status: examStatus(m1Slot, m2Slot),
    };
  });

  exams.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const inProgress = exams.filter((e) => e.status !== "completed");
  const completed = exams.filter((e) => e.status === "completed");
  const latestCompleted = completed
    .slice(0, 5)
    .map((exam) => scoreSummary(exam));

  // One purchased "test" is one full exam; starting a Module 1 consumes it.
  const testsPurchased = purchaseRows.reduce(
    (sum, row) => sum + row.tests_granted,
    0,
  );
  const testsUsed = m1List.length;
  const testsAvailable = Math.max(0, testsPurchased - testsUsed);

  return (
    <main className="mx-auto w-full max-w-6xl p-6 space-y-8">
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
          <h1 className="text-3xl font-bold tracking-wide">Dashboard</h1>

          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <TestsAvailableStatus
              purchased={testsPurchased}
              used={testsUsed}
              available={testsAvailable}
            />
            <div className="shrink-0">
              {testsAvailable > 0 ? (
                <Link
                  href="/challenge/module?new=1"
                  className="block w-full rounded-lg bg-[#3b82f6] px-5 py-2.5 text-center font-semibold text-white shadow transition hover:bg-[#2563eb] sm:inline-block sm:w-auto"
                >
                  Start a New Practice Test
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="block w-full cursor-not-allowed rounded-lg bg-[#3b82f6] px-5 py-2.5 text-center font-semibold text-white opacity-50 shadow sm:inline-block sm:w-auto"
                >
                  Start a New Practice Test
                </button>
              )}
              <p className="mt-2 text-xs text-gray-500 sm:text-right">
                {testsAvailable > 0
                  ? "A practice test in progress resumes automatically."
                  : "Purchase a package to start a new practice test."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)] lg:items-start">
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-gray-800 border-b-2 border-[#3b82f6] pb-2">
            Completed Practice Tests
          </h2>

          <CompletedProgressChart exams={latestCompleted} />
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-gray-800 border-b-2 border-[#3b82f6] pb-2">
            In Progress
          </h2>
          {inProgress.length === 0 ? (
            <p className="rounded-lg border border-gray-100 bg-white p-4 text-sm text-gray-500 shadow-sm">
              No practice test is currently in progress.
            </p>
          ) : (
            <ul className="space-y-3">
              {inProgress.map((e) => (
                <li
                  key={e.m1.module.id}
                  className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm space-y-2"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="text-sm">
                      <div className="font-semibold text-gray-800">
                        Practice test started on {formatDate(e.createdAt)}
                      </div>
                      <div className="text-gray-600">
                        {statusLabel(e, now)}
                      </div>
                    </div>
                    <InProgressAction exam={e} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function statusLabel(e: Exam, now: number): string {
  const { m1, m2, status } = e;
  switch (status) {
    case "m1_in_progress": {
      const mins = minutesLeft(m1.module, now);
      return `Module 1 in progress · About ${mins} minutes remaining`;
    }
    case "m1_expired":
      return "Module 1 has expired. Continue to grade the answers saved so far.";
    case "awaiting_m2": {
      const s = m1.module.score ?? 0;
      const t = m1.module.total ?? 0;
      return `Module 1 complete (${s}/${t}) · Module 2 has not started yet`;
    }
    case "m2_in_progress": {
      const mins = minutesLeft(m2!.module, now);
      return `Module 2 in progress · About ${mins} minutes remaining`;
    }
    case "m2_expired":
      return "Module 2 has expired. Continue to grade the answers saved so far.";
    default:
      return "";
  }
}

function InProgressAction({ exam }: { exam: Exam }) {
  const { status, m1, m2 } = exam;
  if (status === "awaiting_m2") {
    return (
      <Link
        href={`/challenge/module?parent=${m1.module.id}`}
        className="whitespace-nowrap rounded-lg bg-[#3b82f6] px-3 py-2 text-sm text-white font-semibold shadow hover:bg-[#3b82f6] transition"
      >
        Start Module 2
      </Link>
    );
  }
  if (status === "m1_in_progress" || status === "m1_expired") {
    const label = status === "m1_expired" ? "Grade Now" : "Resume Module 1";
    return (
      <Link
        href={`/challenge/module?id=${m1.module.id}`}
        className="whitespace-nowrap rounded-lg bg-[#3b82f6] px-3 py-2 text-sm text-white font-semibold shadow hover:bg-[#3b82f6] transition"
      >
        {label}
      </Link>
    );
  }
  if (status === "m2_in_progress" || status === "m2_expired") {
    const label = status === "m2_expired" ? "Grade Now" : "Resume Module 2";
    return (
      <Link
        href={`/challenge/module?id=${m2!.module.id}`}
        className="whitespace-nowrap rounded-lg bg-[#3b82f6] px-3 py-2 text-sm text-white font-semibold shadow hover:bg-[#3b82f6] transition"
      >
        {label}
      </Link>
    );
  }
  return null;
}

function TestsAvailableStatus({
  purchased,
  used,
  available,
}: {
  purchased: number;
  used: number;
  available: number;
}) {
  const positive = available > 0;
  const testWord = (n: number) => (n === 1 ? "test" : "tests");

  let detail: ReactNode;
  if (purchased === 0) {
    detail = (
      <>
        Purchase a package to get started.{" "}
        <Link
          href="/challenge/purchase"
          className="font-medium text-[#3b82f6] hover:underline"
        >
          View packages
        </Link>
      </>
    );
  } else if (!positive) {
    detail = (
      <>
        {used} of {purchased} purchased {testWord(purchased)} used.{" "}
        <Link
          href="/challenge/purchase"
          className="font-medium text-[#3b82f6] hover:underline"
        >
          Buy another package
        </Link>
      </>
    );
  } else {
    detail = (
      <>
        {purchased} purchased{used > 0 ? ` · ${used} used` : ""} ·{" "}
        <Link
          href="/challenge/purchase"
          className="font-medium text-[#3b82f6] hover:underline"
        >
          Buy more
        </Link>
        .
      </>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <div
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-lg text-2xl font-bold ${
          positive ? "bg-blue-50 text-[#3b82f6]" : "bg-amber-50 text-amber-600"
        }`}
      >
        {available}
      </div>
      <div className="text-sm">
        <p className="text-base font-semibold">
          Practice {testWord(available)} available
        </p>
        <p className="mt-0.5 text-gray-500">{detail}</p>
      </div>
    </div>
  );
}
