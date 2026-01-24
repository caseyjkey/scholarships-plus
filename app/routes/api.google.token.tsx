import { LoaderFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { getAccessToken, getUserGoogleAccounts } from "~/models/google-credential.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);

  // Get user's Google accounts
  const accounts = await getUserGoogleAccounts(userId);

  if (accounts.length === 0) {
    return json({ error: "No Google accounts linked" }, { status: 400 });
  }

  // Use first account (default)
  // TODO: Add UI to select which account to use
  const accessToken = await getAccessToken(userId, accounts[0].googleAccountId);

  return json({
    accessToken,
    email: accounts[0].email,
    googleAccountId: accounts[0].googleAccountId,
  });
}
