import { config } from '../config/env';
import { logger } from '../utils/logger';
import { matchesConfirmation } from '../utils/keyword';
import { render } from './template.service';
import { commentsRepo } from '../db/repositories/comments.repo';
import { flowStateRepo } from '../db/repositories/flow-state.repo';
import { reelsRepo } from '../db/repositories/reels.repo';
import { templatesRepo } from '../db/repositories/templates.repo';
import { logsRepo } from '../db/repositories/logs.repo';
import { instagramService } from './instagram.service';
import type { ActionType } from '../db/types';

/**
 * A normalized comment event. The webhook route maps Meta's raw payload into
 * this shape so the engine never has to know about Meta's envelope format.
 */
export interface CommentEvent {
  commentId: string;
  text: string;
  fromId: string;
  fromUsername?: string;
  mediaId: string;
  /** Present when this comment is a reply to another comment. */
  parentId?: string;
}

export interface FlowResult {
  action: ActionType;
  detail?: string;
}

/**
 * Dependencies the engine needs. Defaulted to the real implementations, but
 * injectable so unit tests can supply fakes (no DB / no network required).
 */
export interface FlowDeps {
  reels: Pick<typeof reelsRepo, 'get'>;
  flows: Pick<
    typeof flowStateRepo,
    'findOpenByUserAndReel' | 'upsert' | 'updateStage'
  >;
  comments: Pick<typeof commentsRepo, 'isProcessed' | 'markProcessed'>;
  templates: Pick<typeof templatesRepo, 'get'>;
  logs: Pick<typeof logsRepo, 'add'>;
  ig: Pick<typeof instagramService, 'replyToComment'>;
  ownAccountId: string;
  defaultKeyword: string;
  sendNudgeOnMismatch: boolean;
}

function defaultDeps(): FlowDeps {
  return {
    reels: reelsRepo,
    flows: flowStateRepo,
    comments: commentsRepo,
    templates: templatesRepo,
    logs: logsRepo,
    ig: instagramService,
    ownAccountId: config.IG_BUSINESS_ACCOUNT_ID,
    defaultKeyword: config.DEFAULT_CONFIRMATION_KEYWORD,
    sendNudgeOnMismatch: config.SEND_NUDGE_ON_MISMATCH,
  };
}

/** Resolve the confirmation keyword for a reel (override -> global default). */
async function resolveKeyword(deps: FlowDeps, reelId: string): Promise<string> {
  const reel = await deps.reels.get(reelId);
  if (reel?.confirmationKeyword && reel.confirmationKeyword.trim()) {
    return reel.confirmationKeyword.trim();
  }
  const stored = await deps.templates.get('DEFAULT_CONFIRMATION_KEYWORD');
  return (stored && stored.trim()) || deps.defaultKeyword;
}

/** Resolve a template value, preferring a per-reel override. */
async function resolveTemplate(
  deps: FlowDeps,
  reelId: string,
  which: 'step1' | 'step2' | 'nudge',
): Promise<string> {
  const reel = await deps.reels.get(reelId);
  const override =
    which === 'step1'
      ? reel?.step1Template
      : which === 'step2'
        ? reel?.step2Template
        : reel?.nudgeTemplate;
  if (override && override.trim()) return override;

  const key =
    which === 'step1'
      ? 'STEP_1_TEMPLATE'
      : which === 'step2'
        ? 'STEP_2_TEMPLATE'
        : 'NUDGE_TEMPLATE';
  return (await deps.templates.get(key)) ?? '';
}

async function resolveDetailedContent(
  deps: FlowDeps,
  reelId: string,
): Promise<string> {
  const reel = await deps.reels.get(reelId);
  if (reel?.detailedMessageContent && reel.detailedMessageContent.trim()) {
    return reel.detailedMessageContent;
  }
  return (await deps.templates.get('DETAILED_MESSAGE_CONTENT')) ?? '';
}

async function isBlocklisted(
  deps: FlowDeps,
  reelId: string,
  text: string,
): Promise<boolean> {
  const reel = await deps.reels.get(reelId);
  if (!reel || reel.blocklistKeywords.length === 0) return false;
  const lower = text.toLowerCase();
  return reel.blocklistKeywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Process a single normalized comment event through the two-step follow-gate.
 * Never throws for "business" outcomes — a failed reply is caught, logged as
 * ERRORED, and returned so the worker/process stays alive.
 */
export async function processCommentEvent(
  event: CommentEvent,
  overrideDeps?: Partial<FlowDeps>,
): Promise<FlowResult> {
  const deps: FlowDeps = { ...defaultDeps(), ...overrideDeps };
  const baseLog = {
    commentId: event.commentId,
    igUserId: event.fromId,
    reelId: event.mediaId,
  };

  // 1. Skip the bot's own comments (prevents replying to ourselves).
  if (event.fromId && event.fromId === deps.ownAccountId) {
    await deps.logs.add({
      ...baseLog,
      action: 'SKIPPED_OWN_COMMENT',
      status: 'skipped',
    });
    return { action: 'SKIPPED_OWN_COMMENT' };
  }

  // 2. Idempotency: never act on the same comment twice.
  if (await deps.comments.isProcessed(event.commentId)) {
    await deps.logs.add({
      ...baseLog,
      action: 'SKIPPED_ALREADY_PROCESSED',
      status: 'skipped',
    });
    return { action: 'SKIPPED_ALREADY_PROCESSED' };
  }

  try {
    const result = event.parentId
      ? await handleReply(deps, event, baseLog)
      : await handleFreshComment(deps, event, baseLog);

    // Mark processed only after a definitive (non-errored) outcome so transient
    // failures can be retried on webhook re-delivery.
    await deps.comments.markProcessed(event.commentId);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ ...baseLog, err: message }, 'Flow engine error');
    await deps.logs.add({
      ...baseLog,
      action: 'ERRORED',
      status: 'error',
      message,
    });
    return { action: 'ERRORED', detail: message };
  }
}

async function handleFreshComment(
  deps: FlowDeps,
  event: CommentEvent,
  baseLog: { commentId: string; igUserId: string; reelId: string },
): Promise<FlowResult> {
  // Per-reel enable/disable. Unknown reels default to enabled (opt-out model).
  const reel = await deps.reels.get(event.mediaId);
  if (reel && !reel.enabled) {
    await deps.logs.add({
      ...baseLog,
      action: 'SKIPPED_REEL_DISABLED',
      status: 'skipped',
    });
    return { action: 'SKIPPED_REEL_DISABLED' };
  }

  if (await isBlocklisted(deps, event.mediaId, event.text)) {
    await deps.logs.add({
      ...baseLog,
      action: 'SKIPPED_BLOCKLISTED',
      status: 'skipped',
    });
    return { action: 'SKIPPED_BLOCKLISTED' };
  }

  const keyword = await resolveKeyword(deps, event.mediaId);
  const template = await resolveTemplate(deps, event.mediaId, 'step1');
  const message = render(template, {
    pageHandle: config.IG_PAGE_HANDLE,
    confirmationKeyword: keyword,
    username: event.fromUsername,
  });

  const replyId = await deps.ig.replyToComment(event.commentId, message);

  // Store the flow state keyed by user+reel. commentId here is OUR reply id,
  // which becomes the parent of the thread the user will confirm in.
  await deps.flows.upsert({
    igUserId: event.fromId,
    commentId: replyId,
    reelId: event.mediaId,
    stage: 'AWAITING_FOLLOW_CONFIRMATION',
  });

  await deps.logs.add({
    ...baseLog,
    action: 'STEP_1_REPLIED',
    status: 'success',
    message: `reply_id=${replyId}`,
  });
  return { action: 'STEP_1_REPLIED', detail: replyId };
}

async function handleReply(
  deps: FlowDeps,
  event: CommentEvent,
  baseLog: { commentId: string; igUserId: string; reelId: string },
): Promise<FlowResult> {
  const open = await deps.flows.findOpenByUserAndReel(event.fromId, event.mediaId);
  if (!open) {
    await deps.logs.add({
      ...baseLog,
      action: 'SKIPPED_NO_OPEN_STATE',
      status: 'skipped',
    });
    return { action: 'SKIPPED_NO_OPEN_STATE' };
  }

  const keyword = await resolveKeyword(deps, event.mediaId);

  if (matchesConfirmation(event.text, keyword)) {
    const detailed = await resolveDetailedContent(deps, event.mediaId);
    const template = await resolveTemplate(deps, event.mediaId, 'step2');
    const message = render(template, {
      pageHandle: config.IG_PAGE_HANDLE,
      confirmationKeyword: keyword,
      detailedMessageContent: detailed,
      username: event.fromUsername,
    });

    const replyId = await deps.ig.replyToComment(event.commentId, message);
    await deps.flows.updateStage(event.fromId, event.mediaId, 'COMPLETED');

    await deps.logs.add({
      ...baseLog,
      action: 'STEP_2_REPLIED',
      status: 'success',
      message: `reply_id=${replyId}`,
    });
    return { action: 'STEP_2_REPLIED', detail: replyId };
  }

  // Not a valid confirmation.
  if (!deps.sendNudgeOnMismatch) {
    await deps.logs.add({
      ...baseLog,
      action: 'IGNORED_MISMATCH',
      status: 'skipped',
    });
    return { action: 'IGNORED_MISMATCH' };
  }

  const template = await resolveTemplate(deps, event.mediaId, 'nudge');
  const message = render(template, {
    pageHandle: config.IG_PAGE_HANDLE,
    confirmationKeyword: keyword,
    username: event.fromUsername,
  });
  const replyId = await deps.ig.replyToComment(event.commentId, message);

  await deps.logs.add({
    ...baseLog,
    action: 'NUDGE_SENT',
    status: 'success',
    message: `reply_id=${replyId}`,
  });
  return { action: 'NUDGE_SENT', detail: replyId };
}
