import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  processCommentEvent,
  type CommentEvent,
  type FlowDeps,
} from '../src/services/flow-engine.service';
import type { ActionType, FlowStage, ReelConfig } from '../src/db/types';

/**
 * In-memory fakes for FlowDeps. No DB, no network — we assert on the returned
 * action and on the recorded reply/log/state calls.
 */
function makeDeps(overrides?: {
  reelConfig?: Partial<ReelConfig> | null;
  openState?: { commentId: string } | null;
  processed?: Set<string>;
  sendNudgeOnMismatch?: boolean;
  replyImpl?: (commentId: string, message: string) => Promise<string>;
}): {
  deps: FlowDeps;
  replies: { commentId: string; message: string }[];
  logs: { action: ActionType }[];
  upserts: { igUserId: string; reelId: string; stage: FlowStage; commentId: string }[];
  stageUpdates: { igUserId: string; reelId: string; stage: FlowStage }[];
} {
  const replies: { commentId: string; message: string }[] = [];
  const logs: { action: ActionType }[] = [];
  const upserts: { igUserId: string; reelId: string; stage: FlowStage; commentId: string }[] = [];
  const stageUpdates: { igUserId: string; reelId: string; stage: FlowStage }[] = [];
  const processed = overrides?.processed ?? new Set<string>();

  const reel: ReelConfig | null =
    overrides?.reelConfig === undefined
      ? null
      : overrides.reelConfig === null
        ? null
        : {
            reelId: 'reel-1',
            enabled: true,
            confirmationKeyword: null,
            step1Template: null,
            step2Template: null,
            nudgeTemplate: null,
            blocklistKeywords: [],
            detailedMessageContent: null,
            createdAt: '',
            updatedAt: '',
            ...overrides.reelConfig,
          };

  const deps: FlowDeps = {
    reels: { get: async () => reel },
    flows: {
      findOpenByUserAndReel: async () =>
        overrides?.openState
          ? {
              igUserId: 'user-1',
              commentId: overrides.openState.commentId,
              reelId: 'reel-1',
              stage: 'AWAITING_FOLLOW_CONFIRMATION',
              createdAt: '',
              updatedAt: '',
            }
          : null,
      upsert: async (p) => {
        upserts.push(p);
      },
      updateStage: async (igUserId, reelId, stage) => {
        stageUpdates.push({ igUserId, reelId, stage });
      },
    },
    comments: {
      isProcessed: async (id) => processed.has(id),
      markProcessed: async (id) => {
        const had = processed.has(id);
        processed.add(id);
        return !had;
      },
    },
    templates: {
      get: async (key) => {
        const map: Record<string, string> = {
          STEP_1_TEMPLATE: "Follow @{{pageHandle}} and reply '{{confirmationKeyword}}'",
          STEP_2_TEMPLATE: 'Thanks! Here: {{detailedMessageContent}}',
          NUDGE_TEMPLATE: "Just reply '{{confirmationKeyword}}'!",
          DETAILED_MESSAGE_CONTENT: 'https://example.com/offer',
          DEFAULT_CONFIRMATION_KEYWORD: 'DONE',
        };
        return map[key] ?? null;
      },
    },
    logs: {
      add: async (entry) => {
        logs.push({ action: entry.action });
      },
    },
    ig: {
      replyToComment:
        overrides?.replyImpl ??
        (async (commentId, message) => {
          replies.push({ commentId, message });
          return `reply-to-${commentId}`;
        }),
    },
    ownAccountId: 'bot-account-id',
    defaultKeyword: 'DONE',
    sendNudgeOnMismatch: overrides?.sendNudgeOnMismatch ?? true,
  };

  return { deps, replies, logs, upserts, stageUpdates };
}

function freshComment(overrides?: Partial<CommentEvent>): CommentEvent {
  return {
    commentId: 'c1',
    text: 'Love this!',
    fromId: 'user-1',
    fromUsername: 'someuser',
    mediaId: 'reel-1',
    ...overrides,
  };
}

function replyComment(text: string, overrides?: Partial<CommentEvent>): CommentEvent {
  return {
    commentId: 'c2',
    text,
    fromId: 'user-1',
    fromUsername: 'someuser',
    mediaId: 'reel-1',
    parentId: 'reply-to-c1',
    ...overrides,
  };
}

describe('flow-engine: fresh comment', () => {
  it('replies with Step 1 and stores AWAITING state', async () => {
    const { deps, replies, upserts } = makeDeps();
    const result = await processCommentEvent(freshComment(), deps);

    expect(result.action).toBe('STEP_1_REPLIED');
    expect(replies).toHaveLength(1);
    expect(replies[0].commentId).toBe('c1');
    expect(replies[0].message).toContain('@testpage');
    expect(replies[0].message).toContain('DONE');
    expect(upserts).toHaveLength(1);
    expect(upserts[0].stage).toBe('AWAITING_FOLLOW_CONFIRMATION');
    expect(upserts[0].commentId).toBe('reply-to-c1');
  });

  it('skips the bot own comment', async () => {
    const { deps, replies } = makeDeps();
    const result = await processCommentEvent(
      freshComment({ fromId: 'bot-account-id' }),
      deps,
    );
    expect(result.action).toBe('SKIPPED_OWN_COMMENT');
    expect(replies).toHaveLength(0);
  });

  it('skips already-processed comments (idempotency)', async () => {
    const { deps, replies } = makeDeps({ processed: new Set(['c1']) });
    const result = await processCommentEvent(freshComment(), deps);
    expect(result.action).toBe('SKIPPED_ALREADY_PROCESSED');
    expect(replies).toHaveLength(0);
  });

  it('skips when the reel is explicitly disabled', async () => {
    const { deps, replies } = makeDeps({ reelConfig: { enabled: false } });
    const result = await processCommentEvent(freshComment(), deps);
    expect(result.action).toBe('SKIPPED_REEL_DISABLED');
    expect(replies).toHaveLength(0);
  });

  it('skips blocklisted comments', async () => {
    const { deps, replies } = makeDeps({
      reelConfig: { blocklistKeywords: ['spam', 'scam'] },
    });
    const result = await processCommentEvent(
      freshComment({ text: 'this is a SPAM link' }),
      deps,
    );
    expect(result.action).toBe('SKIPPED_BLOCKLISTED');
    expect(replies).toHaveLength(0);
  });

  it('uses a per-reel confirmation keyword override in Step 1', async () => {
    const { deps, replies } = makeDeps({
      reelConfig: { confirmationKeyword: 'YESSIR' },
    });
    await processCommentEvent(freshComment(), deps);
    expect(replies[0].message).toContain('YESSIR');
  });
});

describe('flow-engine: confirmation reply', () => {
  it('replies with Step 2 on a valid confirmation and completes the flow', async () => {
    const { deps, replies, stageUpdates } = makeDeps({
      openState: { commentId: 'reply-to-c1' },
    });
    const result = await processCommentEvent(replyComment('DONE'), deps);

    expect(result.action).toBe('STEP_2_REPLIED');
    expect(replies).toHaveLength(1);
    expect(replies[0].message).toContain('https://example.com/offer');
    expect(stageUpdates).toEqual([
      { igUserId: 'user-1', reelId: 'reel-1', stage: 'COMPLETED' },
    ]);
  });

  it.each(['done', ' Done! ', 'FOLLOWED ✅', 'ok done', '✅', 'yep', 'followed you'])(
    'accepts lenient confirmation variant: %s',
    async (text) => {
      const { deps } = makeDeps({ openState: { commentId: 'reply-to-c1' } });
      const result = await processCommentEvent(replyComment(text), deps);
      expect(result.action).toBe('STEP_2_REPLIED');
    },
  );

  it('sends a nudge on mismatch when configured', async () => {
    const { deps, replies } = makeDeps({
      openState: { commentId: 'reply-to-c1' },
      sendNudgeOnMismatch: true,
    });
    const result = await processCommentEvent(
      replyComment('what is this about?'),
      deps,
    );
    expect(result.action).toBe('NUDGE_SENT');
    expect(replies[0].message).toContain('DONE');
  });

  it('ignores mismatch when nudge disabled', async () => {
    const { deps, replies } = makeDeps({
      openState: { commentId: 'reply-to-c1' },
      sendNudgeOnMismatch: false,
    });
    const result = await processCommentEvent(
      replyComment('random text here'),
      deps,
    );
    expect(result.action).toBe('IGNORED_MISMATCH');
    expect(replies).toHaveLength(0);
  });

  it('ignores replies with no open flow state', async () => {
    const { deps, replies } = makeDeps({ openState: null });
    const result = await processCommentEvent(replyComment('DONE'), deps);
    expect(result.action).toBe('SKIPPED_NO_OPEN_STATE');
    expect(replies).toHaveLength(0);
  });
});

describe('flow-engine: error handling', () => {
  it('logs ERRORED and does not throw when the Graph API fails', async () => {
    const { deps, logs } = makeDeps({
      replyImpl: vi.fn(async () => {
        throw new Error('rate limited');
      }),
    });
    const result = await processCommentEvent(freshComment(), deps);
    expect(result.action).toBe('ERRORED');
    expect(logs.some((l) => l.action === 'ERRORED')).toBe(true);
  });
});
