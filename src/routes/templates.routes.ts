import { Router } from 'express';
import { z } from 'zod';
import { requireApiKey } from '../middleware/auth';
import { templatesRepo, type TemplateKey } from '../db/repositories/templates.repo';
import { asyncHandler, formatZodError } from '../utils/http';

export const templatesRouter = Router();
templatesRouter.use(requireApiKey);

const putSchema = z
  .object({
    STEP_1_TEMPLATE: z.string().min(1).optional(),
    STEP_2_TEMPLATE: z.string().min(1).optional(),
    NUDGE_TEMPLATE: z.string().min(1).optional(),
    DETAILED_MESSAGE_CONTENT: z.string().min(1).optional(),
    DEFAULT_CONFIRMATION_KEYWORD: z.string().min(1).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'Provide at least one template key to update',
  });

templatesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ templates: await templatesRepo.getAll() });
  }),
);

templatesRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = putSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(formatZodError(parsed.error));
      return;
    }
    await templatesRepo.setMany(
      parsed.data as Partial<Record<TemplateKey, string>>,
    );
    res.json({ templates: await templatesRepo.getAll() });
  }),
);
