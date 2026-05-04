"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type ProgressExam = {
  id: string;
  displayDate: string;
  shortDate: string;
  module1Score: number;
  module1Total: number;
  module2Score: number;
  module2Total: number;
  score: number;
  total: number;
  pct: number;
};

type ChartPoint = ProgressExam & {
  x: number;
  y: number;
};

function chartPath(points: ChartPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

export default function CompletedProgressChart({
  exams,
}: {
  exams: ProgressExam[];
}) {
  const chronological = useMemo(() => [...exams].reverse(), [exams]);
  const [selectedId, setSelectedId] = useState(
    chronological[chronological.length - 1]?.id ?? null,
  );

  const points = useMemo<ChartPoint[]>(() => {
    const count = chronological.length;
    return chronological.map((exam, index) => {
      const pct = Math.max(0, Math.min(100, exam.pct));
      return {
        ...exam,
        x: count === 1 ? 50 : 10 + (index / (count - 1)) * 80,
        y: 88 - pct * 0.72,
      };
    });
  }, [chronological]);

  const rawSelectedIndex = points.findIndex((point) => point.id === selectedId);
  const selectedIndex = rawSelectedIndex >= 0 ? rawSelectedIndex : points.length - 1;
  const selected = points[selectedIndex];

  if (points.length === 0) {
    return (
      <div className="rounded-lg border border-gray-100 bg-white p-4 text-sm text-gray-500 shadow-sm">
        Your score chart will appear after your first completed practice test.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#3b82f6]">
            Progress Chart
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Latest {points.length} completed {points.length === 1 ? "test" : "tests"}
          </p>
        </div>
        {selected && (
          <div className="text-right text-sm">
            <p className="text-xl font-bold text-gray-900">
              {selected.score} / {selected.total}
            </p>
            <p className="text-gray-500">{selected.pct}%</p>
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="relative h-44 overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
          >
            {[16, 40, 64, 88].map((y) => (
              <line
                key={y}
                x1="6"
                x2="94"
                y1={y}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {points.length > 1 && (
              <path
                d={chartPath(points)}
                fill="none"
                stroke="#3b82f6"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {points.map((point) => {
            const isSelected = selected?.id === point.id;
            return (
              <button
                key={point.id}
                type="button"
                aria-label={`${point.displayDate}: ${point.score} out of ${point.total}`}
                aria-pressed={isSelected}
                onClick={() => setSelectedId(point.id)}
                onFocus={() => setSelectedId(point.id)}
                onMouseEnter={() => setSelectedId(point.id)}
                className={`absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-sm transition ${
                  isSelected
                    ? "border-[#3b82f6] bg-white ring-4 ring-blue-100"
                    : "border-white bg-[#3b82f6] hover:ring-4 hover:ring-blue-100"
                }`}
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
              />
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {points.map((point) => {
            const isSelected = selected?.id === point.id;
            return (
              <button
                key={point.id}
                type="button"
                onClick={() => setSelectedId(point.id)}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                  isSelected
                    ? "border-blue-200 bg-blue-50 text-[#3b82f6]"
                    : "border-gray-100 bg-white text-gray-600 hover:border-blue-200 hover:bg-blue-50"
                }`}
              >
                <span className="block font-semibold">{point.shortDate}</span>
                <span className="text-gray-500">
                  {point.score}/{point.total} ({point.pct}%)
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-3 text-sm sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-medium text-gray-800">{selected.displayDate}</p>
            <p className="text-gray-500">
              Module 1: {selected.module1Score}/{selected.module1Total} · Module 2:{" "}
              {selected.module2Score}/{selected.module2Total}
            </p>
          </div>
          <Link
            href={`/challenge/review/${selected.id}`}
            className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#3b82f6]"
          >
            Review Explanations
          </Link>
        </div>
      )}
    </div>
  );
}
