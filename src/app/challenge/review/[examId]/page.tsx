import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ReviewClient, {
  type QuestionRow,
  type ReviewQuestion,
  type ReviewSummary,
} from "./review-client";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ examId: string }>;
};

type ModuleRow = {
  id: string;
  created_at: string;
  user_id: string;
  difficulty: string;
  question_ids: string[];
  answer_key: unknown;
  answers: unknown;
  score: number | null;
  total: number | null;
  submitted_at: string | null;
  parent_module_id: string | null;
  module_number: number;
};

type AnswerKeyRow = {
  id?: unknown;
  a?: unknown;
};

const MODULE_COLUMNS =
  "id, created_at, user_id, difficulty, question_ids, answer_key, answers, score, total, submitted_at, parent_module_id, module_number";

function asAnswerMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const answers: Record<string, string> = {};
  for (const [qid, picked] of Object.entries(value)) {
    if (typeof picked === "string") answers[qid] = picked;
  }
  return answers;
}

function asAnswerKeyMap(value: unknown): Map<string, string> {
  if (!Array.isArray(value)) return new Map();
  const pairs = (value as AnswerKeyRow[])
    .filter((row) => typeof row.id === "string" && typeof row.a === "string")
    .map((row) => [row.id as string, row.a as string] as const);
  return new Map(pairs);
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

function scoreText(score: number | null, total: number | null): string {
  return `${score ?? 0}/${total ?? 0}`;
}

function buildReviewQuestions(module: ModuleRow, moduleNumber: 1 | 2, questions: Map<string, QuestionRow>) {
  const answers = asAnswerMap(module.answers);
  const answerKey = asAnswerKeyMap(module.answer_key);

  return module.question_ids.map((questionId, index): ReviewQuestion => {
    const question = questions.get(questionId) ?? null;
    return {
      number: index + 1,
      moduleNumber,
      question,
      questionId,
      picked: answers[questionId] ?? null,
      correct: answerKey.get(questionId) ?? question?.correct_answer ?? null,
    };
  });
}

function lockedHref(m1: ModuleRow, m2: ModuleRow | null): string | null {
  if (!m1.submitted_at) return `/challenge/module?id=${m1.id}`;
  if (!m2) return `/challenge/module?parent=${m1.id}`;
  if (!m2.submitted_at) return `/challenge/module?id=${m2.id}`;
  return null;
}

function lockedLabel(m1: ModuleRow, m2: ModuleRow | null): string {
  if (!m1.submitted_at) return "모듈 1 이어가기";
  if (!m2) return "모듈 2 시작하기";
  return "모듈 2 이어가기";
}

function LockedReview({ m1, m2 }: { m1: ModuleRow; m2: ModuleRow | null }) {
  const nextHref = lockedHref(m1, m2);

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-5">
      <Link
        href="/challenge/dashboard"
        className="text-sm text-gray-600 underline hover:text-gray-800"
      >
        대시보드로 돌아가기
      </Link>
      <section className="rounded-lg border border-gray-100 bg-white p-6 shadow-md space-y-3">
        <h1 className="text-2xl font-bold tracking-wide">
          해설은 모의고사 완료 후 열립니다
        </h1>
        <p className="text-gray-600">
          모듈 1과 모듈 2를 모두 제출한 뒤에 모든 문제의 정답과 해설을 확인할 수 있습니다.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link
            href="/challenge/dashboard"
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition"
          >
            대시보드
          </Link>
          {nextHref && (
            <Link
              href={nextHref}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 transition"
            >
              {lockedLabel(m1, m2)}
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}

export default async function ReviewPage({ params }: PageProps) {
  const { examId } = await params;
  const reviewPath = `/challenge/review/${examId}`;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/challenge/login?next=${encodeURIComponent(reviewPath)}`);
  if (!user.user_metadata?.password_set) {
    redirect(`/challenge/login?next=${encodeURIComponent(reviewPath)}`);
  }

  const admin = createSupabaseAdminClient();

  const { data: m1, error: m1Err } = await admin
    .from("modules")
    .select(MODULE_COLUMNS)
    .eq("id", examId)
    .eq("user_id", user.id)
    .eq("module_number", 1)
    .maybeSingle();

  if (m1Err || !m1) notFound();

  const { data: m2 } = await admin
    .from("modules")
    .select(MODULE_COLUMNS)
    .eq("parent_module_id", examId)
    .eq("user_id", user.id)
    .eq("module_number", 2)
    .maybeSingle();

  const module1 = m1 as ModuleRow;
  const module2 = (m2 as ModuleRow | null) ?? null;

  if (!module1.submitted_at || !module2?.submitted_at) {
    return <LockedReview m1={module1} m2={module2} />;
  }

  const questionIds = Array.from(
    new Set([...module1.question_ids, ...module2.question_ids]),
  );
  const { data: rawQuestions, error: qErr } = await admin
    .from("questions")
    .select(
      "id, question_type, passage, stem, choices, correct_answer, explanation_correct, explanation_a, explanation_b, explanation_c, explanation_d",
    )
    .in("id", questionIds);

  if (qErr) {
    throw new Error(qErr.message);
  }

  const questions = new Map(
    ((rawQuestions as QuestionRow[]) ?? []).map((question) => [question.id, question]),
  );
  const m1Questions = buildReviewQuestions(module1, 1, questions);
  const m2Questions = buildReviewQuestions(module2, 2, questions);

  const totalScore = (module1.score ?? 0) + (module2.score ?? 0);
  const totalMax = (module1.total ?? 0) + (module2.total ?? 0);
  const pct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  const summary: ReviewSummary = {
    startedAt: formatDate(new Date(module1.created_at)),
    totalScore,
    totalMax,
    pct,
    module1Score: scoreText(module1.score, module1.total),
    module2Score: scoreText(module2.score, module2.total),
  };

  return (
    <ReviewClient
      summary={summary}
      questions={[...m1Questions, ...m2Questions]}
    />
  );
}
