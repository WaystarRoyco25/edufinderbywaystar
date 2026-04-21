"use client";

import { useEffect, useState } from "react";

type Question = {
  id: string;
  question_type: string;
  passage: string;
  stem: string;
  choices: Record<"A" | "B" | "C" | "D", string>;
};

type StartResponse = {
  module_id: string;
  difficulty: "standard" | "harder";
  module_number: 1 | 2;
  parent_module_id: string | null;
  questions: Question[];
};

type SubmitResult = {
  score: number;
  total: number;
  module_number: 1 | 2;
  next_module:
    | { parent_module_id: string; difficulty: "standard" | "harder" }
    | null;
  results: {
    id: string;
    correct_answer: string;
    picked_answer: string | null;
    is_correct: boolean;
  }[];
};

type Phase = "loading" | "taking" | "between" | "done" | "error";

export default function ModulePage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<StartResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [module1Result, setModule1Result] = useState<SubmitResult | null>(null);
  const [module2Result, setModule2Result] = useState<SubmitResult | null>(null);

  async function loadModule(parentId: string | null) {
    setPhase("loading");
    setError(null);
    setAnswers({});
    setIndex(0);
    try {
      const res = await fetch("/challenge/api/module/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parentId ? { parent_module_id: parentId } : {}),
      });
      if (!res.ok) {
        throw new Error((await res.json()).error ?? "Failed to start module");
      }
      setCurrent(await res.json());
      setPhase("taking");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start module");
      setPhase("error");
    }
  }

  useEffect(() => {
    void loadModule(null);
  }, []);

  async function onSubmit() {
    if (!current) return;
    setSubmitting(true);
    try {
      const res = await fetch("/challenge/api/module/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ module_id: current.module_id, answers }),
      });
      if (!res.ok) {
        throw new Error((await res.json()).error ?? "Submit failed");
      }
      const result = (await res.json()) as SubmitResult;
      if (result.module_number === 1) {
        setModule1Result(result);
        setPhase("between");
      } else {
        setModule2Result(result);
        setPhase("done");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
      setPhase("error");
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === "loading") {
    return <main className="p-8">모의고사를 불러오는 중...</main>;
  }

  if (phase === "error") {
    return <main className="p-8 text-red-600">오류: {error}</main>;
  }

  if (phase === "between" && module1Result) {
    const next = module1Result.next_module;
    const pct = Math.round((module1Result.score / module1Result.total) * 100);
    return (
      <main className="mx-auto max-w-3xl p-6 space-y-4">
        <h1 className="text-2xl font-semibold">모듈 1 완료</h1>
        <p className="text-gray-700">
          모듈 1 점수: {module1Result.score} / {module1Result.total} ({pct}%)
        </p>
        <p className="text-gray-600">
          {next?.difficulty === "harder"
            ? "잘하셨습니다! 모듈 2는 더 어려운 문제 위주로 구성됩니다."
            : "모듈 2는 기본 난이도 위주로 구성됩니다."}
        </p>
        <button
          onClick={() => next && loadModule(next.parent_module_id)}
          className="rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700"
        >
          모듈 2 시작하기
        </button>
      </main>
    );
  }

  if (phase === "done" && module1Result && module2Result) {
    const totalScore = module1Result.score + module2Result.score;
    const totalMax = module1Result.total + module2Result.total;
    const pct = Math.round((totalScore / totalMax) * 100);
    return (
      <main className="mx-auto max-w-3xl p-6 space-y-4">
        <h1 className="text-2xl font-semibold">모의고사 완료</h1>
        <div className="space-y-1 text-gray-700">
          <p>
            모듈 1: {module1Result.score} / {module1Result.total}
          </p>
          <p>
            모듈 2: {module2Result.score} / {module2Result.total}
          </p>
          <p className="text-lg font-medium pt-2">
            총점: {totalScore} / {totalMax} ({pct}%)
          </p>
        </div>
        <a
          href="/challenge/module"
          className="inline-block rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700"
        >
          다른 모의고사 응시하기
        </a>
      </main>
    );
  }

  if (phase !== "taking" || !current) return null;

  const q = current.questions[index];
  const picked = answers[q.id];

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          모듈 {current.module_number} · {index + 1} / {current.questions.length} 번 문제 · {q.question_type}
        </div>
        <div className="text-sm text-gray-500">
          {Object.keys(answers).length}문제 답변 완료
        </div>
      </header>

      {q.passage && (
        <section className="rounded border p-4 text-sm whitespace-pre-wrap">
          {q.passage}
        </section>
      )}

      <section className="space-y-4">
        <p className="font-medium">{q.stem}</p>
        <div className="space-y-2">
          {(["A", "B", "C", "D"] as const).map((letter) => (
            <label
              key={letter}
              className={`block cursor-pointer rounded border p-3 ${
                picked === letter ? "border-black bg-gray-50" : ""
              }`}
            >
              <input
                type="radio"
                name={q.id}
                className="mr-2"
                checked={picked === letter}
                onChange={() => setAnswers({ ...answers, [q.id]: letter })}
              />
              <span className="font-semibold mr-2">{letter}.</span>
              {q.choices[letter]}
            </label>
          ))}
        </div>
      </section>

      <footer className="flex items-center justify-between">
        <button
          onClick={() => setIndex(Math.max(0, index - 1))}
          disabled={index === 0}
          className="rounded border px-3 py-2 disabled:opacity-40"
        >
          이전
        </button>

        {index < current.questions.length - 1 ? (
          <button
            onClick={() => setIndex(index + 1)}
            className="rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700"
          >
            다음
          </button>
        ) : (
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="rounded-md bg-green-600 px-4 py-2 text-white font-medium hover:bg-green-700 disabled:opacity-60"
          >
            {submitting
              ? "제출 중..."
              : current.module_number === 1
                ? "모듈 1 제출"
                : "모의고사 제출"}
          </button>
        )}
      </footer>
    </main>
  );
}
