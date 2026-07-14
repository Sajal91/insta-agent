import type { WithId } from 'mongodb';
import { config } from '../config/env';
import { decryptStored, usersRepo } from '../db/repositories/users.repo';
import type { IgCredentials, UserDoc } from '../db/types';

/**
 * Credential resolution for the multi-tenant model.
 *
 *  - The env IG_* values belong ONLY to the admin (the user whose email matches
 *    ADMIN_EMAIL) and are used when that user has no per-user credentials stored.
 *  - Every other user uses the credentials the admin entered for them (stored
 *    encrypted in their user document).
 */

/** True when the env holds a complete admin Instagram credential set. */
export function hasAdminEnvCredentials(): boolean {
  return Boolean(
    config.IG_ACCESS_TOKEN &&
      config.IG_BUSINESS_ACCOUNT_ID &&
      config.IG_APP_SECRET,
  );
}

/** The admin's Instagram credentials sourced from the environment. */
export function adminEnvCredentials(): IgCredentials | null {
  if (!hasAdminEnvCredentials()) return null;
  return {
    appId: config.IG_APP_ID,
    appSecret: config.IG_APP_SECRET,
    accessToken: config.IG_ACCESS_TOKEN,
    businessAccountId: config.IG_BUSINESS_ACCOUNT_ID,
    pageHandle: config.IG_PAGE_HANDLE,
    verifyToken: config.IG_VERIFY_TOKEN,
    graphApiVersion: config.IG_GRAPH_API_VERSION,
    graphBaseUrl: config.IG_GRAPH_BASE_URL,
  };
}

function isAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === config.ADMIN_EMAIL.trim().toLowerCase();
}

/**
 * Resolve usable Instagram credentials for a given user, or null when none are
 * configured. Stored (per-user) credentials always win; the admin falls back to
 * the env credentials.
 */
export function resolveCredentials(user: WithId<UserDoc>): IgCredentials | null {
  const stored = decryptStored(user.igCredentials);
  if (stored) return stored;
  if (user.role === 'admin' || isAdminEmail(user.email)) {
    return adminEnvCredentials();
  }
  return null;
}

export interface OwnerContext {
  ownerId: string;
  user: WithId<UserDoc>;
  credentials: IgCredentials;
}

/**
 * Given an Instagram business account id (the webhook `entry.id`), find the
 * tenant that owns it and their resolved credentials. Checks the admin env
 * account first, then per-user stored credentials.
 */
export async function findOwnerByBusinessAccountId(
  businessAccountId: string,
): Promise<OwnerContext | null> {
  const env = adminEnvCredentials();
  if (env && env.businessAccountId === businessAccountId) {
    const admin = await usersRepo.findByEmail(config.ADMIN_EMAIL);
    if (admin) {
      return { ownerId: admin._id.toString(), user: admin, credentials: env };
    }
  }

  const user = await usersRepo.findByBusinessAccountId(businessAccountId);
  if (!user) return null;
  const credentials = resolveCredentials(user);
  if (!credentials) return null;
  return { ownerId: user._id.toString(), user, credentials };
}

/**
 * Resolve the app secret to use for verifying a webhook signature for a given
 * business account id. Falls back to the env app secret for the admin account.
 */
export async function findAppSecretForBusinessAccountId(
  businessAccountId: string,
): Promise<string | null> {
  const ctx = await findOwnerByBusinessAccountId(businessAccountId);
  if (ctx) return ctx.credentials.appSecret;
  return null;
}

/**
 * Does a webhook verify-token match any tenant (admin env or a stored per-user
 * token)? Used for the Meta GET handshake.
 */
export async function isKnownVerifyToken(token: string): Promise<boolean> {
  if (!token) return false;
  if (config.IG_VERIFY_TOKEN && token === config.IG_VERIFY_TOKEN) return true;
  const user = await usersRepo.findByVerifyToken(token);
  return Boolean(user);
}
