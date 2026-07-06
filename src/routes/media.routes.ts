import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, formatZodError } from '../utils/http';
import { instagramService } from '../services/instagram.service';
import { reelsRepo } from '../db/repositories/reels.repo';

export const mediaRouter = Router();
mediaRouter.use(requireAuth);

/**
 * List the account's posts/reels, each annotated with its auto-reply config (if
 * any) so the admin panel can render everything in one call.
 */
mediaRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 25, 50);
    const [media, configs] = await Promise.all([
      instagramService.listMedia(limit),
      reelsRepo.list(),
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
    const mediaId = await instagramService.publishMedia(parsed.data);
    res.status(201).json({ mediaId });
  }),
);
