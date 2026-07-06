import crypto from 'node:crypto';

/**
 * Password hashing using Node's built-in scrypt (no external deps). The stored
 * form is self-describing so we can verify without extra config:
 *
 *   scrypt$<N>$<r>$<p>$<saltB64>$<hashB64>
 *
 * Only this hash is ever persisted to the database — the plaintext password
 * lives solely in the environment.
 */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

function scrypt(password: string, salt: Buffer): Buffer {
  return crypto.scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    // scrypt needs a bumped maxmem for these cost params.
    maxmem: 128 * SCRYPT_N * SCRYPT_R * 2,
  });
}

/** Produce a salted scrypt hash string for storage. */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = scrypt(password, salt);
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/** Constant-time verify a plaintext password against a stored scrypt hash. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, , , , saltB64, hashB64] = parts;
  try {
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const derived = scrypt(password, salt);
    return (
      derived.length === expected.length &&
      crypto.timingSafeEqual(derived, expected)
    );
  } catch {
    return false;
  }
}
