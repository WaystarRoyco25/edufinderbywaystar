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
  questions: Question[];
};

type SubmitResult = {
  score: number;
  total: number;
  results: {
    id: string;
    correct_answer: string;
    picked_answer: string | null;
    is_correct: boolean;
  }[];
};

export default function ModulePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StartResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/challenge/api/module/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ difficulty: "standard" }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to start module");
        setData(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start module");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onSubmit() {
    if (!data) return;
    setSubmitting(true);
    try {
      const res = await fetch("/challenge/api/module/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ module_id: data.module_id, answers }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Submit failed");
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <main className="p-8">모의고사를 불러오는 중...</main>;
  if (error) return <main className="p-8 text-red-600">오류: {error}</main>;
  if (!data) return null;

  if (result) {
    return (
      <main className="mx-auto max-w-3xl p-6 space-y-4">
        <h1 className="text-2xl font-semibold">
          점수: {result.score} / {result.total}
        </h1>
        <p className="text-gray-600">
          {Math.round((result.score / result.total) * 100)}%
        </p>
        <a href="/challenge/module" className="inline-block rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700">
          다른 모의고사 응시하기
        </a>
      </main>
    );
  }

  const q = data.questions[index];
  const picked = answers[q.id];

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {index + 1} / {data.questions.length} 번 문제 · {q.question_type}
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

        {index < data.questions.length - 1 ? (
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
            {submitting ? "제출 중..." : "모의고사 제출"}
          </button>
        )}
      </footer>
    </main>
  );
}
