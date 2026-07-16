import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth';
import { usersRepo } from '../db/repositories/users.repo';
import { asyncHandler, formatZodError } from '../utils/http';

export const usersRouter = Router();
usersRouter.use(requireAdmin);

/** List every signed-up user (with connection + subscription summary). */
usersRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ users: await usersRepo.list() });
  }),
);

const roleSchema = z.object({ role: z.enum(['user', 'admin']) });

/** Change a user's role (promote to admin / demote to user). */
usersRouter.patch(
  '/:id/role',
  asyncHandler(async (req, res) => {
    const parsed = roleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(formatZodError(parsed.error));
      return;
    }
    const user = await usersRepo.setRole(req.params.id, parsed.data.role);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user });
  }),
);
