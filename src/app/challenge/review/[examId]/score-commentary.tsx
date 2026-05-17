"use client";

import { useEffect } from "react";
import { getScoreCommentaryBucket } from "./score-commentary-data";
import type { ScoreCommentaryBucket } from "./score-commentary-data";

export { getScoreCommentaryBucket, type ScoreCommentaryBucket };

type AdviceTile = {
  label: string;
  title: string;
  body?: string;
  items?: string[];
};

function AdviceTileCard({ tile, index }: { tile: AdviceTile; index: number }) {
  return (
    <article className="rounded-lg border border-[#1f2937]/10 bg-white p-4 shadow-[0_10px_30px_rgba(31,41,55,0.06)]">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#3b82f6] text-xs font-black text-white">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#3b82f6]">
            {tile.label}
          </p>
          <h3 className="text-base font-black leading-tight text-[#1f2937]">
            {tile.title}
          </h3>
        </div>
      </div>
      {tile.items ? (
        <ul className="space-y-2 text-sm leading-6 text-[#1f2937]/80">
          {tile.items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#3b82f6]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-6 text-[#1f2937]/80">{tile.body}</p>
      )}
    </article>
  );
}

export default function ScoreCommentaryModal({
  score,
  total,
  onDismiss,
}: {
  score: number;
  total: number;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const bucket = getScoreCommentaryBucket(score);
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const boundedPct = Math.min(100, Math.max(0, pct));
  const tiles: AdviceTile[] = [
    {
      label: "What this means",
      title: "Your current pattern",
      body: bucket.meaning,
    },
    {
      label: "This week",
      title: "Your 3 priorities",
      items: bucket.priorities,
    },
    {
      label: "Next 30 days",
      title: "Practice routine",
      body: bucket.routine,
    },
    {
      label: "Avoid",
      title: "What slows growth",
      body: bucket.avoid,
    },
  ];

  const stats = [
    { label: "Raw score", value: `${score} / ${total}` },
    { label: "Correct", value: `${pct}%` },
    { label: "Score identity", value: bucket.identity },
    { label: "SAT range", value: bucket.range.replace("Equivalent SAT score ", "") },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#1f2937]/55 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="score-commentary-title"
    >
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-[#1f2937]/10 bg-white shadow-2xl">
        <header className="bg-[#1f2937] px-5 py-5 text-white sm:px-8 sm:py-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0 flex-1">
              <p className="inline-flex rounded-lg bg-[#3b82f6] px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white">
                The Challenge! Score Coach
              </p>
              <h2
                id="score-commentary-title"
                className="mt-4 text-3xl font-black leading-none tracking-normal text-white sm:text-4xl"
              >
                {bucket.identity}
              </h2>
              <p className="mt-3 max-w-2xl text-base font-medium leading-7 text-white/80">
                {bucket.message}
              </p>
            </div>
            <div className="w-full rounded-lg border border-white/15 bg-white/10 p-4 sm:w-40">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/70">
                Score
              </p>
              <p className="mt-1 text-3xl font-black leading-none text-white">
                {score}
                <span className="text-lg text-white/60">/{total}</span>
              </p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-[#3b82f6]"
                  style={{ width: `${boundedPct}%` }}
                  aria-hidden="true"
                />
              </div>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-2 border-b border-[#1f2937]/10 bg-white p-4 sm:grid-cols-4 sm:px-8">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-[#1f2937]/10 bg-[#1f2937]/5 px-3 py-3"
            >
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#1f2937]/55">
                {stat.label}
              </p>
              <p className="mt-1 text-sm font-black leading-5 text-[#1f2937]">
                {stat.value}
              </p>
            </div>
          ))}
        </section>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
          <div className="grid gap-3 md:grid-cols-2">
            {tiles.map((tile, index) => (
              <AdviceTileCard key={tile.label} tile={tile} index={index} />
            ))}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#1f2937]/10 bg-white px-5 py-4 sm:px-8 sm:py-5">
          <p className="max-w-xl text-sm leading-6 text-[#1f2937]/70">
            <span className="font-black text-[#1f2937]">{bucket.cta}</span>{" "}
            Read this coach card first, then use the explanations to find the
            exact questions behind the pattern.
          </p>
          <button
            type="button"
            onClick={onDismiss}
            className="h-11 w-full rounded-lg bg-[#3b82f6] px-5 text-sm font-black text-white shadow-[0_12px_24px_rgba(59,130,246,0.24)] transition hover:bg-[#1f2937] sm:w-auto"
          >
            Review My Questions
          </button>
        </footer>
      </div>
    </div>
  );
}
