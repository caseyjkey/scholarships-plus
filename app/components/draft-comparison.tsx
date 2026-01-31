/**
 * Draft Comparison Component
 * Side-by-side comparison of multiple essay drafts
 */

import type { EssayDraftWithRelations } from "~/models/essay.server";

interface DraftComparisonProps {
  drafts: EssayDraftWithRelations[];
  onSelectWinner: (draftId: string) => void;
  onClose: () => void;
}

export function DraftComparison({ drafts, onSelectWinner, onClose }: DraftComparisonProps) {
  if (drafts.length === 0) {
    return null;
  }

  // Show max 3 drafts side by side
  const displayDrafts = drafts.slice(0, 3);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between bg-gray-50">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Compare Drafts
            </h2>
            <p className="text-sm text-gray-600">
              Select the best draft to continue with
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Comparison Area */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayDrafts.map((draft) => (
              <div
                key={draft.id}
                className="border rounded-lg overflow-hidden flex flex-col h-full"
              >
                {/* Draft Header */}
                <div className="p-3 bg-gray-50 border-b">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-900">
                      Version {draft.version}
                    </span>
                    {draft.approach && (
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                        {draft.approach}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-600">
                    <span>{draft.content.split(/\s+/).length} words</span>
                    <span>•</span>
                    <span>
                      {new Date(draft.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Draft Content */}
                <div className="flex-1 p-4 overflow-y-auto bg-white">
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-700">
                    {draft.content}
                  </div>
                </div>

                {/* Draft Footer */}
                <div className="p-3 bg-gray-50 border-t">
                  <button
                    onClick={() => onSelectWinner(draft.id)}
                    className="w-full py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors"
                    type="button"
                  >
                    Select This Draft
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
