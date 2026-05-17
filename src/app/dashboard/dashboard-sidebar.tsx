"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ServiceOwnership } from "@/lib/dashboard/ownership";

const SERVICES = [
  {
    key: "challenge",
    label: "The Challenge! Series",
    tagline: "SAT practice tests",
    href: "/dashboard/challenge",
  },
  {
    key: "insight",
    label: "The Insight! Report",
    tagline: "College admission chances",
    href: "/dashboard/prediction",
  },
  {
    key: "genius",
    label: "The Genius! Editor",
    tagline: "Application essay idea boards",
    href: "/dashboard/genius",
  },
] as const;

export default function DashboardSidebar({
  ownership,
}: {
  ownership: ServiceOwnership;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="EduFinder services"
      className="flex gap-2 overflow-x-auto pb-1 sm:w-56 sm:shrink-0 sm:flex-col sm:gap-2 sm:overflow-visible sm:pb-0"
    >
      {SERVICES.map((service) => {
        const active =
          pathname === service.href ||
          pathname.startsWith(`${service.href}/`);
        const owned = ownership[service.key];
        return (
          <Link
            key={service.key}
            href={service.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-w-[180px] flex-1 flex-col rounded-lg border px-4 py-3 transition sm:min-w-0 sm:flex-none ${
              active
                ? "border-[#3b82f6] bg-[#3b82f6] text-white shadow-sm"
                : "border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:bg-blue-50"
            }`}
          >
            <span className="text-sm font-semibold">{service.label}</span>
            <span
              className={`mt-0.5 text-xs ${
                active ? "text-blue-100" : "text-gray-500"
              }`}
            >
              {service.tagline}
            </span>
            {!owned && (
              <span
                className={`mt-2 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  active
                    ? "bg-white/20 text-white"
                    : "bg-amber-50 text-amber-600"
                }`}
              >
                Explore
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
