import { Router } from 'express';
import { z } from 'zod';
import { adminRepo } from '../db/repositories/admin.repo';
import { verifyPassword } from '../utils/password';
import { signToken, verifyToken } from '../utils/token';
import { asyncHandler, formatZodError } from '../utils/http';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Admin login. Verifies the email + password against the scrypt hash stored in
 * the database (seeded from the env credentials) and returns a signed session
 * token. A generic 401 is returned for any failure so we don't reveal whether
 * the email or the password was wrong.
 */
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(formatZodError(parsed.error));
      return;
    }

    const { email, password } = parsed.data;
    const admin = await adminRepo.findByEmail(email);

    if (!admin || !verifyPassword(password, admin.passwordHash)) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const { token, expiresAt } = signToken(admin._id);
    res.json({ token, expiresAt, email: admin._id });
  }),
);

/** Validate the current session token (used by the panel on load). */
authRouter.get(
  '/me',
  (req, res) => {
    const header = req.get('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    const payload = match ? verifyToken(match[1]) : null;

    if (!payload) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.json({ email: payload.sub, expiresAt: new Date(payload.exp * 1000).toISOString() });
  },
);
