import { useState, useCallback, useEffect } from "react";

interface GooglePickerResponse {
  action: string;
  docs?: Array<{
    id: string;
    name: string;
    mimeType: string;
    url: string;
  }>;
}

interface CloudPickerProps {
  clientId: string;
  onFilesSelected: (files: Array<{ id: string; name: string; mimeType: string }>) => void;
  onFolderSelected?: (folderId: string, folderName: string) => void;
  onError?: (error: string) => void;
  className?: string;
  buttonText?: string;
  disabled?: boolean;
}

/**
 * CloudPicker component for selecting files from Google Drive
 *
 * Integrates with Google Picker API to allow users to select files
 * from their Google Drive account. Requires a valid Google OAuth token.
 */
export function CloudPicker({
  clientId,
  onFilesSelected,
  onFolderSelected,
  onError,
  className = "",
  buttonText = "Select from Google Drive",
  disabled = false,
}: CloudPickerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isApiLoaded, setIsApiLoaded] = useState(false);
  const [isTokenLoading, setIsTokenLoading] = useState(false);

  /**
   * Load Google Picker API script dynamically
   */
  useEffect(() => {
    if (isApiLoaded) return;

    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      // Initialize Google API
      if (window.gapi) {
        window.gapi.load("picker", () => {
          setIsApiLoaded(true);
        });
      }
    };
    script.onerror = () => {
      onError?.("Failed to load Google Picker API");
    };
    document.body.appendChild(script);

    return () => {
      // Cleanup script on unmount
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [isApiLoaded, onError]);

  /**
   * Fetch access token from server
   */
  const fetchAccessToken = useCallback(async (): Promise<string> => {
    setIsTokenLoading(true);
    try {
      const response = await fetch("/api/google/token");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get access token");
      }

      return data.accessToken;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      onError?.(`Failed to get access token: ${message}`);
      throw error;
    } finally {
      setIsTokenLoading(false);
    }
  }, [onError]);

  /**
   * Open Google Picker
   */
  const openPicker = useCallback(async () => {
    if (!isApiLoaded) {
      onError?.("Google Picker API is not loaded yet");
      return;
    }

    setIsLoading(true);
    try {
      // Get access token from server
      const accessToken = await fetchAccessToken();

      // Use the clientId passed as prop
      if (!clientId) {
        throw new Error("Google Client ID is not configured");
      }

      // Create Picker instance with document views
      const picker = new window.google.picker.PickerBuilder()
        .addView(window.google.picker.ViewId.DOCS)
        .addView(window.google.picker.ViewId.DOCUMENTS)
        .addView(window.google.picker.ViewId.PRESENTATIONS)
        .addView(window.google.picker.ViewId.SPREADSHEETS)
        .setOAuthToken(accessToken)
        .setCallback(pickerCallback)
        .build();

      picker.setVisible(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      onError?.(`Failed to open picker: ${message}`);
      setIsLoading(false);
    }
  }, [isApiLoaded, fetchAccessToken, onError]);

  /**
   * Handle Picker callback
   */
  const pickerCallback = useCallback(
    (data: GooglePickerResponse) => {
      setIsLoading(false);

      switch (data.action) {
        case window.google.picker.Action.PICKED:
          if (data.docs && data.docs.length > 0) {
            const doc = data.docs[0];

            // Check if it's a folder
            if (doc.mimeType === 'application/vnd.google-apps.folder') {
              onFolderSelected?.(doc.id, doc.name);
            } else {
              // It's a file
              const files = data.docs.map((d) => ({
                id: d.id,
                name: d.name,
                mimeType: d.mimeType,
              }));
              onFilesSelected(files);
            }
          }
          break;
        case window.google.picker.Action.CANCEL:
          // User cancelled - do nothing
          break;
        case window.google.picker.Action.PICKED_ASYNC:
          // Async handling not implemented
          break;
        default:
          break;
      }
    },
    [onFilesSelected, onFolderSelected]
  );

  const isReady = isApiLoaded && !isTokenLoading;
  const buttonDisabled = disabled || isLoading || !isReady;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={openPicker}
        disabled={buttonDisabled}
        className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        <span className="font-medium text-gray-700">
          {isLoading ? "Opening Picker..." : buttonText}
        </span>
      </button>

      {!isApiLoaded && (
        <p className="mt-2 text-sm text-gray-500">
          Loading Google Picker API...
        </p>
      )}

      {isApiLoaded && !isReady && (
        <p className="mt-2 text-sm text-yellow-600">
          Please link a Google account to use this feature
        </p>
      )}
    </div>
  );
}

// Extend Window interface for Google Picker API
declare global {
  interface Window {
    gapi: {
      load: (module: string, callback?: () => void) => void;
    };
    google: {
      picker: {
        PickerBuilder: new () => {
          addView: (view: string) => Window["google"]["picker"]["PickerBuilder"];
          setOAuthToken: (token: string) => Window["google"]["picker"]["PickerBuilder"];
          setDeveloperKey: (key: string) => Window["google"]["picker"]["PickerBuilder"];
          setCallback: (callback: (data: GooglePickerResponse) => void) => Window["google"]["picker"]["PickerBuilder"];
          build: () => {
            setVisible: (visible: boolean) => void;
          };
        };
        ViewId: {
          DOCS: string;
          DOCUMENTS: string;
          PRESENTATIONS: string;
          SPREADSHEETS: string;
        };
        Action: {
          PICKED: string;
          CANCEL: string;
          PICKED_ASYNC: string;
        };
      };
    };
  }
}
