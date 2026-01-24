import { OAuth2Error, OAuth2Strategy, type OAuth2Tokens } from "remix-auth-oauth2";

// Validate required environment variables at module load
const requiredEnvVars = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI,
} as const;

const missing = Object.entries(requiredEnvVars)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  throw new Error(
    `Missing required Google OAuth environment variables: ${missing.join(", ")}`
  );
}

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
    clientId: requiredEnvVars.GOOGLE_CLIENT_ID,
    clientSecret: requiredEnvVars.GOOGLE_CLIENT_SECRET,
    redirectURI: requiredEnvVars.GOOGLE_OAUTH_REDIRECT_URI,
    scopes: process.env.GOOGLE_OAUTH_SCOPES?.split(" ").filter(Boolean) || [
      "openid",
      "profile",
      "email",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
    authorization: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
  },
  async ({ tokens }: { tokens: OAuth2Tokens }) => {
    // Fetch user profile from Google
    const response = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.accessToken()}` },
      }
    );

    if (!response.ok) {
      throw new OAuth2Error(
        `Failed to fetch user profile: ${response.status} ${response.statusText}`
      );
    }

    const profile: GoogleProfile = await response.json();

    // Validate email is verified
    if (!profile.verified_email) {
      throw new OAuth2Error("Google email address is not verified");
    }

    // Return profile + tokens for verification/storage
    return {
      profile,
      tokens: {
        access_token: tokens.accessToken(),
        refresh_token: tokens.refreshToken(),
        expires_in: tokens.expiresAt ? Math.floor((tokens.expiresAt.getTime() - Date.now()) / 1000) : undefined,
        token_type: "Bearer",
      },
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
