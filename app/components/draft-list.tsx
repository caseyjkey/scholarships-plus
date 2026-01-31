/**
 * Draft List Component
 * Displays list of generated essay drafts for an application
 */

import type { EssayDraftWithRelations } from "~/models/essay.server";

interface DraftListProps {
  drafts: EssayDraftWithRelations[];
  selectedDraftId: string | null;
  onSelectDraft: (draftId: string) => void;
  comparisonMode?: boolean;
  selectedForComparison?: string[];
  onToggleComparison?: (draftId: string) => void;
}

export function DraftList({
  drafts,
  selectedDraftId,
  onSelectDraft,
  comparisonMode = false,
  selectedForComparison = [],
  onToggleComparison,
}: DraftListProps) {
  if (drafts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No drafts generated yet.</p>
        <p className="text-sm mt-2">
          {comparisonMode
            ? "Generate and select 2+ drafts to compare."
            : 'Click "Generate Draft" to create your first draft.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">
        Generated Drafts ({drafts.length})
      </h3>
      {drafts.map((draft) => {
        const isSelected = selectedForComparison.includes(draft.id);
        const isViewing = selectedDraftId === draft.id;

        return (
          <div
            key={draft.id}
            className={`rounded-lg border transition-colors ${
              isSelected
                ? "border-blue-500 bg-blue-50"
                : isViewing
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200"
            }`}
          >
            {comparisonMode && (
              <div className="p-3 pb-0">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleComparison && onToggleComparison(draft.id)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">
                    Select for comparison
                  </span>
                </label>
              </div>
            )}

            <button
              onClick={() => onSelectDraft(draft.id)}
              className="w-full text-left p-4 -mt-1 block text-left"
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">
                      Version {draft.version}
                    </span>
                    {draft.approach && (
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                        {draft.approach}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      draft.status === "finalized"
                        ? "bg-green-100 text-green-700"
                        : draft.status === "approved"
                        ? "bg-blue-100 text-blue-700"
                        : draft.status === "rejected"
                        ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-700"
                    }`}>
                      {draft.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                    {draft.content.substring(0, 150)}...
                  </p>
                </div>
                <div className="text-xs text-gray-400">
                  {new Date(draft.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </div>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}
