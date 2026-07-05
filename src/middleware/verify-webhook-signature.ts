import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Express augmentation: we stash the raw request body (needed for signature
 * verification) on the request during body parsing.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

/**
 * Verify Meta's `X-Hub-Signature-256` header. Meta signs the raw request body
 * with HMAC-SHA256 using the app secret. We must hash the EXACT raw bytes, so
 * the JSON body parser is configured with a `verify` hook (see app.ts) that
 * captures `req.rawBody`.
 */
export function verifyWebhookSignature(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const signatureHeader = req.get('x-hub-signature-256');
  if (!signatureHeader) {
    logger.warn('Webhook request missing X-Hub-Signature-256 header');
    res.sendStatus(401);
    return;
  }

  const raw = req.rawBody;
  if (!raw) {
    logger.error('Raw body unavailable for signature verification');
    res.sendStatus(400);
    return;
  }

  const expected =
    'sha256=' +
    crypto
      .createHmac('sha256', config.IG_APP_SECRET)
      .update(raw)
      .digest('hex');

  const sigBuf = Buffer.from(signatureHeader);
  const expBuf = Buffer.from(expected);

  // timingSafeEqual throws if lengths differ, so guard first.
  if (
    sigBuf.length !== expBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expBuf)
  ) {
    logger.warn('Webhook signature mismatch — rejecting');
    res.sendStatus(401);
    return;
  }

  next();
}
