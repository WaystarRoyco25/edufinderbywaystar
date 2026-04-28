"use client";

import { useState } from "react";
import { getScoreCommentaryBucket } from "./score-commentary";
import type {
  ChoiceLetter,
  QuestionRow,
  ReviewQuestion,
  ReviewSummary,
} from "./review-client";

const CHOICE_LETTERS: ChoiceLetter[] = ["A", "B", "C", "D"];
const MISSING_EXPLANATION = "No explanation is available yet.";

type ExportPdfButtonProps = {
  summary: ReviewSummary;
  questions: ReviewQuestion[];
  className?: string;
  buttonClassName?: string;
};

type AssetUrls = {
  logo: string;
  watermark: string;
};

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPE[char]);
}

function renderMultiline(value: string | null | undefined): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function explanationFor(
  question: QuestionRow,
  letter: ChoiceLetter,
  correct: string | null,
): string {
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

function renderTable(question: QuestionRow): string {
  if (!question.table_json) return "";

  const header = question.table_json.columns
    .map((column) => `<th>${escapeHtml(column)}</th>`)
    .join("");
  const rows = question.table_json.rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`,
    )
    .join("");

  return `
    <figure class="data-table">
      <figcaption>${escapeHtml(question.table_json.caption)}</figcaption>
      <table>
        <thead><tr>${header}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </figure>
  `;
}

function renderChoiceExplanation(
  question: QuestionRow,
  letter: ChoiceLetter,
  picked: string | null,
  correct: string | null,
): string {
  const isPicked = picked === letter;
  const isCorrect = correct === letter;
  const shouldShowExplanation = isPicked || isCorrect;
  const stateClass = isCorrect ? " is-correct" : isPicked ? " is-picked" : "";
  const badges = [
    isPicked ? '<span class="badge picked">Your answer</span>' : "",
    isCorrect ? '<span class="badge correct">Correct answer</span>' : "",
  ].join("");

  return `
    <section class="choice${stateClass}">
      <header>
        <p><strong>${letter}.</strong> ${escapeHtml(question.choices?.[letter])}</p>
        <div>${badges}</div>
      </header>
      ${
        shouldShowExplanation
          ? `<p class="explanation">${renderMultiline(explanationFor(question, letter, correct))}</p>`
          : ""
      }
    </section>
  `;
}

function isMissedQuestion(item: ReviewQuestion): boolean {
  return item.picked !== item.correct;
}

function renderQuestion(item: ReviewQuestion): string {
  if (!item.question) {
    return `
      <article class="question-card">
        <header class="question-header">
          <div>
            <p class="eyebrow">Module ${item.moduleNumber} &middot; Question ${item.number}</p>
            <h2>Question could not be loaded</h2>
          </div>
        </header>
        <p class="missing">Question ID: ${escapeHtml(item.questionId)}</p>
      </article>
    `;
  }

  const question = item.question;
  const choices = CHOICE_LETTERS.map((letter) =>
    renderChoiceExplanation(question, letter, item.picked, item.correct),
  ).join("");

  return `
    <article class="question-card">
      <header class="question-header">
        <div>
          <p class="eyebrow">Module ${item.moduleNumber} &middot; Question ${item.number} &middot; ${escapeHtml(question.question_type)}</p>
          <h2>Missed Question</h2>
        </div>
      </header>

      <div class="question-layout">
        <div class="question-main">
          ${
            question.passage
              ? `<section class="passage">${renderTable(question)}<p>${renderMultiline(question.passage)}</p></section>`
              : ""
          }
          <section class="stem">
            <h3>Question</h3>
            <p>${renderMultiline(question.stem)}</p>
          </section>
          <section class="choices">
            <h3>Answer Choices</h3>
            ${choices}
          </section>
        </div>
      </div>
    </article>
  `;
}

function buildExportHtml(
  summary: ReviewSummary,
  questions: ReviewQuestion[],
  assets: AssetUrls,
): string {
  const commentary = getScoreCommentaryBucket(summary.totalScore);
  const generatedAt = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
  const missedQuestions = questions.filter(isMissedQuestion);
  const hasMissedQuestions = missedQuestions.length > 0;
  const questionHtml = missedQuestions.map(renderQuestion).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>EduFinder Practice Test Review</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
  <style>
    @page {
      size: letter;
      margin: 0.55in;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      margin: 0;
      color: #1f2937;
      background: #ffffff;
      font-family: "Pretendard", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 9.3pt;
      line-height: 1.38;
    }

    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      width: 5.8in;
      max-width: 76vw;
      transform: translate(-50%, -50%);
      filter: brightness(0);
      opacity: 0.055;
      z-index: 0;
      pointer-events: none;
    }

    .packet {
      position: relative;
      z-index: 1;
    }

    .cover {
      display: grid;
      gap: 0.24in;
    }

    .cover.has-questions {
      break-after: page;
    }

    .brand-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.3in;
      min-height: 0.9in;
      padding: 0.2in 0.26in;
      border-radius: 10px;
      background: #3b82f6;
      color: #ffffff;
      box-shadow: 0 12px 30px rgba(59, 130, 246, 0.16);
    }

    .brand-header img {
      width: 2.45in;
      height: auto;
      display: block;
    }

    .brand-header p {
      margin: 0;
      text-align: right;
      font-size: 9pt;
      line-height: 1.45;
      color: #dbeafe;
    }

    h1, h2, h3, p {
      margin: 0;
    }

    h1 {
      font-size: 21pt;
      line-height: 1.15;
      letter-spacing: 0;
      color: #111827;
    }

    h2 {
      font-size: 13.5pt;
      line-height: 1.25;
      letter-spacing: 0;
      color: #111827;
    }

    h3 {
      margin-bottom: 0.08in;
      font-size: 9.5pt;
      text-transform: uppercase;
      color: #3b82f6;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.12in;
    }

    .summary-grid div,
    .commentary,
    .question-card {
      border: 1px solid #dbe4f0;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.92);
    }

    .summary-grid div {
      padding: 0.12in;
    }

    .summary-grid span,
    .eyebrow {
      display: block;
      color: #64748b;
      font-size: 8pt;
      font-weight: 700;
      text-transform: uppercase;
    }

    .summary-grid strong {
      display: block;
      margin-top: 0.03in;
      color: #111827;
      font-size: 13pt;
    }

    .commentary {
      margin-top: 0.16in;
      padding: 0.22in;
      break-inside: avoid-page;
    }

    .commentary .range {
      margin-bottom: 0.1in;
      color: #3b82f6;
      font-size: 9pt;
      font-weight: 800;
      text-transform: uppercase;
    }

    .commentary p + p {
      margin-top: 0.12in;
    }

    .questions {
      margin-top: 0;
    }

    .question-card {
      margin: 0;
      min-height: 9.85in;
      padding: 0.18in;
      break-after: page;
      break-inside: avoid-page;
      page-break-after: always;
      page-break-inside: avoid;
    }

    .question-card:last-child {
      break-after: auto;
      page-break-after: auto;
    }

    .question-header {
      display: flex;
      justify-content: space-between;
      gap: 0.2in;
      padding-bottom: 0.1in;
      border-bottom: 1px solid #e5e7eb;
    }

    .question-layout {
      margin-top: 0.12in;
    }

    .passage,
    .stem,
    .choices {
      margin-bottom: 0.12in;
    }

    .passage {
      padding: 0.12in;
      border-radius: 8px;
      background: #f8fafc;
      color: #334155;
      white-space: normal;
    }

    .stem p {
      color: #111827;
      font-weight: 700;
    }

    .data-table {
      margin: 0 0 0.14in;
    }

    .data-table figcaption {
      margin-bottom: 0.06in;
      color: #475569;
      font-size: 8.5pt;
      font-weight: 700;
      text-align: center;
    }

    .data-table table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.2pt;
    }

    .data-table th,
    .data-table td {
      border: 1px solid #cbd5e1;
      padding: 0.05in 0.06in;
      text-align: left;
      vertical-align: top;
    }

    .data-table th {
      background: #eef2ff;
      color: #111827;
    }

    .choice {
      margin-top: 0.1in;
      padding: 0.1in;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      background: #ffffff;
    }

    .choice.is-correct {
      border-color: #16a34a;
      background: #f0fdf4;
    }

    .choice.is-picked:not(.is-correct) {
      border-color: #ef4444;
      background: #fef2f2;
    }

    .choice header {
      display: flex;
      justify-content: space-between;
      gap: 0.12in;
      align-items: flex-start;
    }

    .choice header p {
      color: #111827;
      font-weight: 650;
    }

    .choice .explanation {
      margin-top: 0.06in;
      padding-top: 0.06in;
      border-top: 1px solid rgba(148, 163, 184, 0.45);
      color: #334155;
    }

    .badge {
      display: inline-block;
      margin-left: 0.04in;
      color: #475569;
      font-size: 7.5pt;
      font-weight: 800;
      white-space: nowrap;
    }

    .badge.correct {
      color: #15803d;
    }

    .badge.picked {
      color: #b91c1c;
    }

    .missing {
      margin-top: 0.12in;
      color: #92400e;
    }

    @media screen {
      body {
        padding: 0.5in;
        background: #e5e7eb;
      }

      .packet {
        max-width: 8.5in;
        margin: 0 auto;
        padding: 0.55in;
        background: #ffffff;
        box-shadow: 0 18px 50px rgba(15, 23, 42, 0.18);
      }
    }
  </style>
</head>
<body>
  <img class="watermark" src="${assets.watermark}" alt="">
  <main class="packet">
    <section class="cover${hasMissedQuestions ? " has-questions" : ""}">
      <header class="brand-header">
        <img src="${assets.logo}" alt="EduFinder by Waystar">
        <p>Challenge! Series<br>Practice Test Review Packet<br>Generated ${escapeHtml(generatedAt)}</p>
      </header>

      <div>
        <h1>Missed Question Review</h1>
        <p class="eyebrow">Started ${escapeHtml(summary.startedAt)}</p>
      </div>

      <section class="summary-grid" aria-label="Score summary">
        <div><span>Total Score</span><strong>${summary.totalScore} / ${summary.totalMax}</strong></div>
        <div><span>Percent</span><strong>${summary.pct}%</strong></div>
        <div><span>Module 1</span><strong>${escapeHtml(summary.module1Score)}</strong></div>
        <div><span>Module 2</span><strong>${escapeHtml(summary.module2Score)}</strong></div>
      </section>

      <section class="commentary">
        <p class="range">${escapeHtml(commentary.range)}</p>
        ${commentary.body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
      </section>
    </section>

    ${
      questionHtml
        ? `<section class="questions">${questionHtml}</section>`
        : ""
    }
  </main>
</body>
</html>`;
}

function waitForFrameLoad(frame: HTMLIFrameElement): Promise<void> {
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!win || !doc || doc.readyState === "complete") return Promise.resolve();

  return new Promise((resolve) => {
    const timeout = window.setTimeout(resolve, 700);
    win.addEventListener(
      "load",
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

async function waitForPrintAssets(doc: Document): Promise<void> {
  await doc.fonts?.ready.catch(() => undefined);
  await Promise.all(
    Array.from(doc.images).map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  );
}

export default function ExportPdfButton({
  summary,
  questions,
  className = "",
  buttonClassName = "w-full rounded-lg bg-[#3b82f6] px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-[#3b82f6] disabled:cursor-not-allowed disabled:opacity-60",
}: ExportPdfButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setError(null);
    setIsExporting(true);

    const frame = document.createElement("iframe");
    frame.title = "EduFinder PDF export";
    frame.setAttribute("aria-hidden", "true");
    Object.assign(frame.style, {
      border: "0",
      bottom: "0",
      height: "0",
      opacity: "0",
      position: "fixed",
      right: "0",
      width: "0",
    });

    document.body.appendChild(frame);

    try {
      const printWindow = frame.contentWindow;
      const printDocument = frame.contentDocument;
      if (!printWindow || !printDocument) {
        throw new Error("The print frame could not be created.");
      }

      const origin = window.location.origin;
      const html = buildExportHtml(summary, questions, {
        logo: `${origin}/EduFinder.svg`,
        watermark: `${origin}/EduFinder_Watermark.svg`,
      });

      printDocument.open();
      printDocument.write(html);
      printDocument.close();

      await waitForFrameLoad(frame);
      await waitForPrintAssets(printDocument);

      const cleanup = () => {
        window.setTimeout(() => frame.remove(), 1000);
      };
      printWindow.addEventListener("afterprint", cleanup, { once: true });
      window.setTimeout(cleanup, 60000);
      printWindow.focus();
      printWindow.print();
    } catch {
      frame.remove();
      setError("PDF export could not start. Use the browser print command and choose Save as PDF.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={isExporting}
        className={buttonClassName}
      >
        {isExporting ? "Preparing PDF..." : "Export as PDF"}
      </button>
      {error && (
        <p role="alert" className="text-xs leading-5 text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
