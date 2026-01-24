import { ActionFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { unlinkGoogleAccount, getValidCredential } from "~/models/google-credential.server";

/**
 * DELETE /api/google/accounts/:id
 * Unlink a Google account from the current user
 */
export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "DELETE") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const userId = await requireUserId(request);
  const accountId = params.id;

  if (!accountId) {
    return json({ error: "Account ID is required" }, { status: 400 });
  }

  try {
    // Verify the account belongs to the user before unlinking
    const credential = await getValidCredential(userId, accountId);

    // Unlink the account
    await unlinkGoogleAccount(userId, accountId);

    return json(
      {
        success: true,
        message: `Successfully unlinked ${credential.email}`,
      },
      { status: 200 }
    );
  } catch (error) {
    // Handle specific error cases
    if (error instanceof Error) {
      if (error.message === "Google credential not found") {
        return json({ error: "Account not found" }, { status: 404 });
      }
      if (error.message === "Credential does not belong to user") {
        return json({ error: "Unauthorized" }, { status: 403 });
      }
    }

    console.error("Error unlinking Google account:", error);
    return json(
      { error: "Failed to unlink Google account" },
      { status: 500 }
    );
  }
}
