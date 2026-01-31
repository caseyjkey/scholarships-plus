import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { CloudPicker } from "~/components/cloud-picker";
import { FolderBrowser } from "~/components/folder-browser";
import { requireUserId } from "~/session.server";
import { getUserGoogleAccounts, getAccessToken } from "~/models/google-credential.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const googleAccounts = await getUserGoogleAccounts(userId);

  return json({
    hasGoogleAccount: googleAccounts.length > 0,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
  });
}

export default function EssaysIndexPage() {
  const { hasGoogleAccount, googleClientId } = useLoaderData<typeof loader>();

  return (
    <>
      <p>
        No essay selected.{" "}
        <span className="hidden lg:inline">
          Select an essay on the left, or{" "}
        </span>
        <span className="lg:hidden">
          Open the drawer (top right) to select an essay, or{" "}
        </span>
        <Link to="new" className="text-blue-500 underline">
          create a new essay.
        </Link>
      </p>

      <GoogleDriveSection hasGoogleAccount={hasGoogleAccount} googleClientId={googleClientId} />
    </>
  );
}

function GoogleDriveSection({ hasGoogleAccount, googleClientId }: { hasGoogleAccount: boolean; googleClientId: string }) {
  const [importMode, setImportMode] = useState<"picker" | "folder" | null>(null);

  if (!hasGoogleAccount) {
    return (
      <div className="mt-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
        <p className="text-sm text-gray-600 mb-3">
          Link your Google account to import essays from Google Drive.
        </p>
        <a
          href="/auth/google"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700 no-underline"
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
          Link Google Account
        </a>
      </div>
    );
  }

  if (importMode === "folder") {
    return (
      <div className="mt-6">
        <FolderBrowser
          onFolderSelected={async (folderId, folderName) => {
            await importFromFolder(folderId, folderName);
          }}
          onError={(error) => {
            console.error("Folder browser error:", error);
          }}
        />
        <button
          type="button"
          onClick={() => setImportMode(null)}
          className="mt-4 text-sm text-gray-600 hover:text-gray-900 underline"
        >
          ← Back to import options
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {!importMode && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Individual file import */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Select Individual Files</h3>
              <p className="text-sm text-gray-600 mb-4">
                Use Google Picker to select specific files or documents.
              </p>
              <CloudPicker
                clientId={googleClientId}
                onFilesSelected={(files) => {
                  importFiles(files.map(f => f.id));
                }}
                onError={(error) => {
                  console.error("Google Picker error:", error);
                }}
                buttonText="Open Google Picker"
              />
            </div>

            {/* Bulk folder import */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Import Entire Folder</h3>
              <p className="text-sm text-gray-600 mb-4">
                Browse and import all files from a folder (including subfolders).
              </p>
              <button
                type="button"
                onClick={() => setImportMode("folder")}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors min-h-[48px]"
              >
                <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
                <span className="font-medium text-gray-700">Browse Folders</span>
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-500 text-center">
            Individual file selection is best for specific documents. Folder import is best for bulk importing your scholarship essays collection.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Import multiple files from Google Drive
 */
async function importFiles(fileIds: string[]) {
  const response = await fetch("/api/google/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileIds }),
  });

  if (response.ok) {
    const result = await response.json();
    const { imported, failed, errors } = result;

    if (failed > 0) {
      const errorDetails = errors.slice(0, 3).map((e: any) => `• ${e.error}`).join('\n');
      const moreErrors = errors.length > 3 ? `\n...and ${errors.length - 3} more errors` : '';
      alert(`Imported ${imported} files, but ${failed} failed.\n\nFirst few errors:\n${errorDetails}${moreErrors}\n\nCheck server console for details.`);
    } else {
      alert(`Imported ${imported} files successfully!`);
    }

    if (imported > 0) {
      window.location.reload();
    }
  } else {
    const error = await response.json();
    alert(`Error importing files: ${error.error || error.message}`);
  }
}

/**
 * Import all files from a Google Drive folder (recursively)
 */
async function importFromFolder(folderId: string, folderName: string) {
  try {
    // List all files in the folder recursively using our API
    const contentsResponse = await fetch("/api/google/folder-contents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId }),
    });

    if (!contentsResponse.ok) {
      const error = await contentsResponse.json();
      throw new Error(error.error || "Failed to list folder contents");
    }

    const data = await contentsResponse.json();
    const files = data.files || [];

    if (files.length === 0) {
      alert(`No supported files found in "${folderName}".`);
      return;
    }

    // Confirm with user before importing all files
    const confirmed = confirm(
      `Found ${files.length} supported file(s) in "${folderName}".\n\nImport all of them?`
    );

    if (confirmed) {
      await importFiles(files.map((f: any) => f.id));
    }
  } catch (error) {
    console.error("Error importing from folder:", error);
    alert(`Error importing from folder: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
