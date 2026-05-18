"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const EMBED_HEIGHT_MESSAGE = "edufinder:embed-height";

export default function EmbeddedDraftFrame({
  title,
  description,
  src,
  closeHref,
  heightClassName,
  showHeader = true,
}: {
  title: string;
  description: string;
  src: string;
  closeHref: string;
  heightClassName: string;
  showHeader?: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [contentHeight, setContentHeight] = useState<number | null>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { type?: unknown; height?: unknown };
      if (
        data?.type !== EMBED_HEIGHT_MESSAGE ||
        typeof data.height !== "number" ||
        !Number.isFinite(data.height) ||
        data.height <= 0
      ) {
        return;
      }
      setContentHeight(Math.ceil(data.height));
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <section className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
      {showHeader && (
        <div className="flex flex-col gap-3 border-b border-gray-100 bg-gray-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          </div>
          <Link
            href={closeHref}
            className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-center text-sm font-medium text-gray-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#3b82f6]"
          >
            Close
          </Link>
        </div>
      )}
      <iframe
        ref={iframeRef}
        title={title}
        src={src}
        className={`block w-full border-0 bg-white ${
          contentHeight === null ? heightClassName : ""
        }`}
        style={contentHeight === null ? undefined : { height: contentHeight }}
      />
    </section>
  );
}
