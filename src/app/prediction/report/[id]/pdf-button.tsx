"use client";

export function PdfButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center justify-center rounded-lg bg-[#3b82f6] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600 print:hidden"
    >
      Export as PDF
    </button>
  );
}
