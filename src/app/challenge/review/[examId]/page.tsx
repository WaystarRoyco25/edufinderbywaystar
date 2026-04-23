import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ examId: string }>;
};

type ChoiceLetter = "A" | "B" | "C" | "D";

const CHOICE_LETTERS: ChoiceLetter[] = ["A", "B", "C", "D"];
const MISSING_EXPLANATION = "해설이 준비되지 않았습니다.";

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

type QuestionRow = {
  id: string;
  question_type: string;
  passage: string | null;
  stem: string;
  choices: Record<ChoiceLetter, string>;
  correct_answer: ChoiceLetter | null;
  explanation_correct: string | null;
  explanation_a: string | null;
  explanation_b: string | null;
  explanation_c: string | null;
  explanation_d: string | null;
};

type AnswerKeyRow = {
  id?: unknown;
  a?: unknown;
};

type ReviewQuestion = {
  number: number;
  moduleNumber: 1 | 2;
  question: QuestionRow | null;
  questionId: string;
  picked: string | null;
  correct: string | null;
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

function explanationFor(question: QuestionRow, letter: ChoiceLetter, correct: string | null): string {
  const explanations: Record<ChoiceLetter, string | null> = {
    A: question.explanation_a,
    B: question.explanation_b,
    C: question.explanation_c,
    D: question.explanation_d,
  };
  const specific = explanations[letter];
  if (specific) return specific;
  if (letter === correct && question.explanation_correct) return question.explanation_correct;
  return MISSING_EXPLANATION;
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

function ChoiceCard({
  question,
  letter,
  picked,
  correct,
}: {
  question: QuestionRow;
  letter: ChoiceLetter;
  picked: string | null;
  correct: string | null;
}) {
  const isPicked = picked === letter;
  const isCorrect = correct === letter;
  const stateClass = isCorrect
    ? "border-green-600 bg-green-50"
    : isPicked
      ? "border-red-500 bg-red-50"
      : "border-gray-200 bg-white";

  return (
    <div className={`rounded-lg border p-4 ${stateClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium text-gray-900">
          <span className="mr-2 font-semibold">{letter}.</span>
          {question.choices?.[letter] ?? ""}
        </p>
        <div className="flex gap-1 text-xs font-medium">
          {isPicked && (
            <span className={isCorrect ? "text-green-700" : "text-red-700"}>
              내 답
            </span>
          )}
          {isCorrect && <span className="text-green-700">정답</span>}
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-gray-700 whitespace-pre-wrap">
        {explanationFor(question, letter, correct)}
      </p>
    </div>
  );
}

function ReviewQuestionCard({ item }: { item: ReviewQuestion }) {
  const resultLabel =
    !item.picked ? "미응답" : item.picked === item.correct ? "정답" : "오답";
  const resultClass =
    !item.picked ? "text-gray-600" : item.picked === item.correct ? "text-green-700" : "text-red-700";

  if (!item.question) {
    return (
      <article className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <div className="text-sm font-medium text-amber-900">
          문제 {item.number}번을 불러올 수 없습니다.
        </div>
        <p className="mt-2 text-sm text-amber-800">질문 ID: {item.questionId}</p>
      </article>
    );
  }

  return (
    <article className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-gray-500">
            모듈 {item.moduleNumber} · 문제 {item.number} · {item.question.question_type}
          </div>
          <div className={`mt-1 text-sm font-semibold ${resultClass}`}>
            {resultLabel} · 내 답 {item.picked ?? "미응답"} · 정답 {item.correct ?? "-"}
          </div>
        </div>
      </header>

      {item.question.passage && (
        <section className="rounded-lg border bg-gray-50 p-4 text-sm leading-6 whitespace-pre-wrap">
          {item.question.passage}
        </section>
      )}

      <p className="font-medium leading-7 text-gray-950">{item.question.stem}</p>

      <div className="space-y-3">
        {CHOICE_LETTERS.map((letter) => (
          <ChoiceCard
            key={letter}
            question={item.question!}
            letter={letter}
            picked={item.picked}
            correct={item.correct}
          />
        ))}
      </div>
    </article>
  );
}

function LockedReview({ m1, m2 }: { m1: ModuleRow; m2: ModuleRow | null }) {
  const nextHref = lockedHref(m1, m2);

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-5">
      <Link href="/challenge/dashboard" className="text-sm text-gray-600 underline">
        대시보드로 돌아가기
      </Link>
      <section className="rounded-xl border bg-white p-6 shadow-sm space-y-3">
        <h1 className="text-2xl font-semibold">해설은 모의고사 완료 후 열립니다</h1>
        <p className="text-gray-600">
          모듈 1과 모듈 2를 모두 제출한 뒤에 모든 문제의 정답과 해설을 확인할 수 있습니다.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link
            href="/challenge/dashboard"
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            대시보드
          </Link>
          {nextHref && (
            <Link
              href={nextHref}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {lockedLabel(m1, m2)}
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}

function ModuleReviewSection({
  title,
  score,
  questions,
}: {
  title: string;
  score: string;
  questions: ReviewQuestion[];
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        <div className="text-sm text-gray-600">점수 {score}</div>
      </div>
      <div className="space-y-5">
        {questions.map((item) => (
          <ReviewQuestionCard key={`${item.moduleNumber}-${item.questionId}`} item={item} />
        ))}
      </div>
    </section>
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

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-8">
      <header className="space-y-4">
        <Link href="/challenge/dashboard" className="text-sm text-gray-600 underline">
          대시보드로 돌아가기
        </Link>
        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">모의고사 해설</h1>
              <p className="mt-1 text-sm text-gray-500">
                {formatDate(new Date(module1.created_at))}에 시작한 모의고사
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-semibold">
                {totalScore} / {totalMax}
              </div>
              <div className="text-sm text-gray-500">{pct}%</div>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-gray-50 p-4 text-sm">
              <div className="text-gray-500">모듈 1</div>
              <div className="mt-1 text-lg font-semibold">
                {scoreText(module1.score, module1.total)}
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 p-4 text-sm">
              <div className="text-gray-500">모듈 2</div>
              <div className="mt-1 text-lg font-semibold">
                {scoreText(module2.score, module2.total)}
              </div>
            </div>
          </div>
        </section>
      </header>

      <ModuleReviewSection
        title="모듈 1 해설"
        score={scoreText(module1.score, module1.total)}
        questions={m1Questions}
      />
      <ModuleReviewSection
        title="모듈 2 해설"
        score={scoreText(module2.score, module2.total)}
        questions={m2Questions}
      />
    </main>
  );
}
