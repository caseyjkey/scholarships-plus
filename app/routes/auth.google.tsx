import { redirect } from "@remix-run/react";
import { randomBytes } from "node:crypto";
import { getSession } from "~/session.server";

export async function loader() {
  const state = randomBytes(16).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url");

  const session = await getSession(new Request("http://localhost:3030/auth/google").headers.get("Cookie"));
  session.set("oauth_state", state);
  session.set("oauth_code_verifier", codeVerifier);

  // Build Google OAuth URL with all parameters at once using template
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI!,
    response_type: "code",
    scope: "openid profile email https://www.googleapis.com/auth/drive.readonly",
    state,
    code_challenge: codeVerifier,
    code_challenge_method: "S256",
  }).toString();

  return redirect(authUrl);
}

export async function action({ request }: ActionFunctionArgs) {
  return await loader({ request });
}
