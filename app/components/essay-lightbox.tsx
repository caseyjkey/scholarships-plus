/**
 * Essay Lightbox Component
 * Modal overlay for viewing full essay content
 * Displays essay metadata and full text in a centered modal
 */

import { useEffect } from "react";
import type { Source } from "~/types/chat";

interface EssayLightboxProps {
  source: Source | null;
  onClose: () => void;
}

export function EssayLightbox({ source, onClose }: EssayLightboxProps) {
  // Handle ESC key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (source) {
      document.addEventListener("keydown", handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [source, onClose]);

  if (!source) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lightbox-title"
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <h2 id="lightbox-title" className="text-lg font-semibold text-gray-900 truncate">
            {source.title}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Metadata */}
        <div className="px-4 py-2 bg-gray-50 flex items-center gap-4 text-sm text-gray-600 border-b">
          {source.awarded && (
            <span className="inline-flex items-center gap-1">
              🏆 <span>Awarded</span>
            </span>
          )}
          <span>
            {new Date(source.date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
          {source.relevance !== undefined && (
            <span className="text-blue-600">
              {source.relevance}% relevant
            </span>
          )}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 whitespace-pre-wrap text-gray-700 leading-relaxed">
          {source.content || source.excerpt}
        </div>
      </div>
    </div>
  );
}
