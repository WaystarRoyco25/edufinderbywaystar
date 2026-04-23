"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Question = {
  id: string;
  question_type: string;
  passage: string;
  stem: string;
  choices: Record<"A" | "B" | "C" | "D", string>;
};

type TakingResponse = {
  kind: "taking";
  module_id: string;
  difficulty: "standard" | "harder";
  module_number: 1 | 2;
  parent_module_id: string | null;
  questions: Question[];
  expires_at: string;
  current_index: number;
  answers: Record<string, string>;
};

type SubmittedResponse = {
  kind: "submitted";
  module_id: string;
  module_number: 1 | 2;
  parent_module_id: string | null;
  score: number;
  total: number;
  reason: "already_submitted" | "auto_submitted_on_resume";
};

type StartResponse = TakingResponse | SubmittedResponse;

type SubmitResult = {
  score: number;
  total: number;
  module_number: 1 | 2;
  next_module:
    | { parent_module_id: string; difficulty: "standard" | "harder" }
    | null;
};

type Phase = "loading" | "taking" | "between" | "done" | "error";

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ModuleClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<TakingResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [module1Result, setModule1Result] = useState<SubmitResult | null>(null);
  const [module2Result, setModule2Result] = useState<SubmitResult | null>(null);

  const startedRef = useRef(false);
  const autoSubmittingRef = useRef(false);

  const onSubmit = useCallback(
    async (silent = false) => {
      if (!current || autoSubmittingRef.current) return;
      if (silent) autoSubmittingRef.current = true;
      setSubmitting(true);
      try {
        const res = await fetch("/challenge/api/module/submit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ module_id: current.module_id, answers }),
        });
        if (!res.ok) {
          // If the server already finalized this module (expired) we just
          // bounce to the dashboard — nothing useful to show here.
          if (res.status === 409) {
            router.push("/challenge/dashboard");
            return;
          }
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
    },
    [current, answers, router],
  );

  // --- Fire the start/resume request once on mount -----------------------
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const moduleId = searchParams.get("id");
    const parentId = searchParams.get("parent");
    const isNew = searchParams.get("new") === "1";

    // Without any of these query params we have no idea what the user
    // wants — send them back to the dashboard to pick.
    if (!moduleId && !parentId && !isNew) {
      router.replace("/challenge/dashboard");
      return;
    }

    const body: Record<string, string> = {};
    if (moduleId) body.module_id = moduleId;
    else if (parentId) body.parent_module_id = parentId;

    (async () => {
      try {
        const res = await fetch("/challenge/api/module/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new Error((await res.json()).error ?? "Failed to start module");
        }
        const data = (await res.json()) as StartResponse;

        if (data.kind === "submitted") {
          // Already done (or auto-graded on resume). Dashboard is the right
          // place to view the score.
          router.replace("/challenge/dashboard");
          return;
        }

        setCurrent(data);
        setAnswers(data.answers ?? {});
        setIndex(Math.min(data.current_index ?? 0, data.questions.length - 1));
        const remainingMs = new Date(data.expires_at).getTime() - Date.now();
        setSecondsLeft(Math.max(0, Math.floor(remainingMs / 1000)));
        setPhase("taking");

        // Canonicalize the URL so a refresh lands on the same module.
        if (!moduleId) {
          router.replace(`/challenge/module?id=${data.module_id}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start module");
        setPhase("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Countdown ---------------------------------------------------------
  useEffect(() => {
    if (phase !== "taking" || !current) return;
    const expiresAt = new Date(current.expires_at).getTime();
    const tick = () => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0 && !autoSubmittingRef.current) {
        void onSubmit(true);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [phase, current, onSubmit]);

  // --- Save progress, debounced -----------------------------------------
  // Previously every keystroke/nav fired a POST. At 10k concurrent users
  // that's a lot of DB writes for zero user-visible benefit — the server
  // only needs the latest state. Coalesce bursts into a single write ~500ms
  // after the user pauses.
  const saveTimerRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<{
    answers: Record<string, string>;
    index: number;
  } | null>(null);

  const flushSave = useCallback(() => {
    if (!current || !pendingSaveRef.current) return;
    const { answers: nextAnswers, index: nextIndex } = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    void fetch("/challenge/api/module/save-progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        module_id: current.module_id,
        answers: nextAnswers,
        current_index: nextIndex,
      }),
      keepalive: true,
    })
      .then(async (res) => {
        if (!res.ok) {
          // Used to swallow these silently, which is exactly how we ended up
          // with a bug where the DB never got the user's progress. Log the
          // server's response so the next regression is visible in devtools.
          const text = await res.text().catch(() => "");
          console.error("save-progress failed", { status: res.status, body: text });
          setSaveFailed(true);
          return;
        }
        setSaveFailed(false);
      })
      .catch((err) => {
        console.error("save-progress network error", err);
        setSaveFailed(true);
      });
  }, [current]);

  const saveProgress = useCallback(
    (nextAnswers: Record<string, string>, nextIndex: number) => {
      if (!current) return;
      pendingSaveRef.current = { answers: nextAnswers, index: nextIndex };
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(flushSave, 500);
    },
    [current, flushSave],
  );

  // Flush on tab close / navigation so we don't lose the final burst.
  // `keepalive: true` on the fetch lets it survive the unload.
  useEffect(() => {
    const onLeave = () => flushSave();
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [flushSave]);

  function pickAnswer(qid: string, letter: string) {
    const next = { ...answers, [qid]: letter };
    setAnswers(next);
    saveProgress(next, index);
  }

  function goTo(nextIndex: number) {
    setIndex(nextIndex);
    saveProgress(answers, nextIndex);
  }

  // --- Render ------------------------------------------------------------
  if (phase === "loading") {
    return (
      <main className="mx-auto max-w-3xl p-8 text-sm text-gray-500">
        모의고사를 불러오는 중...
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <section className="rounded-lg border border-gray-100 bg-white shadow-md p-6 space-y-4">
          <h1 className="text-2xl font-bold tracking-wide text-red-600">오류</h1>
          <p className="text-sm text-gray-700">{error}</p>
          <Link
            href="/challenge/dashboard"
            className="inline-block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition"
          >
            대시보드로 돌아가기
          </Link>
        </section>
      </main>
    );
  }

  if (phase === "between" && module1Result) {
    const next = module1Result.next_module;
    const pct = Math.round((module1Result.score / module1Result.total) * 100);
    return (
      <main className="mx-auto max-w-3xl p-6">
        <section className="rounded-lg border border-gray-100 bg-white shadow-md p-6 space-y-4">
          <h1 className="text-3xl font-bold tracking-wide">모듈 1 완료</h1>
          <p className="text-gray-700">
            모듈 1 점수: {module1Result.score} / {module1Result.total} ({pct}%)
          </p>
          <p className="text-gray-600">
            {next?.difficulty === "harder"
              ? "잘하셨습니다! 모듈 2는 더 어려운 문제 위주로 구성됩니다."
              : "모듈 2는 기본 난이도 위주로 구성됩니다."}
          </p>
          <div className="flex gap-2 pt-2">
            <Link
              href="/challenge/dashboard"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-gray-700 font-medium shadow-sm hover:bg-gray-50 transition"
            >
              대시보드로
            </Link>
            {next && (
              <Link
                href={`/challenge/module?parent=${next.parent_module_id}`}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white font-semibold shadow hover:bg-blue-700 transition"
              >
                모듈 2 시작하기
              </Link>
            )}
          </div>
        </section>
      </main>
    );
  }

  if (phase === "done" && module1Result && module2Result) {
    const totalScore = module1Result.score + module2Result.score;
    const totalMax = module1Result.total + module2Result.total;
    const pct = Math.round((totalScore / totalMax) * 100);
    return (
      <main className="mx-auto max-w-3xl p-6">
        <section className="rounded-lg border border-gray-100 bg-white shadow-md p-6 space-y-4">
          <h1 className="text-3xl font-bold tracking-wide">모의고사 완료</h1>
          <div className="space-y-1 text-gray-700">
            <p>
              모듈 1: {module1Result.score} / {module1Result.total}
            </p>
            <p>
              모듈 2: {module2Result.score} / {module2Result.total}
            </p>
            <p className="text-lg font-semibold pt-2">
              총점: {totalScore} / {totalMax} ({pct}%)
            </p>
          </div>
          <Link
            href="/challenge/dashboard"
            className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-white font-semibold shadow hover:bg-blue-700 transition"
          >
            대시보드로 돌아가기
          </Link>
        </section>
      </main>
    );
  }

  if (phase !== "taking" || !current) return null;

  const q = current.questions[index];
  const picked = answers[q.id];
  const lowTime = secondsLeft <= 5 * 60;

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <header className="flex items-center justify-between gap-4 border-b border-gray-200 pb-3">
        <Link
          href="/challenge/dashboard"
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition"
          title="진행 상태는 자동으로 저장됩니다"
        >
          ← 대시보드
        </Link>
        <div
          className={`font-mono text-lg font-semibold tabular-nums ${
            lowTime ? "text-red-600" : "text-gray-800"
          }`}
          aria-label="남은 시간"
        >
          ⏱ {formatClock(secondsLeft)}
        </div>
      </header>

      {saveFailed && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          진행 저장 실패 — 다음 답변 시 자동으로 재시도합니다. 문제가 지속되면
          페이지를 새로고침해주세요.
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-gray-500">
        <div>
          모듈 {current.module_number} · {index + 1} / {current.questions.length}번 문제 · {q.question_type}
        </div>
        <div>{Object.keys(answers).length}문제 답변 완료</div>
      </div>

      {q.passage && (
        <section className="rounded-lg border border-gray-100 bg-white p-4 text-sm leading-6 shadow-sm whitespace-pre-wrap">
          {q.passage}
        </section>
      )}

      <section className="space-y-4">
        <p className="font-semibold leading-7 text-gray-900">{q.stem}</p>
        <div className="space-y-2">
          {(["A", "B", "C", "D"] as const).map((letter) => (
            <label
              key={letter}
              className={`block cursor-pointer rounded-lg border bg-white p-3 shadow-sm transition-shadow hover:shadow ${
                picked === letter
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200"
              }`}
            >
              <input
                type="radio"
                name={q.id}
                className="mr-2"
                checked={picked === letter}
                onChange={() => pickAnswer(q.id, letter)}
              />
              <span className="font-semibold mr-2">{letter}.</span>
              {q.choices[letter]}
            </label>
          ))}
        </div>
      </section>

      <footer className="flex items-center justify-between">
        <button
          onClick={() => goTo(Math.max(0, index - 1))}
          disabled={index === 0}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-40 transition"
        >
          이전
        </button>

        {index < current.questions.length - 1 ? (
          <button
            onClick={() => goTo(index + 1)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white font-semibold shadow hover:bg-blue-700 transition"
          >
            다음
          </button>
        ) : (
          <button
            onClick={() => onSubmit(false)}
            disabled={submitting}
            className="rounded-lg bg-green-600 px-4 py-2 text-white font-semibold shadow hover:bg-green-700 disabled:opacity-60 transition"
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
