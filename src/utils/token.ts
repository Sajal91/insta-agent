import crypto from 'node:crypto';
import { config } from '../config/env';

/**
 * Minimal stateless session token, HMAC-SHA256 signed with AUTH_SECRET. Format:
 *
 *   base64url(JSON payload).base64url(signature)
 *
 * This avoids pulling in a JWT dependency while giving us a tamper-proof,
 * self-expiring token for the admin panel.
 */
export interface SessionPayload {
  /** Subject — the admin email. */
  sub: string;
  /** Issued-at (unix seconds). */
  iat: number;
  /** Expiry (unix seconds). */
  exp: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(
    input.replace(/-/g, '+').replace(/_/g, '/') + pad,
    'base64',
  );
}

function sign(data: string): string {
  return b64url(crypto.createHmac('sha256', config.AUTH_SECRET).update(data).digest());
}

/** Issue a signed session token for the given subject (admin email). */
export function signToken(sub: string): { token: string; expiresAt: string } {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + config.AUTH_TOKEN_TTL_HOURS * 3600;
  const payload: SessionPayload = { sub, iat: now, exp };
  const body = b64url(JSON.stringify(payload));
  const token = `${body}.${sign(body)}`;
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

/** Verify + decode a session token. Returns the payload, or null if invalid/expired. */
export function verifyToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [body, sig] = parts;
  const expectedSig = sign(body);

  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(b64urlDecode(body).toString('utf8')) as SessionPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
