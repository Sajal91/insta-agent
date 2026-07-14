import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth';
import { usersRepo } from '../db/repositories/users.repo';
import { asyncHandler, formatZodError } from '../utils/http';

export const usersRouter = Router();
usersRouter.use(requireAdmin);

/** List every signed-up user (with request status + credential summary). */
usersRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ users: await usersRepo.list() });
  }),
);

const statusSchema = z.object({
  status: z.enum(['none', 'pending', 'approved', 'rejected']),
});

/** Approve / reject / reset a user's automation request. */
usersRouter.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(formatZodError(parsed.error));
      return;
    }
    const user = await usersRepo.setStatus(req.params.id, parsed.data.status);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user });
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

const credentialsSchema = z.object({
  appId: z.string().trim().min(1),
  appSecret: z.string().trim().min(1),
  accessToken: z.string().trim().min(1),
  businessAccountId: z.string().trim().min(1),
  pageHandle: z.string().trim().min(1),
  verifyToken: z.string().trim().min(1),
  graphApiVersion: z.string().trim().optional(),
  graphBaseUrl: z.string().trim().url().optional(),
});

/**
 * Set (or replace) the Instagram credentials the automation uses on behalf of a
 * user. Secrets are encrypted at rest; only a summary is ever returned.
 */
usersRouter.put(
  '/:id/credentials',
  asyncHandler(async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(formatZodError(parsed.error));
      return;
    }
    const user = await usersRepo.setCredentials(req.params.id, parsed.data);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user });
  }),
);

/** Remove a user's stored credentials. */
usersRouter.delete(
  '/:id/credentials',
  asyncHandler(async (req, res) => {
    const user = await usersRepo.clearCredentials(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user });
  }),
);
