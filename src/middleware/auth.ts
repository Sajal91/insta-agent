import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { WithId } from 'mongodb';
import { config, isRazorpayConfigured } from '../config/env';
import { verifyToken } from '../utils/token';
import { usersRepo } from '../db/repositories/users.repo';
import { isSubscriptionActive, type UserDoc } from '../db/types';

/**
 * Express augmentation: the authenticated user (loaded from the session token)
 * is stashed on the request so downstream handlers can scope by tenant.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: WithId<UserDoc>;
    }
  }
}

/** True if the provided value matches the configured API key (constant-time). */
function isValidApiKey(provided: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(config.API_KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Extract a Bearer token from the Authorization header, if present. */
function bearerToken(req: Request): string | null {
  const header = req.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

/**
 * Resolve the acting user from either a session token (Authorization: Bearer,
 * issued by /auth/google) or the static x-api-key (which acts as the admin).
 * Returns null when no valid identity is present.
 */
async function resolveUser(req: Request): Promise<WithId<UserDoc> | null> {
  const token = bearerToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      const user = await usersRepo.findById(payload.sub);
      if (user) return user;
    }
  }

  // Programmatic clients may use the API key; it maps to the admin account.
  if (isValidApiKey(req.get('x-api-key') ?? '')) {
    return usersRepo.findByEmail(config.ADMIN_EMAIL);
  }

  return null;
}

/** Require a valid, signed-in user. Populates req.user. */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await resolveUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  req.user = user;
  next();
}

/** Require an authenticated admin. */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await resolveUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  req.user = user;
  next();
}

/**
 * Require an authenticated user who is allowed to operate the automation:
 * either an admin, or a regular user who has connected their Instagram account
 * AND has an active subscription. The subscription gate only applies when
 * Razorpay is configured, so deployments without billing stay connect-only.
 */
export async function requireActiveTenant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await resolveUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (user.role !== 'admin') {
    if (!user.igCredentials) {
      res.status(403).json({
        error: 'Connect your Instagram account to use the automation.',
        code: 'instagram_not_connected',
      });
      return;
    }
    if (isRazorpayConfigured() && !isSubscriptionActive(user.subscription)) {
      res.status(402).json({
        error:
          'Your subscription is not active. Please complete payment to use the automation.',
        code: 'subscription_required',
      });
      return;
    }
  }
  req.user = user;
  next();
}
