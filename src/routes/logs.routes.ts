import { Router } from 'express';
import { z } from 'zod';
import { requireActiveTenant } from '../middleware/auth';
import { logsRepo } from '../db/repositories/logs.repo';
import { asyncHandler, formatZodError } from '../utils/http';

export const logsRouter = Router();
logsRouter.use(requireActiveTenant);

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

logsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json(formatZodError(parsed.error));
      return;
    }
    const { limit, offset } = parsed.data;
    const ownerId = req.user!._id.toString();
    const { items, total } = await logsRepo.list({ ownerId, limit, offset });
    res.json({ total, limit, offset, items });
  }),
);
