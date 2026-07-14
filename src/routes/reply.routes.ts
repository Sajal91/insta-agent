import { Router } from 'express';
import { z } from 'zod';
import { requireApproved } from '../middleware/auth';
import { asyncHandler, formatZodError } from '../utils/http';
import { createInstagramClient } from '../services/instagram.service';
import { resolveCredentials } from '../services/credentials.service';
import { render } from '../services/template.service';
import { reelsRepo } from '../db/repositories/reels.repo';
import { templatesRepo } from '../db/repositories/templates.repo';
import { flowStateRepo } from '../db/repositories/flow-state.repo';
import { logsRepo } from '../db/repositories/logs.repo';

export const replyRouter = Router();
replyRouter.use(requireApproved);

const manualSchema = z.object({
  commentId: z.string().min(1),
  // Optional context; if omitted we try to fetch it from the Graph API.
  reelId: z.string().min(1).optional(),
  igUserId: z.string().min(1).optional(),
  dryRun: z.boolean().optional().default(false),
});

async function resolveTemplate(
  ownerId: string,
  reelId: string | undefined,
  which: 'dm' | 'commentReply',
): Promise<string> {
  const reel = reelId ? await reelsRepo.get(ownerId, reelId) : null;
  const override = which === 'dm' ? reel?.dmTemplate : reel?.commentReplyTemplate;
  if (override?.trim()) return override;
  return (
    (await templatesRepo.get(
      ownerId,
      which === 'dm' ? 'DM_TEMPLATE' : 'COMMENT_REPLY_TEMPLATE',
    )) ?? ''
  );
}

async function resolveDetailed(
  ownerId: string,
  reelId: string | undefined,
): Promise<string> {
  const reel = reelId ? await reelsRepo.get(ownerId, reelId) : null;
  if (reel?.detailedMessageContent?.trim()) return reel.detailedMessageContent;
  return (await templatesRepo.get(ownerId, 'DETAILED_MESSAGE_CONTENT')) ?? '';
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
    const ownerId = req.user!._id.toString();
    const creds = resolveCredentials(req.user!);
    if (!creds) {
      res.status(409).json({
        error:
          'No Instagram credentials configured for your account yet. Please contact the admin.',
      });
      return;
    }
    const ig = createInstagramClient(creds);

    const { commentId, dryRun } = parsed.data;
    let { reelId, igUserId } = parsed.data;

    // Fill missing context from the Graph API (best-effort).
    if (!reelId || !igUserId) {
      try {
        const comment = await ig.getComment(commentId);
        reelId = reelId ?? comment.media?.id;
        igUserId = igUserId ?? comment.from?.id;
      } catch {
        // Non-fatal: caller can still pass reelId/igUserId explicitly.
      }
    }

    const dmMessage = render(await resolveTemplate(ownerId, reelId, 'dm'), {
      pageHandle: creds.pageHandle,
      detailedMessageContent: await resolveDetailed(ownerId, reelId),
    });
    const replyMessage = render(
      await resolveTemplate(ownerId, reelId, 'commentReply'),
      { pageHandle: creds.pageHandle },
    );

    if (dryRun) {
      res.json({ dryRun: true, commentId, dmMessage, replyMessage });
      return;
    }

    const messageId = await ig.sendPrivateReply(commentId, dmMessage);
    const replyId = await ig.replyToComment(commentId, replyMessage);

    if (igUserId && reelId) {
      await flowStateRepo.upsert({
        ownerId,
        igUserId,
        commentId,
        reelId,
        stage: 'COMPLETED',
      });
    }

    await logsRepo.add({
      ownerId,
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
