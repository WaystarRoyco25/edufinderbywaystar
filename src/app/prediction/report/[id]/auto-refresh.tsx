"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const TERMINAL_STATUSES = ["completed", "needs_review", "failed"];

// While a report is queued or processing, quietly poll the status endpoint and
// re-render the page the moment it finishes, so the visitor never has to refresh.
export function AutoRefresh({ reportId }: { reportId: string }) {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    const check = async () => {
      try {
        const response = await fetch(
          `/prediction/api/report/status?reportId=${encodeURIComponent(reportId)}`,
          { headers: { Accept: "application/json" }, cache: "no-store" },
        );
        if (!active || !response.ok) return;
        const data = (await response.json()) as { status?: string };
        if (data.status && TERMINAL_STATUSES.includes(data.status)) {
          router.refresh();
        }
      } catch {
        // Transient network error — keep polling on the next tick.
      }
    };

    const timer = window.setInterval(check, 12_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [reportId, router]);

  return null;
}
