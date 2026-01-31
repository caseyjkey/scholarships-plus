import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { getSession, commitSession } from "~/session.server";
import { getUserByEmail } from "~/models/user.server";
import { createUser } from "~/models/user.server";
import { linkGoogleAccount } from "~/models/google-credential.server";

export async function loader({ request }: ActionFunctionArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  console.log("Google OAuth callback received:", { hasCode: !!code });

  if (!code) {
    console.log("No code parameter, redirecting to login");
    return redirect("/login");
  }

  // Get code_verifier from session
  const session = await getSession(request.headers.get("Cookie"));
  const codeVerifier = session.get("oauth_code_verifier");

  if (!codeVerifier) {
    console.log("No code_verifier in session, redirecting to login");
    return redirect("/login");
  }

  // Exchange code for tokens with code_verifier for PKCE
  console.log("Exchanging code for tokens...");
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI!,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }).toString(),
  });

  console.log("Token response status:", tokenResponse.status);

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.log("Token exchange failed:", errorText);
    throw new Error(`Failed to exchange code for tokens: ${errorText}`);
  }

  const tokens = await tokenResponse.json();
  console.log("Tokens received:", JSON.stringify(tokens, null, 2));

  // Fetch user profile
  console.log("Fetching user profile...");
  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  console.log("Profile response status:", profileResponse.status);

  if (!profileResponse.ok) {
    const errorText = await profileResponse.text();
    console.log("Profile fetch failed:", errorText);
    throw new Error("Failed to fetch user profile");
  }

  const profile = await profileResponse.json();
  console.log("Profile received:", JSON.stringify(profile, null, 2));

  // Check if user is already logged in (linking additional account)
  const existingUserId = session.get("userId");

  let user;
  if (existingUserId) {
    // User is already logged in - link this Google account to their existing account
    console.log("User already logged in:", existingUserId, "- linking Google account");
    // Get the full user object
    const existingUser = await getUserByEmail(profile.email);
    if (existingUser && existingUser.id !== existingUserId) {
      // Google account is linked to a different user - this shouldn't happen normally
      console.log("Warning: Google account already linked to different user");
    }
    // Use the existing logged-in user
    user = { id: existingUserId, email: profile.email };
  } else {
    // No user logged in - create or get user by Google email (sign-in flow)
    user = await getUserByEmail(profile.email);
    if (!user) {
      console.log("User not found, creating new user for email:", profile.email);
      user = await createUser(profile.email);
      console.log("User created:", user.id);
    }
  }

  // Link Google account with tokens
  console.log("Linking Google account...");
  await linkGoogleAccount(user.id, {
    profile,
    tokens: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      token_type: tokens.token_type,
    },
  });
  console.log("Google account linked successfully");

  // Update session with userId
  session.set("userId", user.id);

  return redirect("/essays", {
    headers: { "Set-Cookie": await commitSession(session) },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  return await loader({ request });
}
