import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config/env';
import { requireApiKey } from '../middleware/auth';
import { asyncHandler, formatZodError } from '../utils/http';
import { instagramService } from '../services/instagram.service';
import { render } from '../services/template.service';
import { reelsRepo } from '../db/repositories/reels.repo';
import { templatesRepo } from '../db/repositories/templates.repo';
import { flowStateRepo } from '../db/repositories/flow-state.repo';
import { logsRepo } from '../db/repositories/logs.repo';

export const replyRouter = Router();
replyRouter.use(requireApiKey);

const manualSchema = z.object({
  commentId: z.string().min(1),
  step: z.union([z.literal(1), z.literal(2)]),
  // Optional context; if omitted we try to fetch it from the Graph API.
  reelId: z.string().min(1).optional(),
  igUserId: z.string().min(1).optional(),
  dryRun: z.boolean().optional().default(false),
});

async function resolveKeyword(reelId: string | undefined): Promise<string> {
  const reel = reelId ? await reelsRepo.get(reelId) : null;
  if (reel?.confirmationKeyword?.trim()) return reel.confirmationKeyword.trim();
  return (
    (await templatesRepo.get('DEFAULT_CONFIRMATION_KEYWORD'))?.trim() ||
    config.DEFAULT_CONFIRMATION_KEYWORD
  );
}

async function resolveTemplate(
  reelId: string | undefined,
  step: 1 | 2,
): Promise<string> {
  const reel = reelId ? await reelsRepo.get(reelId) : null;
  const override = step === 1 ? reel?.step1Template : reel?.step2Template;
  if (override?.trim()) return override;
  return (
    (await templatesRepo.get(step === 1 ? 'STEP_1_TEMPLATE' : 'STEP_2_TEMPLATE')) ??
    ''
  );
}

async function resolveDetailed(reelId: string | undefined): Promise<string> {
  const reel = reelId ? await reelsRepo.get(reelId) : null;
  if (reel?.detailedMessageContent?.trim()) return reel.detailedMessageContent;
  return (await templatesRepo.get('DETAILED_MESSAGE_CONTENT')) ?? '';
}

/**
 * Manually fire a Step 1 or Step 2 reply to a specific comment. Intended for
 * testing/support. `dryRun: true` renders the message without posting.
 */
replyRouter.post(
  '/manual',
  asyncHandler(async (req, res) => {
    const parsed = manualSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(formatZodError(parsed.error));
      return;
    }
    const { commentId, step, dryRun } = parsed.data;
    let { reelId, igUserId } = parsed.data;

    // Fill missing context from the Graph API (best-effort).
    if (!reelId || !igUserId) {
      try {
        const comment = await instagramService.getComment(commentId);
        reelId = reelId ?? comment.media?.id;
        igUserId = igUserId ?? comment.from?.id;
      } catch {
        // Non-fatal: caller can still pass reelId/igUserId explicitly.
      }
    }

    const keyword = await resolveKeyword(reelId);
    const template = await resolveTemplate(reelId, step);
    const message = render(template, {
      pageHandle: config.IG_PAGE_HANDLE,
      confirmationKeyword: keyword,
      detailedMessageContent:
        step === 2 ? await resolveDetailed(reelId) : undefined,
    });

    if (dryRun) {
      res.json({ dryRun: true, commentId, step, message });
      return;
    }

    const replyId = await instagramService.replyToComment(commentId, message);

    // Keep flow state consistent with the manual action when we know the user/reel.
    if (igUserId && reelId) {
      if (step === 1) {
        await flowStateRepo.upsert({
          igUserId,
          commentId: replyId,
          reelId,
          stage: 'AWAITING_FOLLOW_CONFIRMATION',
        });
      } else {
        await flowStateRepo.updateStage(igUserId, reelId, 'COMPLETED');
      }
    }

    await logsRepo.add({
      commentId,
      igUserId: igUserId ?? null,
      reelId: reelId ?? null,
      action: step === 1 ? 'STEP_1_REPLIED' : 'STEP_2_REPLIED',
      status: 'success',
      message: `manual reply_id=${replyId}`,
    });

    res.json({ commentId, step, replyId, message });
  }),
);
