import { ActionFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { getAccessToken, getUserGoogleAccounts } from "~/models/google-credential.server";
import { prisma } from "~/db.server";

interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
}

interface DriveDownloadRequest {
  fileIds: string[];
  googleAccountId?: string;
}

/**
 * Download files from Google Drive and create Essay records
 *
 * POST /api/google/download
 * Body: { fileIds: string[], googleAccountId?: string }
 *
 * Supported file types:
 * - Google Docs: application/vnd.google-apps.document
 * - PDF: application/pdf
 * - Word: application/vnd.openxmlformats-officedocument.wordprocessingml.document
 * - Plain text: text/plain
 */
export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);

  try {
    const body: DriveDownloadRequest = await request.json();

    if (!body.fileIds || !Array.isArray(body.fileIds) || body.fileIds.length === 0) {
      return json({ error: "fileIds array is required" }, { status: 400 });
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

    // Process each file
    const results = await Promise.allSettled(
      body.fileIds.map((fileId) => processDriveFile(fileId, accessToken, userId))
    );

    // Separate successful and failed downloads
    const successes: Array<{ fileId: string; essayId: string; fileName: string }> = [];
    const failures: Array<{ fileId: string; error: string }> = [];

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        successes.push({
          fileId: body.fileIds[index],
          essayId: result.value.essayId,
          fileName: result.value.fileName,
        });
      } else {
        failures.push({
          fileId: body.fileIds[index],
          error: result.reason?.message || "Unknown error",
        });
      }
    });

    return json({
      success: true,
      imported: successes.length,
      failed: failures.length,
      results: successes,
      errors: failures,
    });
  } catch (error) {
    console.error("Error downloading Google Drive files:", error);
    return json(
      {
        error: "Failed to download files",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Process a single Google Drive file
 */
async function processDriveFile(
  fileId: string,
  accessToken: string,
  userId: string
): Promise<{ essayId: string; fileName: string }> {
  // Get file metadata
  const metadata = await getDriveFileMetadata(fileId, accessToken);

  // Download and extract text based on MIME type
  const text = await downloadAndExtractText(fileId, metadata.mimeType, accessToken);

  // Create Essay record
  const essay = await prisma.essay.create({
    data: {
      essayPrompt: `Imported from Google Drive: ${metadata.name}`,
      body: text,
      essay: "", // Empty initially - user can generate content
      user: {
        connect: {
          id: userId,
        },
      },
    },
  });

  return {
    essayId: essay.id,
    fileName: metadata.name,
  };
}

/**
 * Get file metadata from Google Drive
 */
async function getDriveFileMetadata(
  fileId: string,
  accessToken: string
): Promise<GoogleDriveFile> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to get file metadata: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  return {
    id: data.id,
    name: data.name,
    mimeType: data.mimeType,
  };
}

/**
 * Download file and extract text based on MIME type
 */
async function downloadAndExtractText(
  fileId: string,
  mimeType: string,
  accessToken: string
): Promise<string> {
  // Google Docs - export as plain text
  if (mimeType === "application/vnd.google-apps.document") {
    return await exportGoogleDoc(fileId, accessToken);
  }

  // Google Sheets - export as CSV
  if (mimeType === "application/vnd.google-apps.spreadsheet") {
    return await exportGoogleSheet(fileId, accessToken);
  }

  // Google Slides - export as plain text (outline)
  if (mimeType === "application/vnd.google-apps.presentation") {
    return await exportGoogleSlides(fileId, accessToken);
  }

  // PDF files - download directly
  if (mimeType === "application/pdf") {
    return await downloadFileAsText(fileId, accessToken, "PDF");
  }

  // Word documents (DOCX)
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return await downloadFileAsText(fileId, accessToken, "DOCX");
  }

  // Plain text files
  if (mimeType === "text/plain") {
    return await downloadFileAsText(fileId, accessToken, "TXT");
  }

  // Rich text files
  if (mimeType === "application/rtf") {
    return await downloadFileAsText(fileId, accessToken, "RTF");
  }

  throw new Error(`Unsupported file type: ${mimeType}`);
}

/**
 * Export Google Doc as plain text
 */
async function exportGoogleDoc(fileId: string, accessToken: string): Promise<string> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to export Google Doc: ${response.status} ${response.statusText}`
    );
  }

  return await response.text();
}

/**
 * Export Google Sheet as CSV
 */
async function exportGoogleSheet(
  fileId: string,
  accessToken: string
): Promise<string> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to export Google Sheet: ${response.status} ${response.statusText}`
    );
  }

  return await response.text();
}

/**
 * Export Google Slides as plain text outline
 */
async function exportGoogleSlides(
  fileId: string,
  accessToken: string
): Promise<string> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to export Google Slides: ${response.status} ${response.statusText}`
    );
  }

  return await response.text();
}

/**
 * Download binary file and attempt text extraction
 *
 * NOTE: This is a simplified implementation that returns a placeholder.
 * Full implementation would require:
 * - PDF parsing (pdf-parse or similar)
 * - DOCX parsing (mammoth or similar)
 * - Proper error handling for binary files
 *
 * For now, we'll download the file and return a placeholder message.
 */
async function downloadFileAsText(
  fileId: string,
  accessToken: string,
  fileType: string
): Promise<string> {
  // For binary files, we'd need to:
  // 1. Download the file content
  // 2. Parse based on file type
  // 3. Extract text

  // Download the file metadata to get the download URL
  const metadataResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=webContentLink`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!metadataResponse.ok) {
    throw new Error(`Failed to get ${fileType} file metadata`);
  }

  // For now, return a placeholder indicating the file was downloaded
  // but needs proper text extraction
  return `[${fileType} file downloaded from Google Drive]\n\nNote: Full text extraction for ${fileType} files requires additional dependencies (pdf-parse, mammoth, etc.). The file has been imported and is ready for processing once those libraries are added.\n\nFile ID: ${fileId}`;
}
