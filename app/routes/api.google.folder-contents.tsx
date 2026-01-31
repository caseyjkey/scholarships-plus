import { ActionFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { getAccessToken, getUserGoogleAccounts } from "~/models/google-credential.server";

interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
}

interface FolderContentsResponse {
  files: GoogleDriveFile[];
  totalCount: number;
}

/**
 * List all files in a Google Drive folder (recursively)
 *
 * POST /api/google/folder-contents
 * Body: { folderId: string, googleAccountId?: string }
 *
 * This endpoint recursively lists all files in a folder,
 * including files in nested subdirectories.
 */
export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);

  try {
    const body = await request.json();

    if (!body.folderId) {
      return json({ error: "folderId is required" }, { status: 400 });
    }

    // Get user's Google accounts
    const accounts = await getUserGoogleAccounts(userId);

    if (accounts.length === 0) {
      return json({ error: "No Google accounts linked" }, { status: 400 });
    }

    // Determine which account to use
    const googleAccountId =
      body.googleAccountId ||
      accounts[0].googleAccountId;

    // Verify the account belongs to this user
    const account = accounts.find((a) => a.googleAccountId === googleAccountId);
    if (!account) {
      return json({ error: "Invalid Google account" }, { status: 400 });
    }

    // Get access token (with auto-refresh)
    const accessToken = await getAccessToken(userId, googleAccountId);

    // Recursively list all files in the folder
    const files = await listFilesRecursively(body.folderId, accessToken);

    // Filter to only include supported file types
    const supportedFiles = files.filter((file) =>
      isSupportedFileType(file.mimeType)
    );

    return json({
      files: supportedFiles,
      totalCount: supportedFiles.length,
      totalInFolder: files.length,
    });
  } catch (error) {
    console.error("Error listing folder contents:", error);
    return json(
      {
        error: "Failed to list folder contents",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Recursively list all files in a folder
 */
async function listFilesRecursively(
  folderId: string,
  accessToken: string,
  pageSize: number = 1000
): Promise<GoogleDriveFile[]> {
  const allFiles: GoogleDriveFile[] = [];
  const processedFolders = new Set<string>();
  const foldersToProcess: string[] = [folderId];

  // Use BFS to process all folders
  while (foldersToProcess.length > 0) {
    const currentFolderId = foldersToProcess.shift()!;

    // Skip if we've already processed this folder (avoid cycles)
    if (processedFolders.has(currentFolderId)) {
      continue;
    }
    processedFolders.add(currentFolderId);

    // List files and folders in the current folder
    const pageToken = await listFilesInFolder(
      currentFolderId,
      accessToken,
      pageSize,
      allFiles,
      foldersToProcess
    );

    // Handle pagination if needed
    let nextPageToken = pageToken;
    while (nextPageToken) {
      nextPageToken = await listFilesInFolder(
        currentFolderId,
        accessToken,
        pageSize,
        allFiles,
        foldersToProcess,
        nextPageToken
      );
    }
  }

  return allFiles;
}

/**
 * List files in a single folder (with pagination support)
 */
async function listFilesInFolder(
  folderId: string,
  accessToken: string,
  pageSize: number,
  allFiles: GoogleDriveFile[],
  foldersToProcess: string[],
  pageToken?: string
): Promise<string | undefined> {
  // Build query to list files in the folder
  const params = new URLSearchParams({
    q: `'${folderId}' in parents`,
    fields: 'nextPageToken,files(id,name,mimeType)',
    pageSize: pageSize.toString(),
  });

  if (pageToken) {
    params.append('pageToken', pageToken);
  }

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to list files in folder: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  // Process results
  if (data.files) {
    for (const file of data.files) {
      // If it's a folder, add it to the queue for processing
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        foldersToProcess.push(file.id);
      } else {
        // It's a file, add it to our list
        allFiles.push({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
        });
      }
    }
  }

  return data.nextPageToken;
}

/**
 * Check if a file type is supported for import
 */
function isSupportedFileType(mimeType: string): boolean {
  const supportedTypes = [
    // Google Docs
    'application/vnd.google-apps.document',
    // Google Sheets
    'application/vnd.google-apps.spreadsheet',
    // Google Slides
    'application/vnd.google-apps.presentation',
    // PDF
    'application/pdf',
    // Word documents
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    // Plain text
    'text/plain',
    // Rich text
    'application/rtf',
  ];

  return supportedTypes.includes(mimeType);
}
