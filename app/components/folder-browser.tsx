import { useState, useCallback } from "react";

interface GoogleDriveFolder {
  id: string;
  name: string;
}

interface FolderBrowserProps {
  onFolderSelected: (folderId: string, folderName: string) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
}

/**
 * FolderBrowser component for browsing and selecting Google Drive folders
 *
 * This component provides a tree-like interface for browsing Google Drive folders,
 * allowing users to select a folder for bulk import of all contained files.
 */
export function FolderBrowser({
  onFolderSelected,
  onError,
  disabled = false,
}: FolderBrowserProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [folders, setFolders] = useState<GoogleDriveFolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<GoogleDriveFolder | null>(null);
  const [fileCount, setFileCount] = useState<number | null>(null);
  const [isCounting, setIsCounting] = useState(false);

  /**
   * Fetch root folders from server API
   */
  const fetchFolders = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/google/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch folders");
      }

      const data = await response.json();
      setFolders(data.folders || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      onError?.(`Failed to load folders: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [onError]);

  /**
   * Count files in a folder (using our API)
   */
  const countFilesInFolder = useCallback(async (folderId: string) => {
    setIsCounting(true);
    setFileCount(null);

    try {
      const response = await fetch("/api/google/folder-contents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to count files");
      }

      const data = await response.json();
      setFileCount(data.totalCount);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      onError?.(`Failed to count files: ${message}`);
    } finally {
      setIsCounting(false);
    }
  }, [onError]);

  /**
   * Handle folder selection
   */
  const handleFolderClick = useCallback(
    async (folder: GoogleDriveFolder) => {
      setSelectedFolder(folder);
      await countFilesInFolder(folder.id);
    },
    [countFilesInFolder]
  );

  /**
   * Confirm and import the selected folder
   */
  const handleImport = useCallback(() => {
    if (selectedFolder) {
      onFolderSelected(selectedFolder.id, selectedFolder.name);
    }
  }, [selectedFolder, onFolderSelected]);

  if (folders.length === 0 && !isLoading) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={fetchFolders}
          disabled={disabled || isLoading}
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
            {isLoading ? "Loading folders..." : "Browse Google Drive Folders"}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Folder list */}
      <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-700">
            Select a folder to import
          </h3>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-gray-500">
              Loading folders...
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {folders.map((folder) => (
                <li
                  key={folder.id}
                  className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedFolder?.id === folder.id ? "bg-blue-50" : ""
                  }`}
                  onClick={() => handleFolderClick(folder)}
                >
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                    <span className="text-gray-900">{folder.name}</span>
                    {selectedFolder?.id === folder.id && isCounting && (
                      <span className="text-sm text-gray-500">Counting files...</span>
                    )}
                    {selectedFolder?.id === folder.id && fileCount !== null && (
                      <span className="text-sm text-blue-600 font-medium">
                        {fileCount} files
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Import button */}
      {selectedFolder && fileCount !== null && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleImport}
            disabled={isCounting}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px] font-medium"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import {fileCount} files from "{selectedFolder.name}"
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedFolder(null);
              setFileCount(null);
            }}
            className="w-full text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
