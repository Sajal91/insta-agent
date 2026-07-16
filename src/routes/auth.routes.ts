import { Router } from 'express';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { signToken, verifyToken } from '../utils/token';
import { usersRepo, mapUser } from '../db/repositories/users.repo';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, formatZodError } from '../utils/http';
import {
  buildAuthorizeUrl,
  exchangeCode,
  exchangeForLongLived,
  fetchProfile,
  isInstagramOAuthConfigured,
  subscribeWebhooks,
} from '../services/instagram-oauth.service';

export const authRouter = Router();

const googleClient = new OAuth2Client(config.GOOGLE_CLIENT_ID);

/** Base URL of the frontend to redirect back to after the OAuth callback. */
function frontendBaseUrl(): string {
  if (config.APP_PUBLIC_URL) return config.APP_PUBLIC_URL.replace(/\/$/, '');
  if (config.CORS_ORIGIN && config.CORS_ORIGIN !== '*') {
    return config.CORS_ORIGIN.split(',')[0].trim().replace(/\/$/, '');
  }
  return '';
}

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

// ---- Self-serve Instagram Business Login (OAuth) ----

/**
 * Return the Instagram Business Login authorize URL for the signed-in user. The
 * user id is embedded in a short-lived signed `state` so the callback can tie
 * the connection back to them (the OAuth redirect carries no session token).
 */
authRouter.get(
  '/instagram/login',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isInstagramOAuthConfigured()) {
      res.status(503).json({ error: 'Instagram connection is not configured' });
      return;
    }
    const { token: state } = signToken(req.user!._id.toString());
    res.json({ url: buildAuthorizeUrl(state) });
  }),
);

/**
 * OAuth redirect target. Meta sends the user back here with ?code&state. We
 * verify state -> user, exchange the code for a long-lived token, resolve the
 * IG business account, store encrypted credentials, subscribe the account to
 * webhooks, and bounce the browser back to the frontend.
 */
authRouter.get(
  '/instagram/callback',
  asyncHandler(async (req, res) => {
    const base = frontendBaseUrl();
    const fail = (reason: string) =>
      res.redirect(`${base}/?connect_error=${encodeURIComponent(reason)}`);

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const error =
      typeof req.query.error_description === 'string'
        ? req.query.error_description
        : typeof req.query.error === 'string'
          ? req.query.error
          : '';

    if (error) {
      logger.warn({ error }, 'Instagram OAuth returned an error');
      return fail(error);
    }
    if (!code || !state) return fail('missing_code_or_state');

    const payload = verifyToken(state);
    if (!payload) return fail('invalid_state');

    console.log("payload ", payload)

    const user = await usersRepo.findById(payload.sub);
    if (!user) return fail('unknown_user');

    try {
      const short = await exchangeCode(code);
      const long = await exchangeForLongLived(short.accessToken);
      const profile = await fetchProfile(long.accessToken);

      await usersRepo.connectInstagram(user._id.toString(), {
        appId: config.IG_APP_ID,
        appSecret: config.IG_APP_SECRET,
        accessToken: long.accessToken,
        businessAccountId: profile.userId,
        pageHandle: profile.username,
        verifyToken: config.IG_VERIFY_TOKEN,
        graphApiVersion: config.IG_GRAPH_API_VERSION,
        graphBaseUrl: 'https://graph.instagram.com',
      });

      await subscribeWebhooks(profile.userId, long.accessToken);

      logger.info(
        { userId: user._id.toString(), igUserId: profile.userId },
        'Instagram account connected via self-serve OAuth',
      );
      return res.redirect(`${base}/?connected=1`);
    } catch (err) {
      logger.error(
        { err: (err as Error).message, userId: user._id.toString() },
        'Instagram OAuth connection failed',
      );
      return fail('connection_failed');
    }
  }),
);

/** Disconnect the signed-in user's Instagram account (clears credentials). */
authRouter.delete(
  '/instagram',
  requireAuth,
  asyncHandler(async (req, res) => {
    const updated = await usersRepo.clearCredentials(req.user!._id.toString());
    res.json({ user: updated });
  }),
);
