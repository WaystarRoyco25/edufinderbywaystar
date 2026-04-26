"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import QuestionTable, { type QuestionTableData } from "../../module/question-table";
import ExportPdfButton from "./export-pdf-button";
import ScoreCommentaryModal from "./score-commentary";

export type ChoiceLetter = "A" | "B" | "C" | "D";

const CHOICE_LETTERS: ChoiceLetter[] = ["A", "B", "C", "D"];
const MISSING_EXPLANATION = "No explanation is available yet.";

export type QuestionRow = {
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
  // v2 structural extras; legacy rows have null/undefined.
  table_json?: QuestionTableData | null;
  underlined_text?: string | null;
  text_1?: string | null;
  text_2?: string | null;
  highlighted_word?: string | null;
  notes_bullets?: string[] | null;
};

export type ReviewQuestion = {
  number: number;
  moduleNumber: 1 | 2;
  question: QuestionRow | null;
  questionId: string;
  picked: string | null;
  correct: string | null;
};

export type ReviewSummary = {
  startedAt: string;
  totalScore: number;
  totalMax: number;
  pct: number;
  module1Score: string;
  module2Score: string;
};

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

function ChoiceReview({
  question,
  letter,
  picked,
  correct,
  isOpen,
  onSelect,
}: {
  question: QuestionRow;
  letter: ChoiceLetter;
  picked: string | null;
  correct: string | null;
  isOpen: boolean;
  onSelect: () => void;
}) {
  const isPicked = picked === letter;
  const isCorrect = correct === letter;
  const stateClass = isCorrect
    ? "border-green-600 bg-green-50"
    : isPicked
      ? "border-red-500 bg-red-50"
      : "border-gray-200 bg-white";

  return (
    <div className={`rounded-lg border shadow-sm ${stateClass}`}>
      <button
        type="button"
        onClick={onSelect}
        aria-expanded={isOpen}
        className="w-full p-4 text-left"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <span className="font-medium text-gray-950">
            <span className="mr-2 font-semibold">{letter}.</span>
            {question.choices?.[letter] ?? ""}
          </span>
          <span className="flex gap-2 text-xs font-semibold">
            {isPicked && (
              <span className={isCorrect ? "text-green-700" : "text-red-700"}>
                Your Answer
              </span>
            )}
            {isCorrect && <span className="text-green-700">Correct Answer</span>}
          </span>
        </div>
      </button>
      {isOpen && (
        <p className="mx-4 mb-4 border-t border-gray-200 pt-3 text-sm leading-6 text-gray-700 whitespace-pre-wrap">
          {explanationFor(question, letter, correct)}
        </p>
      )}
    </div>
  );
}

function MissingQuestion({ item }: { item: ReviewQuestion }) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
      Question {item.number} could not be loaded. Question ID: {item.questionId}
    </section>
  );
}

export default function ReviewClient({
  summary,
  questions,
}: {
  summary: ReviewSummary;
  questions: ReviewQuestion[];
}) {
  const [index, setIndex] = useState(0);
  const [openChoiceByQuestion, setOpenChoiceByQuestion] = useState<
    Record<string, ChoiceLetter>
  >({});
  const [showCommentary, setShowCommentary] = useState(true);
  const item = questions[index];
  const total = questions.length;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [index]);

  function goTo(nextIndex: number) {
    setIndex(Math.min(total - 1, Math.max(0, nextIndex)));
  }

  function selectExplanation(questionId: string, letter: ChoiceLetter) {
    setOpenChoiceByQuestion((prev) => ({ ...prev, [questionId]: letter }));
  }

  const resultLabel = !item?.picked
    ? "Unanswered"
    : item.picked === item.correct
      ? "Correct"
      : "Incorrect";
  const resultClass = !item?.picked
    ? "text-gray-600"
    : item.picked === item.correct
      ? "text-green-700"
      : "text-red-700";

  return (
    <>
    <main className="mx-auto max-w-6xl p-6 space-y-6">
      <header className="space-y-4 border-b border-gray-200 pb-4">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/challenge/dashboard"
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition"
          >
            ← Dashboard
          </Link>
          <div className="text-right text-sm">
            <div className="font-semibold text-gray-800">
              Total Score {summary.totalScore} / {summary.totalMax}
              <span className="ml-1 text-gray-500">({summary.pct}%)</span>
            </div>
            <div className="text-gray-500">
              Module 1 {summary.module1Score} · Module 2 {summary.module2Score}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-wide">Practice Test Review</h1>
            <p className="mt-1 text-sm text-gray-500">
              Practice test started on {summary.startedAt}
            </p>
          </div>
          <div className="text-sm font-medium text-gray-600">
            {index + 1} / {total}
          </div>
        </div>
      </header>

      {item ? (
        <>
          <div className="flex items-center justify-between text-sm text-gray-500">
            <div>
              Module {item.moduleNumber} · Question {item.number}
              {item.question ? ` · ${item.question.question_type}` : ""}
            </div>
            <div className={resultClass}>
              {resultLabel} · Your answer {item.picked ?? "Unanswered"} · Correct answer {item.correct ?? "-"}
            </div>
          </div>

          {!item.question ? (
            <MissingQuestion item={item} />
          ) : (
            <div
              className={
                item.question.passage
                  ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:items-start"
                  : "mx-auto max-w-3xl"
              }
            >
              {item.question.passage && (
                <section className="rounded-lg border border-gray-100 bg-white p-5 text-sm leading-6 shadow-sm whitespace-pre-wrap">
                  {item.question.table_json ? <QuestionTable table={item.question.table_json} /> : null}
                  {item.question.passage}
                </section>
              )}

              <section className="space-y-4 rounded-lg border border-gray-100 bg-white p-5 shadow-sm lg:sticky lg:top-6">
                <p className="font-semibold leading-7 text-gray-950">{item.question.stem}</p>
                <div className="space-y-3">
                  {CHOICE_LETTERS.map((letter) => (
                    <ChoiceReview
                      key={letter}
                      question={item.question!}
                      letter={letter}
                      picked={item.picked}
                      correct={item.correct}
                      isOpen={openChoiceByQuestion[item.questionId] === letter}
                      onSelect={() => selectExplanation(item.questionId, letter)}
                    />
                  ))}
                </div>
                <div className="border-t border-gray-100 pt-4">
                  <ExportPdfButton summary={summary} questions={questions} />
                </div>
              </section>
            </div>
          )}
        </>
      ) : (
        <section className="rounded-lg border border-gray-100 bg-white p-4 text-sm text-gray-600 shadow-sm">
          No review is available to display.
        </section>
      )}

      <footer className="flex items-center justify-between border-t border-gray-200 pt-4">
        <button
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-40 transition"
        >
          Previous
        </button>

        {index < total - 1 ? (
          <button
            onClick={() => goTo(index + 1)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white font-semibold shadow hover:bg-blue-700 transition"
          >
            Next Explanation
          </button>
        ) : (
          <Link
            href="/challenge/dashboard"
            className="rounded-lg bg-blue-600 px-4 py-2 text-white font-semibold shadow hover:bg-blue-700 transition"
          >
            Back to Dashboard
          </Link>
        )}
      </footer>
    </main>
    {showCommentary && (
      <ScoreCommentaryModal
        score={summary.totalScore}
        total={summary.totalMax}
        onDismiss={() => setShowCommentary(false)}
      />
    )}
    </>
  );
}
