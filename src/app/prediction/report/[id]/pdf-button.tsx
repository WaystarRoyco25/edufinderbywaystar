"use client";

export function PdfButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#3b82f6] shadow-sm transition hover:bg-blue-50 print:hidden"
    >
      Export as PDF
    </button>
  );
}
