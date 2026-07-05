import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/env';

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
  const provided = req.get('x-api-key') ?? '';
  const expected = config.API_KEY;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
