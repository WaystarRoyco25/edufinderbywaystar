import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export function ReportHeader({
  title,
  eyebrow,
  meta,
  actions,
}: {
  title: string;
  eyebrow?: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="overflow-hidden rounded-lg bg-[#3b82f6] shadow-sm">
      <div className="flex flex-col gap-5 px-5 py-6 sm:px-7 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Link href="/prediction" className="shrink-0">
            <Image
              src="/EduFinder.svg"
              alt="EduFinder by Waystar"
              width={1500}
              height={288}
              priority
              unoptimized
              className="h-7 w-auto md:h-8"
            />
          </Link>
          <div className="border-l border-white/30 pl-4">
            {eyebrow && (
              <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-100">
                {eyebrow}
              </p>
            )}
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
              {title}
            </h1>
            {meta && <div className="mt-1 text-sm text-blue-50">{meta}</div>}
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
