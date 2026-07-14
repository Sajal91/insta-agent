import { Router } from 'express';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { signToken } from '../utils/token';
import { usersRepo, mapUser } from '../db/repositories/users.repo';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, formatZodError } from '../utils/http';

export const authRouter = Router();

const googleClient = new OAuth2Client(config.GOOGLE_CLIENT_ID);

const googleSchema = z.object({
  // The ID token (JWT) returned by Google Identity Services on the frontend.
  credential: z.string().min(1),
});

/**
 * Google sign-in / sign-up. The frontend obtains an ID token via Google
 * Identity Services and posts it here. We verify it against GOOGLE_CLIENT_ID,
 * upsert the user (creating one on first login), and issue a session token.
 */
authRouter.post(
  '/google',
  asyncHandler(async (req, res) => {
    if (!config.GOOGLE_CLIENT_ID) {
      res.status(500).json({ error: 'Google sign-in is not configured' });
      return;
    }

    const parsed = googleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(formatZodError(parsed.error));
      return;
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: parsed.data.credential,
        audience: config.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'Google token verification failed');
      res.status(401).json({ error: 'Invalid Google credential' });
      return;
    }

    if (!payload?.sub || !payload.email || !payload.email_verified) {
      res.status(401).json({ error: 'Google account email not verified' });
      return;
    }

    const user = await usersRepo.upsertFromGoogle(
      {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name ?? payload.email,
        picture: payload.picture ?? null,
      },
      config.ADMIN_EMAIL,
    );

    const { token, expiresAt } = signToken(user._id.toString());
    res.json({ token, expiresAt, user: mapUser(user) });
  }),
);

/** Return the current signed-in user (used by the panel on load). */
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: mapUser(req.user!) });
  }),
);

const requestSchema = z.object({
  note: z.string().max(2000).optional(),
});

/**
 * A signed-in user requests access to the automation. Moves their status to
 * "pending" for the admin to review. The request is recorded on the user
 * document (the "users collection").
 */
authRouter.post(
  '/request-automation',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = requestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json(formatZodError(parsed.error));
      return;
    }
    const user = req.user!;
    if (user.role === 'admin') {
      res.status(400).json({ error: 'Admins already have full access' });
      return;
    }
    if (user.status === 'approved') {
      res.status(400).json({ error: 'Your access is already approved' });
      return;
    }
    const updated = await usersRepo.requestAutomation(
      user._id.toString(),
      parsed.data.note ?? null,
    );
    res.json({ user: updated });
  }),
);
