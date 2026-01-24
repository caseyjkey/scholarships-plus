import { prisma } from "~/db.server";
import { encrypt, decrypt } from "~/lib/encryption.server";
import type { GoogleAuthResult } from "~/lib/auth/google.server";

/**
 * Get a user's Google credentials, refreshing if needed
 */
export async function getValidCredential(userId: string, googleAccountId: string) {
  const credential = await prisma.googleCredential.findUnique({
    where: { googleAccountId },
  });

  if (!credential) {
    throw new Error("Google credential not found");
  }

  if (credential.userId !== userId) {
    throw new Error("Credential does not belong to user");
  }

  // Check if token needs refresh
  if (credential.expiresAt <= new Date()) {
    return await refreshCredential(credential);
  }

  return credential;
}

/**
 * Refresh an expired access token
 */
async function refreshCredential(credential: any) {
  const refreshToken = decrypt(credential.refreshToken);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh token");
  }

  const data = await response.json();

  // Calculate expiry (Google tokens expire in 1 hour)
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  return await prisma.googleCredential.update({
    where: { id: credential.id },
    data: {
      accessToken: data.access_token,
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
) {
  const { profile, tokens } = authResult;

  // Calculate expiry
  const expiresAt = new Date(
    Date.now() + (tokens.expires_in || 3600) * 1000
  );

  // Upsert credential
  return await prisma.googleCredential.upsert({
    where: { googleAccountId: profile.id },
    create: {
      googleAccountId: profile.id,
      email: profile.email,
      accessToken: tokens.access_token,
      refreshToken: encrypt(tokens.refresh_token || ""),
      expiresAt,
      userId,
    },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token
        ? encrypt(tokens.refresh_token)
        : undefined,
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
 * Find user by Google email
 */
export async function findUserByEmail(email: string) {
  return await prisma.user.findUnique({
    where: { email },
  });
}

/**
 * Get current access token for API calls
 */
export async function getAccessToken(
  userId: string,
  googleAccountId: string
): Promise<string> {
  const credential = await getValidCredential(userId, googleAccountId);
  return credential.accessToken;
}
