/**
 * Connect OASIS Account Button
 *
 * Button that opens the OASIS session capture modal.
 * Shows connection status when OASIS account is linked.
 */

import { useState } from "react";

interface ConnectOasisButtonProps {
  isConnected: boolean;
  onConnect: () => void;
}

export function ConnectOasisButton({ isConnected, onConnect }: ConnectOasisButtonProps) {
  const [showModal, setShowModal] = useState(false);

  const handleConnect = () => {
    setShowModal(true);
  };

  const handleCaptureComplete = (sessionId: string) => {
    setShowModal(false);
    // Refresh to show connected status
    window.location.reload();
  };

  return (
    <>
      <button
        onClick={handleConnect}
        className={`px-4 py-2 rounded-lg transition-colors ${
          isConnected
            ? "bg-green-100 text-green-800 hover:bg-green-200"
            : "bg-blue-600 text-white hover:bg-blue-700"
        }`}
      >
        {isConnected ? (
          <span className="flex items-center gap-2">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            OASIS Connected
          </span>
        ) : (
          "Connect OASIS Account"
        )}
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          {/* This would be replaced by the OASISSessionCapture component */}
          <div className="bg-white rounded-lg p-6 max-w-md">
            <h2 className="text-xl font-semibold mb-4">OASIS Session Capture</h2>
            <p className="text-gray-600 mb-4">
              This feature will open a window where you can log into OASIS.
              Your session will be saved securely for completing scholarship applications.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowModal(false);
                  onConnect();
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Open OASIS Login
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
