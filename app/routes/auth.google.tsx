import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { createHash, randomBytes } from "node:crypto";
import { getSession, commitSession } from "~/session.server";

export async function loader({ request }: ActionFunctionArgs) {
  const state = randomBytes(16).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url");

  // Create code_challenge as SHA256 hash of code_verifier
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const session = await getSession(request.headers.get("Cookie"));
  session.set("oauth_state", state);
  session.set("oauth_code_verifier", codeVerifier);

  // Build Google OAuth URL with all parameters at once using template
  // access_type=offline + prompt=consent forces Google to return a refresh token
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI!,
    response_type: "code",
    scope: "openid profile email https://www.googleapis.com/auth/drive.readonly",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  }).toString();

  return redirect(authUrl, {
    headers: { "Set-Cookie": await commitSession(session) },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  return await loader({ request });
}
