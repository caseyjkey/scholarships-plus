import { ActionFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { getAccessToken, getUserGoogleAccounts } from "~/models/google-credential.server";

interface GoogleDriveFolder {
  id: string;
  name: string;
}

/**
 * List root folders from Google Drive
 *
 * POST /api/google/folders
 * Body: { googleAccountId?: string }
 *
 * Returns a list of folders in the user's Google Drive root directory.
 * This is used by the folder browser component.
 */
export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);

  try {
    const body = await request.json();

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

    // List folders in the root directory
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${encodeURIComponent(
        "root"
      )}' in parents and mimeType='application/vnd.google-apps.folder'&fields=files(id,name)&pageSize=100`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google Drive API error:", response.status, errorText);
      throw new Error(`Failed to list folders: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return json({
      folders: (data.files || []).map((f: any) => ({
        id: f.id,
        name: f.name,
      })),
    });
  } catch (error) {
    console.error("Error listing folders:", error);
    return json(
      {
        error: "Failed to list folders",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
