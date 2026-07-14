import { Router } from 'express';
import { z } from 'zod';
import { requireApproved } from '../middleware/auth';
import { reelsRepo } from '../db/repositories/reels.repo';
import { asyncHandler, formatZodError } from '../utils/http';

export const reelsRouter = Router();
reelsRouter.use(requireApproved);

const linkSchema = z.object({
  // Instagram button titles are capped at 20 characters.
  label: z.string().trim().min(1).max(20),
  url: z.string().trim().url(),
});

const upsertSchema = z.object({
  reelId: z.string().min(1),
  enabled: z.boolean().optional(),
  triggerKeywords: z.array(z.string()).nullable().optional(),
  dmTemplate: z.string().min(1).nullable().optional(),
  commentReplyTemplate: z.string().min(1).nullable().optional(),
  blocklistKeywords: z.array(z.string()).nullable().optional(),
  detailedMessageContent: z.string().nullable().optional(),
  // Instagram's button template allows at most 3 buttons per message.
  links: z.array(linkSchema).max(3).nullable().optional(),
});

reelsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const ownerId = req.user!._id.toString();
    res.json({ reels: await reelsRepo.list(ownerId) });
  }),
);

reelsRouter.get(
  '/:reelId',
  asyncHandler(async (req, res) => {
    const ownerId = req.user!._id.toString();
    const reel = await reelsRepo.get(ownerId, req.params.reelId);
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
    const ownerId = req.user!._id.toString();
    const reel = await reelsRepo.upsert(ownerId, parsed.data);
    res.status(200).json({ reel });
  }),
);

reelsRouter.delete(
  '/:reelId',
  asyncHandler(async (req, res) => {
    const ownerId = req.user!._id.toString();
    const deleted = await reelsRepo.delete(ownerId, req.params.reelId);
    if (!deleted) {
      res.status(404).json({ error: 'Reel config not found' });
      return;
    }
    res.status(204).send();
  }),
);
