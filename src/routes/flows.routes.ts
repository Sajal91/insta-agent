import { Router } from 'express';
import { requireActiveTenant } from '../middleware/auth';
import { flowStateRepo } from '../db/repositories/flow-state.repo';
import { asyncHandler } from '../utils/http';

export const flowsRouter = Router();
flowsRouter.use(requireActiveTenant);

/** View a commenter's flow state/history within the acting tenant. */
flowsRouter.get(
  '/:igUserId',
  asyncHandler(async (req, res) => {
    const ownerId = req.user!._id.toString();
    const states = await flowStateRepo.listByUser(ownerId, req.params.igUserId);
    res.json({ igUserId: req.params.igUserId, states });
  }),
);
