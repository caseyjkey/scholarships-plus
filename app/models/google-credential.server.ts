import { prisma } from "~/db.server";
import { encrypt, decrypt } from "~/lib/encryption.server";
import type { GoogleAuthResult } from "~/lib/auth/google.server";
import type { GoogleCredential } from "@prisma/client";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

// Validate required environment variables
const requiredEnvVars = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
} as const;

const missing = Object.entries(requiredEnvVars)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  throw new Error(
    `Missing required Google OAuth environment variables: ${missing.join(", ")}`
  );
}

// Type guard for validated env vars
const envVars = requiredEnvVars as {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
};

/**
 * Get a user's Google credentials, refreshing if needed
 */
export async function getValidCredential(
  userId: string,
  googleAccountId: string
): Promise<GoogleCredential> {
  const credential = await prisma.googleCredential.findUnique({
    where: { googleAccountId },
  });

  if (!credential) {
    throw new Error("Google credential not found");
  }

  if (credential.userId !== userId) {
    throw new Error("Credential does not belong to user");
  }

  // Check if token needs refresh (with 5 minute buffer)
  if (credential.expiresAt <= new Date(Date.now() + 5 * 60 * 1000)) {
    return await refreshCredential(credential);
  }

  return credential;
}

/**
 * Refresh an expired access token
 */
async function refreshCredential(
  credential: GoogleCredential
): Promise<GoogleCredential> {
  const refreshToken = decrypt(credential.refreshToken);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: envVars.GOOGLE_CLIENT_ID,
      client_secret: envVars.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    // If refresh fails, delete the invalid credential
    await prisma.googleCredential.delete({
      where: { id: credential.id },
    });
    throw new Error(
      `Failed to refresh token: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  // Validate response has required fields
  if (!data.access_token || !data.expires_in) {
    throw new Error("Invalid token response from Google");
  }

  // Calculate expiry (Google tokens expire in 1 hour)
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  return await prisma.googleCredential.update({
    where: { id: credential.id },
    data: {
      accessToken: encrypt(data.access_token),
      expiresAt,
    },
  });
}

/**
 * Create or link a Google credential to a user
 */
export async function linkGoogleAccount(
  userId: string,
  authResult: GoogleAuthResult
): Promise<GoogleCredential> {
  const { profile, tokens } = authResult;

  // Calculate expiry
  const expiresAt = new Date(
    Date.now() + (tokens.expires_in || 3600) * 1000
  );

  // Check if credential already exists
  const existing = await prisma.googleCredential.findUnique({
    where: { googleAccountId: profile.id },
  });

  // For new credentials, require refresh token
  if (!existing && !tokens.refresh_token) {
    throw new Error("Google OAuth did not return a refresh token");
  }

  // Preserve existing refresh token if not provided (re-authorization case)
  const refreshToken = tokens.refresh_token
    ? encrypt(tokens.refresh_token)
    : existing?.refreshToken;

  if (!refreshToken) {
    throw new Error("No refresh token available");
  }

  // Upsert credential
  return await prisma.googleCredential.upsert({
    where: { googleAccountId: profile.id },
    create: {
      googleAccountId: profile.id,
      email: profile.email,
      accessToken: encrypt(tokens.access_token),
      refreshToken,
      expiresAt,
      userId,
    },
    update: {
      accessToken: encrypt(tokens.access_token),
      expiresAt,
      userId,
    },
  });
}

/**
 * Get all Google accounts for a user
 */
export async function getUserGoogleAccounts(userId: string) {
  return await prisma.googleCredential.findMany({
    where: { userId },
    select: {
      id: true,
      googleAccountId: true,
      email: true,
      createdAt: true,
    },
  });
}

/**
 * Unlink a Google account
 */
export async function unlinkGoogleAccount(
  userId: string,
  credentialId: string
) {
  return await prisma.googleCredential.deleteMany({
    where: { id: credentialId, userId },
  });
}

/**
 * Find user by Google account ID
 */
export async function findUserByGoogleAccount(googleAccountId: string) {
  const credential = await prisma.googleCredential.findUnique({
    where: { googleAccountId },
    include: { user: true },
  });

  return credential?.user || null;
}

/**
 * Find user by email (reuses existing function if available)
 */
export async function findUserByEmail(email: string) {
  return await prisma.user.findUnique({
    where: { email },
  });
}

/**
 * Get current access token for API calls (decrypted)
 */
export async function getAccessToken(
  userId: string,
  googleAccountId: string
): Promise<string> {
  const credential = await getValidCredential(userId, googleAccountId);
  return decrypt(credential.accessToken);
}

/**
 * Verify JWT token for extension authentication
 * Returns userId if valid, null otherwise
 */
export function verifyExtensionToken(authHeader: string): string | null {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    return decoded.userId;
  } catch {
    return null;
  }
}
