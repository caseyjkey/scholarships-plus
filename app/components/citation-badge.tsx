/**
 * Citation Badge Component
 * Clickable numbered badge for citations like [1], [2]
 * Shows trophy icon if the source essay was awarded
 */

import type { Source } from "~/types/chat";

interface CitationBadgeProps {
  id: number;
  source: Source;
  onClick: () => void;
}

export function CitationBadge({ id, source, onClick }: CitationBadgeProps) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-medium rounded cursor-pointer transition-colors"
      title={source.title}
      type="button"
    >
      <span>[{id}]</span>
      {source.awarded && <span>🏆</span>}
    </button>
  );
}
