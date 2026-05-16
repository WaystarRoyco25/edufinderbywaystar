import { Fragment, type ReactNode } from "react";

// Report prose arrives with key phrases wrapped in **double asterisks** so the
// long paragraphs stay scannable. This renders those spans as <strong> and
// leaves everything else as plain text.
const BOLD_PATTERN = /\*\*([^*\n]+)\*\*/g;

export function RichText({ text }: { text?: string | null }) {
  if (!text) return null;

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of text.matchAll(BOLD_PATTERN)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      nodes.push(<Fragment key={key++}>{text.slice(lastIndex, start)}</Fragment>);
    }
    nodes.push(
      <strong key={key++} className="font-semibold text-gray-900">
        {match[1]}
      </strong>,
    );
    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(<Fragment key={key++}>{text.slice(lastIndex)}</Fragment>);
  }

  return <>{nodes}</>;
}
