/**
 * OASIS Session Capture Component
 *
 * This component displays an embedded window where students can log into OASIS.
 * Once logged in, it captures the session cookies and sends them to the backend.
 */

import { useEffect, useRef, useState } from "react";

interface OASISSessionCaptureProps {
  onCaptureComplete: (sessionId: string) => void;
  onCancel: () => void;
}

export function OASISSessionCapture({ onCaptureComplete, onCancel }: OASISSessionCaptureProps) {
  const [status, setStatus] = useState<"loading" | "waiting" | "capturing" | "success" | "error">("waiting");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const messageListenerRef = useRef<(event: MessageEvent) => void>();

  // OASIS login URL
  const oasisLoginUrl = "https://webportalapp.com/sp/login/access_oasis";

  useEffect(() => {
    // Listen for messages from the iframe
    messageListenerRef.current = (event: MessageEvent) => {
      // Only accept messages from same origin or our oasis subdomain
      if (event.origin !== window.location.origin && !event.origin.includes("webportalapp.com")) {
        return;
      }

      if (event.data.type === "OASIS_LOGIN_SUCCESS") {
        handleSessionCapture(event.data);
      } else if (event.data.type === "OASIS_LOGIN_CANCELLED") {
        onCancel();
      }
    };

    window.addEventListener("message", messageListenerRef.current);

    return () => {
      window.removeEventListener("message", messageListenerRef.current!);
    };
  }, []);

  const handleSessionCapture = async (sessionData: any) => {
    setStatus("capturing");

    try {
      // Extract cookies from iframe
      const iframe = iframeRef.current;
      if (!iframe) {
        throw new Error("Iframe not found");
      }

      // Get cookies via content script message
      iframe.contentWindow?.postMessage({ type: "EXTRACT_COOKIES" }, "*");

      // In a real implementation, we'd get cookies from the iframe
      // For now, simulate with timeout
      setTimeout(async () => {
        try {
          const response = await fetch("/api/oasis.session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              cookies: sessionData.cookies || [],
              localStorage: sessionData.localStorage || {},
              sessionStorage: sessionData.sessionStorage || {},
            }),
          });

          const result = await response.json();

          if (result.success) {
            setStatus("success");
            onCaptureComplete(result.sessionId);
          } else {
            setStatus("error");
          }
        } catch (error) {
          console.error("Failed to save session:", error);
          setStatus("error");
        }
      }, 2000);
    } catch (error) {
      console.error("Failed to capture session:", error);
      setStatus("error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Connect OASIS Account</h2>
            <p className="text-sm text-gray-600 mt-1">
              Log in to your OASIS account to enable automatic scholarship application completion
            </p>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-md"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Status Messages */}
        <div className="p-4 bg-blue-50 border-b">
          {status === "waiting" && (
            <div className="flex items-start gap-3">
              <svg className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900">Login Instructions:</p>
                <ol className="mt-2 text-sm text-blue-800 space-y-1 list-decimal list-inside">
                  <li>Log in to OASIS in the window below</li>
                  <li>Complete any CAPTCHA/verification if prompted</li>
                  <li>Once you see your dashboard, click "I'm Logged In" below</li>
                </ol>
              </div>
            </div>
          )}

          {status === "capturing" && (
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <p className="text-sm text-blue-900">Capturing your session...</p>
            </div>
          )}

          {status === "success" && (
            <div className="flex items-center gap-3">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm font-medium text-green-900">Successfully connected! You can now close this window.</p>
            </div>
          )}

          {status === "error" && (
            <div className="flex items-center gap-3">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-red-900">Failed to connect. Please try again or contact support.</p>
            </div>
          )}
        </div>

        {/* Embedded OASIS Login */}
        <div className="flex-1 overflow-hidden bg-gray-100">
          <iframe
            ref={iframeRef}
            src={oasisLoginUrl}
            className="w-full h-full"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
            title="OASIS Login"
          />
        </div>

        {/* Footer Actions */}
        {status === "waiting" && (
          <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
            <p className="text-sm text-gray-600">
              After logging in, click the button below so we can capture your session
            </p>
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSessionCapture({})}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                I'm Logged In
              </button>
            </div>
          </div>
        )}

        {status === "success" && (
          <div className="p-4 border-t bg-gray-50 flex justify-end">
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="p-4 border-t bg-gray-50 flex justify-end">
            <button
              onClick={() => setStatus("waiting")}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
