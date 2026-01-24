import { redirect } from "@remix-run/node";
import { OAuth2Error, OAuth2Strategy } from "remix-auth-oauth2";

export interface GoogleProfile {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
}

export const googleStrategy = new OAuth2Strategy(
  {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    redirectURI: process.env.GOOGLE_OAUTH_REDIRECT_URI!,
    scopes: process.env.GOOGLE_OAUTH_SCOPES?.split(" ") || [
      "openid",
      "profile",
      "email",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
    authorization: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
  },
  async ({ tokens }) => {
    // Fetch user profile from Google
    const response = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    );

    if (!response.ok) {
      throw new OAuth2Error("Failed to fetch user profile");
    }

    const profile: GoogleProfile = await response.json();

    // Return profile + tokens for verification/storage
    return {
      profile,
      tokens,
    };
  }
);

// Type for strategy verify callback return
export interface GoogleAuthResult {
  profile: GoogleProfile;
  tokens: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
  };
}
