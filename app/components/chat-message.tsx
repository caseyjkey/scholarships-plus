/**
 * Chat Message Component
 * Displays a single chat message (user or AI)
 * Shows sources for AI messages as clickable cards
 */

import type { Message, Source } from "~/types/chat";

interface ChatMessageProps {
  message: Message;
  onSourceClick: (source: Source) => void;
}

export function ChatMessage({ message, onSourceClick }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  // System messages (if any) - centered, muted
  if (isSystem) {
    return (
      <div className="flex justify-center mb-4">
        <div className="text-xs text-gray-400 italic bg-gray-50 px-3 py-1 rounded-full">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? "bg-blue-500 text-white"
            : "bg-gray-100 text-gray-900 border border-gray-200"
        }`}
      >
        {/* Message Content */}
        <div className="prose prose-sm max-w-none whitespace-pre-wrap">
          {message.content}
        </div>

        {/* Sources - AI messages only */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-500 mb-2 font-medium">
              📚 Referenced Sources:
            </p>
            <div className="space-y-2">
              {message.sources.map((source, index) => (
                <button
                  key={source.id}
                  onClick={() => onSourceClick(source)}
                  className="w-full text-left p-2 bg-white rounded border border-gray-200
                           hover:border-blue-300 hover:bg-blue-50 transition-colors
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
                  type="button"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {index + 1}. {source.title}
                      </div>
                      <div className="text-xs text-gray-500 truncate mt-0.5">
                        {source.excerpt}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {source.awarded && (
                        <span className="text-yellow-500" title="Awarded essay">
                          🏆
                        </span>
                      )}
                      <span className="text-xs text-blue-600 font-medium">
                        {source.relevance}%
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Timestamp */}
        <div
          className={`text-xs mt-2 ${
            isUser ? "text-blue-100" : "text-gray-400"
          }`}
        >
          {new Date(message.timestamp).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}
