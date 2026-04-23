import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function minutesLeft(m: ModuleRow, now: number): number {
  if (!m.expires_at) return 0;
  const diff = new Date(m.expires_at).getTime() - now;
  return Math.max(0, Math.ceil(diff / 60000));
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

  const { data: modules } = await supabase
    .from("modules")
    .select(
      "id, created_at, difficulty, score, total, submitted_at, module_number, parent_module_id, expires_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

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

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-wide">대시보드</h1>
        <SignOutButton />
      </header>

      <p className="text-sm text-gray-600">{user.email} 님으로 로그인됨</p>

      <div>
        <Link
          href="/challenge/module?new=1"
          className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-white font-semibold shadow hover:bg-blue-700 transition"
        >
          새 모의고사 시작하기
        </Link>
        <p className="mt-1 text-xs text-gray-500">
          진행 중인 모의고사가 있다면 자동으로 이어서 시작됩니다.
        </p>
      </div>

      {inProgress.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-gray-800 border-b-2 border-blue-500 pb-2">
            진행 중 / 이어하기
          </h2>
          <ul className="space-y-2">
            {inProgress.map((e) => (
              <li
                key={e.m1.module.id}
                className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm">
                    <div className="font-semibold text-gray-800">
                      {formatDate(e.createdAt)}에 시작된 모의고사
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
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-gray-800 border-b-2 border-blue-500 pb-2">
          완료된 모의고사 기록
        </h2>
        {completed.length === 0 ? (
          <p className="text-sm text-gray-500">
            아직 완료한 모의고사가 없습니다. 위의 버튼으로 시작해보세요.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-white shadow-sm">
            {completed.map((e, i) => {
              const m1 = e.m1.module;
              const m2 = e.m2!.module;
              const score = (m1.score ?? 0) + (m2.score ?? 0);
              const total = (m1.total ?? 0) + (m2.total ?? 0);
              const pct = total > 0 ? Math.round((score / total) * 100) : 0;
              // Show a per-exam delta so the timeline view actually *feels*
              // like a timeline — "회차 4 · 이전 대비 +3점" etc.
              const prev = completed[i + 1];
              const prevScore = prev
                ? (prev.m1.module.score ?? 0) + (prev.m2!.module.score ?? 0)
                : null;
              const delta = prevScore !== null ? score - prevScore : null;
              return (
                <li key={m1.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="text-sm">
                    <div className="font-medium">{formatDate(e.createdAt)}</div>
                    <div className="text-gray-500">
                      모듈 1: {m1.score}/{m1.total} · 모듈 2: {m2.score}/{m2.total}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="text-base font-semibold">
                      {score} / {total} <span className="text-gray-500 font-normal">({pct}%)</span>
                    </div>
                    {delta !== null && (
                      <div
                        className={
                          delta > 0
                            ? "text-green-700"
                            : delta < 0
                              ? "text-red-600"
                              : "text-gray-500"
                        }
                      >
                        {delta > 0 ? `+${delta}` : delta}점 (직전 대비)
                      </div>
                    )}
                    <Link
                      href={`/challenge/review/${m1.id}`}
                      className="mt-2 inline-block rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition"
                    >
                      해설 보기
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function statusLabel(e: Exam, now: number): string {
  const { m1, m2, status } = e;
  switch (status) {
    case "m1_in_progress": {
      const mins = minutesLeft(m1.module, now);
      return `모듈 1 진행 중 · 남은 시간 약 ${mins}분`;
    }
    case "m1_expired":
      return "모듈 1 시간이 만료되었습니다. 이어하기를 누르면 현재까지의 답안으로 채점됩니다.";
    case "awaiting_m2": {
      const s = m1.module.score ?? 0;
      const t = m1.module.total ?? 0;
      return `모듈 1 완료 (${s}/${t}) · 모듈 2 아직 시작하지 않음`;
    }
    case "m2_in_progress": {
      const mins = minutesLeft(m2!.module, now);
      return `모듈 2 진행 중 · 남은 시간 약 ${mins}분`;
    }
    case "m2_expired":
      return "모듈 2 시간이 만료되었습니다. 이어하기를 누르면 현재까지의 답안으로 채점됩니다.";
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
        className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-2 text-sm text-white font-semibold shadow hover:bg-blue-700 transition"
      >
        모듈 2 시작
      </Link>
    );
  }
  if (status === "m1_in_progress" || status === "m1_expired") {
    const label = status === "m1_expired" ? "채점하기" : "모듈 1 이어하기";
    return (
      <Link
        href={`/challenge/module?id=${m1.module.id}`}
        className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-2 text-sm text-white font-semibold shadow hover:bg-blue-700 transition"
      >
        {label}
      </Link>
    );
  }
  if (status === "m2_in_progress" || status === "m2_expired") {
    const label = status === "m2_expired" ? "채점하기" : "모듈 2 이어하기";
    return (
      <Link
        href={`/challenge/module?id=${m2!.module.id}`}
        className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-2 text-sm text-white font-semibold shadow hover:bg-blue-700 transition"
      >
        {label}
      </Link>
    );
  }
  return null;
}
