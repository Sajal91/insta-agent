import crypto from 'node:crypto';
import { config } from '../config/env';

/**
 * Symmetric encryption for secrets we must store at rest (per-user Instagram
 * access tokens and app secrets). Uses AES-256-GCM with a key derived from
 * AUTH_SECRET via scrypt, so rotating AUTH_SECRET invalidates old ciphertexts
 * (they can no longer be decrypted — treat that as intentional).
 *
 * Wire format (all base64url, dot-separated):
 *   v1.<salt>.<iv>.<authTag>.<ciphertext>
 */

const VERSION = 'v1';
const KEY_LEN = 32; // AES-256
const IV_LEN = 12; // GCM standard nonce length

function b64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function deriveKey(salt: Buffer): Buffer {
  return crypto.scryptSync(config.AUTH_SECRET, salt, KEY_LEN);
}

/** Encrypt a plaintext string. Returns a self-describing token (see wire format). */
export function encryptSecret(plaintext: string): string {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    b64url(salt),
    b64url(iv),
    b64url(authTag),
    b64url(ciphertext),
  ].join('.');
}

/**
 * Decrypt a token produced by encryptSecret. Returns null if the token is
 * malformed or fails authentication (e.g. AUTH_SECRET changed).
 */
export function decryptSecret(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 5 || parts[0] !== VERSION) return null;
    const [, saltB64, ivB64, tagB64, dataB64] = parts;
    const key = deriveKey(fromB64url(saltB64));
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      fromB64url(ivB64),
    );
    decipher.setAuthTag(fromB64url(tagB64));
    const plaintext = Buffer.concat([
      decipher.update(fromB64url(dataB64)),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  } catch {
    return null;
  }
}
