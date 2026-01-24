import { LoaderFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { getUserGoogleAccounts } from "~/models/google-credential.server";

/**
 * GET /api/google/accounts
 * List all linked Google accounts for the current user
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);

  try {
    const accounts = await getUserGoogleAccounts(userId);

    return json({
      accounts: accounts.map((account) => ({
        ...account,
        createdAt: account.createdAt.toISOString(),
      })),
      total: accounts.length,
    });
  } catch (error) {
    console.error("Error fetching Google accounts:", error);
    return json(
      { error: "Failed to fetch Google accounts" },
      { status: 500 }
    );
  }
}
