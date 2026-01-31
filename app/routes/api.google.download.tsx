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
        const error = result.reason;
        console.error(`Failed to process file ${body.fileIds[index]}:`, error);
        failures.push({
          fileId: body.fileIds[index],
          error: error?.message || "Unknown error",
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
      essayPrompt: metadata.name,
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
 * Download binary file and extract text
 *
 * Downloads the file from Google Drive and extracts text based on file type.
 * Supports PDF and DOCX files.
 */
async function downloadFileAsText(
  fileId: string,
  accessToken: string,
  fileType: string
): Promise<string> {
  // Download the file content as binary
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const response = await fetch(downloadUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${fileType} file: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  // Extract text based on file type
  if (fileType === "PDF") {
    return await extractTextFromPDF(buffer);
  }

  if (fileType === "DOCX") {
    return await extractTextFromDOCX(buffer);
  }

  if (fileType === "RTF") {
    // RTF files - basic extraction (strip formatting codes)
    return extractTextFromRTF(buffer.toString('utf-8'));
  }

  if (fileType === "TXT") {
    return buffer.toString('utf-8');
  }

  throw new Error(`Unsupported file type: ${fileType}`);
}

/**
 * Extract text from PDF buffer using pdf-parse
 */
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    // Direct require works in Remix's server environment
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    console.error('Error parsing PDF:', error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract text from DOCX buffer using mammoth
 */
async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    console.error('Error parsing DOCX:', error);
    throw new Error(`Failed to extract text from DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Basic RTF text extraction - removes formatting codes
 */
function extractTextFromRTF(rtf: string): string {
  // Remove RTF control words and keep visible text
  let text = rtf
    // Remove header
    .replace(/{\\rtf1[\\s\\S]*?\\ pard\\s?/, '')
    // Remove common control words
    .replace(/\\[a-z]+(\\-?[0-9]+)?[ ]?/gi, '')
    // Remove brackets
    .replace(/[{}]/g, '')
    // Clean up whitespace
    .replace(/\\par/g, '\n')
    .replace(/\\tab/g, '  ')
    .replace(/\\line/g, '\n')
    .trim();

  return text;
}
