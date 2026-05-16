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
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-wide">Dashboard</h1>
        <SignOutButton />
      </header>

      <p className="text-sm text-gray-600">Logged in as {user.email}</p>

      <div className="space-y-3">
        <TestsAvailableNotice
          purchased={testsPurchased}
          used={testsUsed}
          available={testsAvailable}
        />
        <div>
          <Link
            href="/challenge/module?new=1"
            className="inline-block rounded-lg bg-[#3b82f6] px-4 py-2 text-white font-semibold shadow hover:bg-[#3b82f6] transition"
          >
            Start a New Practice Test
          </Link>
          <p className="mt-1 text-xs text-gray-500">
            If you already have a practice test in progress, it will resume automatically.
          </p>
        </div>
      </div>

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

function TestsAvailableNotice({
  purchased,
  used,
  available,
}: {
  purchased: number;
  used: number;
  available: number;
}) {
  if (purchased === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
        <p className="text-base font-semibold text-amber-900">
          You do not have any practice tests yet.
        </p>
        <p className="mt-1 text-amber-800">
          Purchase a Challenge! Series package to start practicing.{" "}
          <Link href="/challenge/purchase" className="font-semibold underline">
            View packages
          </Link>
        </p>
      </div>
    );
  }
  if (available <= 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
        <p className="text-base font-semibold text-amber-900">
          You have no practice tests available.
        </p>
        <p className="mt-1 text-amber-800">
          You have used {used} of your {purchased} purchased{" "}
          {purchased === 1 ? "test" : "tests"}. Need more?{" "}
          <Link href="/challenge/purchase" className="font-semibold underline">
            Buy another package
          </Link>
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm">
      <p className="text-base font-semibold text-[#1e3a8a]">
        You have {available} practice {available === 1 ? "test" : "tests"}{" "}
        available.
      </p>
      <p className="mt-1 text-gray-600">
        {purchased} purchased{used > 0 ? ` · ${used} used` : ""} ·{" "}
        <Link
          href="/challenge/purchase"
          className="font-semibold text-[#3b82f6] hover:underline"
        >
          Buy more
        </Link>
      </p>
    </div>
  );
}
