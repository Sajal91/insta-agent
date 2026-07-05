import { Router } from 'express';
import { z } from 'zod';
import { requireApiKey } from '../middleware/auth';
import { reelsRepo } from '../db/repositories/reels.repo';
import { asyncHandler, formatZodError } from '../utils/http';

export const reelsRouter = Router();
reelsRouter.use(requireApiKey);

const upsertSchema = z.object({
  reelId: z.string().min(1),
  enabled: z.boolean().optional(),
  triggerKeywords: z.array(z.string()).nullable().optional(),
  dmTemplate: z.string().min(1).nullable().optional(),
  commentReplyTemplate: z.string().min(1).nullable().optional(),
  blocklistKeywords: z.array(z.string()).nullable().optional(),
  detailedMessageContent: z.string().nullable().optional(),
});

reelsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ reels: await reelsRepo.list() });
  }),
);

reelsRouter.get(
  '/:reelId',
  asyncHandler(async (req, res) => {
    const reel = await reelsRepo.get(req.params.reelId);
    if (!reel) {
      res.status(404).json({ error: 'Reel config not found' });
      return;
    }
    res.json({ reel });
  }),
);

reelsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(formatZodError(parsed.error));
      return;
    }
    const reel = await reelsRepo.upsert(parsed.data);
    res.status(200).json({ reel });
  }),
);

reelsRouter.delete(
  '/:reelId',
  asyncHandler(async (req, res) => {
    const deleted = await reelsRepo.delete(req.params.reelId);
    if (!deleted) {
      res.status(404).json({ error: 'Reel config not found' });
      return;
    }
    res.status(204).send();
  }),
);
