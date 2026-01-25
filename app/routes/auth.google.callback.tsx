import { redirect } from "@remix-run/node";
import { getSession, commitSession } from "~/session.server";
import { getUserById } from "~/models/user.server";
import { createUser } from "~/models/user.server";

export async function loader({ request }: ActionFunctionArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  console.log("Google OAuth callback received:", { hasCode: !!code, hasState: !!state });

  if (!code) {
    console.log("No code parameter, redirecting to login");
    return redirect("/login");
  }

  // Exchange code for tokens
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

  // Create or get user
  let user = await getUserById(profile.email);
  if (!user) {
    console.log("User not found, creating new user for email:", profile.email);
    user = await createUser(profile.email);
    console.log("User created:", user.id);
  }

  // Create session
  const session = await getSession(request.headers.get("Cookie"));
  session.set("userId", user.id);

  return redirect("/scholarships", {
    headers: { "Set-Cookie": await commitSession(session) },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  return await loader({ request });
}
