import { prisma } from "~/db.server";
import { sessionStorage } from "~/session.server";
import { googleStrategy, type GoogleAuthResult } from "./google.server";
import {
  findUserByGoogleAccount,
  findUserByEmail,
  linkGoogleAccount,
} from "~/models/google-credential.server";
import { createUser, getUserById } from "~/models/user.server";
import { Authenticator } from "remix-auth";

// Create authenticator instance
export const authenticator = new Authenticator(sessionStorage);

// Add Google OAuth strategy
authenticator.use(googleStrategy, "google");

/**
 * Verify and create session after Google OAuth
 */
export async function verifyGoogleAccount(authResult: GoogleAuthResult) {
  const { profile } = authResult;

  // 1. Check if Google account already linked
  const existingByGoogle = await findUserByGoogleAccount(profile.id);
  if (existingByGoogle) {
    return existingByGoogle;
  }

  // 2. Check if email matches existing user (link accounts)
  const existingByEmail = await findUserByEmail(profile.email);
  if (existingByEmail) {
    await linkGoogleAccount(existingByEmail.id, authResult);
    return existingByEmail;
  }

  // 3. Create new user (no password for OAuth-only users)
  const newUser = await createUser(profile.email);

  // Link Google account
  await linkGoogleAccount(newUser.id, authResult);

  return newUser;
}
