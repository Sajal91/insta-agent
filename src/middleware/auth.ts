import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/env';
import { verifyToken } from '../utils/token';

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
 * Simple API-key gate for the internal config/admin routes. Client sends the
 * key in the `x-api-key` header. Constant-time compare to avoid leaking the
 * key length/prefix via timing.
 */
export function requireApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!isValidApiKey(req.get('x-api-key') ?? '')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

/**
 * Gate that accepts EITHER a valid admin session token (Authorization: Bearer
 * <token>, issued by POST /auth/login) OR the static `x-api-key`. This lets the
 * admin panel authenticate via login while programmatic clients keep using the
 * API key.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = bearerToken(req);
  if (token && verifyToken(token)) {
    next();
    return;
  }

  if (isValidApiKey(req.get('x-api-key') ?? '')) {
    next();
    return;
  }

  res.status(401).json({ error: 'Unauthorized' });
}
