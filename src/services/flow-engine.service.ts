import { config } from '../config/env';
import { logger } from '../utils/logger';
import { containsAnyKeyword, parseKeywordList } from '../utils/keyword';
import { render } from './template.service';
import { commentsRepo } from '../db/repositories/comments.repo';
import { flowStateRepo } from '../db/repositories/flow-state.repo';
import { reelsRepo } from '../db/repositories/reels.repo';
import { templatesRepo } from '../db/repositories/templates.repo';
import { logsRepo } from '../db/repositories/logs.repo';
import { instagramService } from './instagram.service';
import type { ActionType, MessageLink } from '../db/types';

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
  flows: Pick<typeof flowStateRepo, 'upsert'>;
  comments: Pick<typeof commentsRepo, 'isProcessed' | 'markProcessed'>;
  templates: Pick<typeof templatesRepo, 'get'>;
  logs: Pick<typeof logsRepo, 'add'>;
  ig: Pick<typeof instagramService, 'replyToComment' | 'sendPrivateReply'>;
  ownAccountId: string;
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
  };
}

/** Resolve a template value, preferring a per-reel override. */
async function resolveTemplate(
  deps: FlowDeps,
  reelId: string,
  which: 'dm' | 'commentReply',
): Promise<string> {
  const reel = await deps.reels.get(reelId);
  const override = which === 'dm' ? reel?.dmTemplate : reel?.commentReplyTemplate;
  if (override && override.trim()) return override;

  const key = which === 'dm' ? 'DM_TEMPLATE' : 'COMMENT_REPLY_TEMPLATE';
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

/**
 * CTA links configured for this reel, sent as DM buttons. Only well-formed
 * entries are kept, capped at Instagram's 3-button-per-message limit.
 */
async function resolveLinks(
  deps: FlowDeps,
  reelId: string,
): Promise<MessageLink[]> {
  const reel = await deps.reels.get(reelId);
  const links = reel?.links ?? [];
  return links
    .filter((l) => l.label?.trim() && l.url?.trim())
    .slice(0, 3);
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
 * Accepted trigger keywords for a reel: the per-reel list if set, else the
 * global DEFAULT_TRIGGER_KEYWORDS list. Empty result = no gate (accept all).
 */
async function resolveTriggerKeywords(
  deps: FlowDeps,
  reelId: string,
): Promise<string[]> {
  const reel = await deps.reels.get(reelId);
  if (reel && reel.triggerKeywords.length > 0) return reel.triggerKeywords;
  return parseKeywordList(await deps.templates.get('DEFAULT_TRIGGER_KEYWORDS'));
}

/**
 * Process a single normalized comment event.
 *
 * Flow (single step, no follow-gate):
 *   fresh top-level comment  ->  DM the details to the commenter, then post a
 *                                public "sent to your DM" comment reply.
 *
 * Never throws for "business" outcomes — a failed DM/reply is caught, logged as
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

  // 1. Skip the bot's own comments (e.g. our own "sent to your DM" reply).
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

  // 3. Only act on fresh top-level comments. Replies (including replies to our
  //    own comment) are ignored so we don't loop or double-send.
  if (event.parentId) {
    await deps.comments.markProcessed(event.commentId);
    await deps.logs.add({ ...baseLog, action: 'SKIPPED_REPLY', status: 'skipped' });
    return { action: 'SKIPPED_REPLY' };
  }

  try {
    const result = await handleFreshComment(deps, event, baseLog);
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

  if (!reel) {
    await deps.logs.add({
      ...baseLog,
      action: 'SKIPPED_NO_CONFIG',
      status: 'skipped',
    });
    return { action: 'SKIPPED_NO_CONFIG' };
  }

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

  // Keyword gate: if this post has accepted keywords, the comment must contain
  // one of them (case-insensitive) — otherwise no DM is triggered.
  const triggerKeywords = await resolveTriggerKeywords(deps, event.mediaId);
  if (!containsAnyKeyword(event.text, triggerKeywords)) {
    await deps.logs.add({
      ...baseLog,
      action: 'SKIPPED_NO_KEYWORD',
      status: 'skipped',
      message: `expected one of: ${triggerKeywords.join(', ')}`,
    });
    return { action: 'SKIPPED_NO_KEYWORD' };
  }

  // 1) DM the details to the commenter (private reply). If this fails (e.g.
  //    missing permission / outside the 7-day window), we throw and the public
  //    "sent to your DM" reply is NOT posted — avoids a misleading message.
  const detailed = await resolveDetailedContent(deps, event.mediaId);
  const dmTemplate = await resolveTemplate(deps, event.mediaId, 'dm');
  const dmMessage = render(dmTemplate, {
    pageHandle: config.IG_PAGE_HANDLE,
    detailedMessageContent: detailed,
    username: event.fromUsername ?? '',
  });
  // Any configured CTA links are attached as tappable buttons on the DM.
  const links = await resolveLinks(deps, event.mediaId);
  const messageId = await deps.ig.sendPrivateReply(
    event.commentId,
    dmMessage,
    links,
  );
  await deps.logs.add({
    ...baseLog,
    action: 'DM_SENT',
    status: 'success',
    message: `message_id=${messageId} buttons=${links.length}`,
  });

  // 2) Post the public comment reply pointing them to their DM.
  const replyTemplate = await resolveTemplate(deps, event.mediaId, 'commentReply');
  const replyMessage = render(replyTemplate, {
    pageHandle: config.IG_PAGE_HANDLE,
    username: event.fromUsername ?? '',
  });
  const replyId = await deps.ig.replyToComment(event.commentId, replyMessage);
  await deps.logs.add({
    ...baseLog,
    action: 'COMMENT_REPLIED',
    status: 'success',
    message: `reply_id=${replyId}`,
  });

  // 3) Record that this user was served (for /flows debugging / history).
  await deps.flows.upsert({
    igUserId: event.fromId,
    commentId: event.commentId,
    reelId: event.mediaId,
    stage: 'COMPLETED',
  });

  await deps.logs.add({
    ...baseLog,
    action: 'DETAILS_SENT',
    status: 'success',
    message: `dm=${messageId} reply=${replyId}`,
  });
  return { action: 'DETAILS_SENT', detail: `dm=${messageId} reply=${replyId}` };
}
