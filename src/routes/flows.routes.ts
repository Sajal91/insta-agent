import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { flowStateRepo } from '../db/repositories/flow-state.repo';
import { asyncHandler } from '../utils/http';

export const flowsRouter = Router();
flowsRouter.use(requireAuth);

/** View a user's flow state/history — handy when debugging a support request. */
flowsRouter.get(
  '/:igUserId',
  asyncHandler(async (req, res) => {
    const states = await flowStateRepo.listByUser(req.params.igUserId);
    res.json({ igUserId: req.params.igUserId, states });
  }),
);
