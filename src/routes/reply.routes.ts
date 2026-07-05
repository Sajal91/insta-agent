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
  // Optional context; if omitted we try to fetch it from the Graph API.
  reelId: z.string().min(1).optional(),
  igUserId: z.string().min(1).optional(),
  dryRun: z.boolean().optional().default(false),
});

async function resolveTemplate(
  reelId: string | undefined,
  which: 'dm' | 'commentReply',
): Promise<string> {
  const reel = reelId ? await reelsRepo.get(reelId) : null;
  const override = which === 'dm' ? reel?.dmTemplate : reel?.commentReplyTemplate;
  if (override?.trim()) return override;
  return (
    (await templatesRepo.get(
      which === 'dm' ? 'DM_TEMPLATE' : 'COMMENT_REPLY_TEMPLATE',
    )) ?? ''
  );
}

async function resolveDetailed(reelId: string | undefined): Promise<string> {
  const reel = reelId ? await reelsRepo.get(reelId) : null;
  if (reel?.detailedMessageContent?.trim()) return reel.detailedMessageContent;
  return (await templatesRepo.get('DETAILED_MESSAGE_CONTENT')) ?? '';
}

/**
 * Manually trigger the "send details" flow for a specific comment: DM the
 * details to the commenter + post the public "sent to your DM" reply. Intended
 * for testing/support. `dryRun: true` renders both messages without posting.
 */
replyRouter.post(
  '/manual',
  asyncHandler(async (req, res) => {
    const parsed = manualSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(formatZodError(parsed.error));
      return;
    }
    const { commentId, dryRun } = parsed.data;
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

    const dmMessage = render(await resolveTemplate(reelId, 'dm'), {
      pageHandle: config.IG_PAGE_HANDLE,
      detailedMessageContent: await resolveDetailed(reelId),
    });
    const replyMessage = render(await resolveTemplate(reelId, 'commentReply'), {
      pageHandle: config.IG_PAGE_HANDLE,
    });

    if (dryRun) {
      res.json({ dryRun: true, commentId, dmMessage, replyMessage });
      return;
    }

    const messageId = await instagramService.sendPrivateReply(commentId, dmMessage);
    const replyId = await instagramService.replyToComment(commentId, replyMessage);

    if (igUserId && reelId) {
      await flowStateRepo.upsert({
        igUserId,
        commentId,
        reelId,
        stage: 'COMPLETED',
      });
    }

    await logsRepo.add({
      commentId,
      igUserId: igUserId ?? null,
      reelId: reelId ?? null,
      action: 'DETAILS_SENT',
      status: 'success',
      message: `manual dm=${messageId} reply=${replyId}`,
    });

    res.json({ commentId, messageId, replyId, dmMessage, replyMessage });
  }),
);
