/**
 * Chat Interface Component
 * Main chat container managing state and API communication
 * Handles message history, loading states, and user interactions
 */

import { useState, useRef, useEffect } from "react";
import type { Message, Source } from "~/types/chat";
import { ChatMessage } from "./chat-message";
import { EssayLightbox } from "./essay-lightbox";

interface ChatInterfaceProps {
  applicationId: string;
  scholarshipId: string;
}

export function ChatInterface({
  applicationId,
  scholarshipId,
}: ChatInterfaceProps) {
  // Message history state
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi! I'm your AI assistant for this scholarship application. I'll help you write a compelling essay using your past work as reference. What would you like to work on?",
      timestamp: new Date(),
    },
  ]);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [lightboxSource, setLightboxSource] = useState<Source | null>(null);

  // Ref for auto-scrolling to bottom
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle sending a message
  const handleSend = async () => {
    const trimmedInput = inputValue.trim();

    // Validation: don't send empty messages or while loading
    if (!trimmedInput || isLoading) {
      return;
    }

    // Create user message
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedInput,
      timestamp: new Date(),
    };

    // Add user message to history
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      // Call chat API
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          applicationId,
          scholarshipId,
          message: trimmedInput,
          history: messages,
        }),
      });

      // Check for errors
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `API error: ${response.status} ${response.statusText}`
        );
      }

      // Parse response
      const data = await response.json();

      // Create AI message from response
      const aiMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.content,
        sources: data.sources || [],
        timestamp: new Date(),
        agentStatus: data.agentStatus,
      };

      // Add AI message to history
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      // Log error for debugging
      console.error("Chat API error:", error);

      // Show error message to user
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "Sorry, something went wrong. Please try again. If the problem persists, make sure the database is running and the API is configured.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle keyboard input (Enter to send, Shift+Enter for newline)
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle source click (open lightbox)
  const handleSourceClick = (source: Source) => {
    setLightboxSource(source);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            onSourceClick={handleSourceClick}
          />
        ))}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-3 border border-gray-200">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
              </div>
            </div>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t bg-white">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
            placeholder="Type your message..."
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !inputValue.trim()}
            className="px-6 py-2 bg-blue-500 text-white font-medium rounded-lg
                       hover:bg-blue-600 active:bg-blue-700
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors"
            type="button"
          >
            {isLoading ? "Sending..." : "Send"}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>

      {/* Essay Lightbox */}
      <EssayLightbox
        source={lightboxSource}
        onClose={() => setLightboxSource(null)}
      />
    </div>
  );
}
