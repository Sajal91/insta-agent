import { Router } from 'express';
import { z } from 'zod';
import { requireApproved } from '../middleware/auth';
import { asyncHandler, formatZodError } from '../utils/http';
import { createInstagramClient } from '../services/instagram.service';
import { resolveCredentials } from '../services/credentials.service';
import { reelsRepo } from '../db/repositories/reels.repo';

export const mediaRouter = Router();
mediaRouter.use(requireApproved);

/**
 * List the account's posts/reels, each annotated with its auto-reply config (if
 * any) so the admin panel can render everything in one call. Uses the acting
 * tenant's own Instagram credentials.
 */
mediaRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const ownerId = req.user!._id.toString();
    const creds = resolveCredentials(req.user!);
    if (!creds) {
      res.status(409).json({
        error:
          'No Instagram credentials configured for your account yet. Please contact the admin.',
      });
      return;
    }
    const ig = createInstagramClient(creds);
    const limit = Math.min(Number(req.query.limit) || 25, 50);
    const [media, configs] = await Promise.all([
      ig.listMedia(limit),
      reelsRepo.list(ownerId),
    ]);
    const configByReel = new Map(configs.map((c) => [c.reelId, c]));
    const items = media.map((m) => ({
      ...m,
      config: configByReel.get(m.id) ?? null,
    }));
    res.json({ items });
  }),
);

const publishSchema = z.object({
  mediaType: z.enum(['IMAGE', 'REELS']),
  mediaUrl: z.string().url(),
  caption: z.string().optional(),
});

/**
 * Publish a new post/reel from a public media URL (Content Publishing API).
 * Note: Meta fetches the URL, so it must be publicly reachable (not localhost).
 */
mediaRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = publishSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(formatZodError(parsed.error));
      return;
    }
    const creds = resolveCredentials(req.user!);
    if (!creds) {
      res.status(409).json({
        error:
          'No Instagram credentials configured for your account yet. Please contact the admin.',
      });
      return;
    }
    const ig = createInstagramClient(creds);
    const mediaId = await ig.publishMedia(parsed.data);
    res.status(201).json({ mediaId });
  }),
);
