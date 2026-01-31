/**
 * Application Detail / Interview Page
 *
 * This is the main interview interface where users interact with the AI agent
 * to complete their scholarship application.
 *
 * Features:
 * - Displays scholarship information
 * - Integrated agentic chat interface
 * - Application progress tracking
 * - Context management with knowledge base
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";
import { useState, useRef, useEffect } from "react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  options?: Array<{ id: string; title: string; deadline?: Date }>;
}

interface ChatContext {
  step: string;
  scholarshipId?: string;
  scholarshipName?: string;
  portal?: string;
  applicationUrl?: string;
  requirements?: string[];
  currentRequirement?: number;
  completedRequirements?: Record<string, string>;
  currentChunks?: any[];
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const userId = await requireUserId(request);
  const applicationId = params.id;

  if (!applicationId) {
    throw new Response("Application ID is required", { status: 400 });
  }

  // Fetch application with scholarship details
  const application = await prisma.application.findFirst({
    where: {
      id: applicationId,
      userId,
    },
    include: {
      scholarship: true,
      scrapedScholarship: true,
    },
  });

  if (!application) {
    throw new Response("Application not found", { status: 404 });
  }

  // Determine which scholarship to use
  const scholarship = application.scrapedScholarship || application.scholarship;

  if (!scholarship) {
    throw new Response("Scholarship not found", { status: 404 });
  }

  // Get field mappings for this scholarship
  const fieldMappings = await prisma.fieldMapping.findMany({
    where: {
      scholarshipId: scholarship.id,
      userId,
    },
  });

  return json({
    application,
    scholarship,
    fieldMappings,
    isScraped: !!application.scrapedScholarship,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const userId = await requireUserId(request);

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const { message, context } = body;

  if (!message || !context) {
    return json({ error: "Missing message or context" }, { status: 400 });
  }

  // Import agentic chat handler directly
  const { action: agenticAction } = await import("~/routes/api.chat.agentic");

  // Create a mock request with the same body
  const mockRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({ message, context }),
  });

  // Call the agentic chat action directly
  try {
    return await agenticAction({ request: mockRequest } as any);
  } catch (error) {
    console.error("Agentic chat error:", error);
    return json(
      {
        error: "Failed to process chat message",
        message: "Sorry, something went wrong. Please try again.",
        context: { step: "start" },
      },
      { status: 500 }
    );
  }
};

export default function ApplicationDetailPage() {
  const { application, scholarship, fieldMappings, isScraped } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher<{ message?: string; context?: ChatContext; options?: any[] }>();

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [chatContext, setChatContext] = useState<ChatContext>({ step: "start" });
  const [isLoading, setIsLoading] = useState(false);

  // Ref for auto-scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Start the interview on mount
  useEffect(() => {
    handleSend("", true);
  }, []);

  // Update context when fetcher returns
  useEffect(() => {
    if (fetcher.data?.message) {
      const aiMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: fetcher.data.message,
        timestamp: new Date(),
        options: fetcher.data.options,
      };

      setMessages((prev) => [...prev, aiMessage]);

      if (fetcher.data.context) {
        setChatContext(fetcher.data.context);
      }

      setIsLoading(false);
    }
  }, [fetcher.data]);

  const handleSend = async (content?: string, isInit = false) => {
    const messageToSend = content || inputValue.trim();

    if (!messageToSend && !isInit) {
      return;
    }

    // Add user message to chat (if not initialization)
    if (!isInit) {
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: messageToSend,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setInputValue("");
    }

    setIsLoading(true);

    // Send to agentic chat API
    fetcher.submit(
      {
        message: messageToSend || "__init__",
        context: JSON.stringify(chatContext),
      },
      {
        method: "POST",
        action: `/applications/${application.id}`,
      }
    );
  };

  const handleOptionClick = (option: { id: string; title: string }) => {
    handleSend(option.id);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b shrink-0">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate("/applications")}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Back to applications"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {scholarship.title}
                </h1>
                <p className="text-sm text-gray-600">
                  {isScraped && "portal" in scholarship ? (
                    <>Source: {scholarship.portal} • Deadline: {new Date(scholarship.deadline).toLocaleDateString()}</>
                  ) : (
                    <>Deadline: {new Date(scholarship.deadline).toLocaleDateString()}</>
                  )}
                </p>
              </div>
            </div>

            {/* Status Badge */}
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              chatContext.step === "ready_to_submit"
                ? "bg-green-100 text-green-700"
                : "bg-blue-100 text-blue-700"
            }`}>
              {chatContext.step === "ready_to_submit"
                ? "✓ Ready"
                : chatContext.step === "start"
                ? "Starting..."
                : "In Progress"}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Chat Interface */}
      <main className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} mb-4`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-3 ${
                  message.role === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-white border border-gray-200 text-gray-900"
                }`}
              >
                {/* Render markdown-like content */}
                <div className="whitespace-pre-wrap">
                  {message.content}
                </div>

                {/* Options (scholarship selection) */}
                {message.options && message.options.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {message.options.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => handleOptionClick(option)}
                        disabled={isLoading}
                        className="w-full text-left px-4 py-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="font-medium text-blue-900">{option.title}</div>
                        {option.deadline && (
                          <div className="text-sm text-blue-600 mt-1">
                            Due: {new Date(option.deadline).toLocaleDateString()}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Timestamp */}
                <div
                  className={`text-xs mt-1 ${
                    message.role === "user" ? "text-blue-100" : "text-gray-400"
                  }`}
                >
                  {new Date(message.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </div>
          ))}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex justify-start mb-4">
              <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
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
        {chatContext.step !== "ready_to_submit" && (
          <div className="p-4 border-t bg-white">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isLoading}
                placeholder="Type your message..."
                className="flex-1 border border-gray-300 rounded-lg px-4 py-3
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                onClick={() => handleSend()}
                disabled={isLoading || !inputValue.trim()}
                className="px-6 py-3 bg-blue-500 text-white font-medium rounded-lg
                           hover:bg-blue-600 active:bg-blue-700
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-colors min-h-[48px]"
                type="button"
              >
                {isLoading ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        )}

        {/* Ready to Submit Action */}
        {chatContext.step === "ready_to_submit" && (
          <div className="p-4 border-t bg-white">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-semibold text-green-900 mb-2">🎉 Application Complete!</h3>
              <p className="text-green-700 mb-4">
                Your application is ready to submit. You can now use the browser extension to fill out the form on the scholarship website.
              </p>
              <div className="flex gap-2">
                <a
                  href={scholarship.applicationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 transition-colors"
                >
                  Open Scholarship Website
                </a>
                <button
                  onClick={() => setChatContext({ step: "start" })}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Start Over
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
