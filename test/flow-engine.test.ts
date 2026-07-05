import { describe, it, expect, vi } from 'vitest';
import {
  processCommentEvent,
  type CommentEvent,
  type FlowDeps,
} from '../src/services/flow-engine.service';
import type { ActionType, ReelConfig } from '../src/db/types';

/**
 * In-memory fakes for FlowDeps. No DB, no network — we assert on the returned
 * action and on the recorded DM/reply/log calls.
 */
function makeDeps(overrides?: {
  reelConfig?: Partial<ReelConfig> | null;
  processed?: Set<string>;
  dmImpl?: (commentId: string, message: string) => Promise<string>;
  replyImpl?: (commentId: string, message: string) => Promise<string>;
}): {
  deps: FlowDeps;
  dms: { commentId: string; message: string }[];
  replies: { commentId: string; message: string }[];
  logs: { action: ActionType }[];
  upserts: { igUserId: string; reelId: string }[];
} {
  const dms: { commentId: string; message: string }[] = [];
  const replies: { commentId: string; message: string }[] = [];
  const logs: { action: ActionType }[] = [];
  const upserts: { igUserId: string; reelId: string }[] = [];
  const processed = overrides?.processed ?? new Set<string>();

  const reel: ReelConfig | null =
    overrides?.reelConfig == null
      ? null
      : {
          reelId: 'reel-1',
          enabled: true,
          dmTemplate: null,
          commentReplyTemplate: null,
          blocklistKeywords: [],
          detailedMessageContent: null,
          createdAt: '',
          updatedAt: '',
          ...overrides.reelConfig,
        };

  const deps: FlowDeps = {
    reels: { get: async () => reel },
    flows: {
      upsert: async (p) => {
        upserts.push({ igUserId: p.igUserId, reelId: p.reelId });
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
          DM_TEMPLATE: 'Here are the details: {{detailedMessageContent}}',
          COMMENT_REPLY_TEMPLATE: 'Sent to your DM 📩',
          DETAILED_MESSAGE_CONTENT: 'https://example.com/offer',
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
      sendPrivateReply:
        overrides?.dmImpl ??
        (async (commentId, message) => {
          dms.push({ commentId, message });
          return `dm-${commentId}`;
        }),
      replyToComment:
        overrides?.replyImpl ??
        (async (commentId, message) => {
          replies.push({ commentId, message });
          return `reply-${commentId}`;
        }),
    },
    ownAccountId: 'bot-account-id',
  };

  return { deps, dms, replies, logs, upserts };
}

function freshComment(overrides?: Partial<CommentEvent>): CommentEvent {
  return {
    commentId: 'c1',
    text: 'How do I get this?',
    fromId: 'user-1',
    fromUsername: 'someuser',
    mediaId: 'reel-1',
    ...overrides,
  };
}

describe('flow-engine: fresh comment -> DM + public reply', () => {
  it('DMs the details and posts the "sent to your DM" reply', async () => {
    const { deps, dms, replies, upserts } = makeDeps();
    const result = await processCommentEvent(freshComment(), deps);

    expect(result.action).toBe('DETAILS_SENT');
    expect(dms).toHaveLength(1);
    expect(dms[0].commentId).toBe('c1');
    expect(dms[0].message).toContain('https://example.com/offer');
    expect(replies).toHaveLength(1);
    expect(replies[0].commentId).toBe('c1');
    expect(replies[0].message).toContain('DM');
    expect(upserts).toEqual([{ igUserId: 'user-1', reelId: 'reel-1' }]);
  });

  it('uses a per-reel DM + detailed content override', async () => {
    const { deps, dms } = makeDeps({
      reelConfig: {
        dmTemplate: 'Custom DM: {{detailedMessageContent}}',
        detailedMessageContent: 'https://site.com/special',
      },
    });
    await processCommentEvent(freshComment(), deps);
    expect(dms[0].message).toBe('Custom DM: https://site.com/special');
  });

  it('does NOT post the public reply if the DM fails', async () => {
    const { deps, replies, logs } = makeDeps({
      dmImpl: vi.fn(async () => {
        throw new Error('missing instagram_business_manage_messages');
      }),
    });
    const result = await processCommentEvent(freshComment(), deps);
    expect(result.action).toBe('ERRORED');
    expect(replies).toHaveLength(0);
    expect(logs.some((l) => l.action === 'ERRORED')).toBe(true);
  });
});

describe('flow-engine: skip cases', () => {
  it('skips the bot own comment', async () => {
    const { deps, dms } = makeDeps();
    const result = await processCommentEvent(
      freshComment({ fromId: 'bot-account-id' }),
      deps,
    );
    expect(result.action).toBe('SKIPPED_OWN_COMMENT');
    expect(dms).toHaveLength(0);
  });

  it('skips already-processed comments (idempotency)', async () => {
    const { deps, dms } = makeDeps({ processed: new Set(['c1']) });
    const result = await processCommentEvent(freshComment(), deps);
    expect(result.action).toBe('SKIPPED_ALREADY_PROCESSED');
    expect(dms).toHaveLength(0);
  });

  it('ignores replies (only acts on top-level comments)', async () => {
    const { deps, dms, replies } = makeDeps();
    const result = await processCommentEvent(
      freshComment({ commentId: 'c2', parentId: 'c1' }),
      deps,
    );
    expect(result.action).toBe('SKIPPED_REPLY');
    expect(dms).toHaveLength(0);
    expect(replies).toHaveLength(0);
  });

  it('skips when the reel is explicitly disabled', async () => {
    const { deps, dms } = makeDeps({ reelConfig: { enabled: false } });
    const result = await processCommentEvent(freshComment(), deps);
    expect(result.action).toBe('SKIPPED_REEL_DISABLED');
    expect(dms).toHaveLength(0);
  });

  it('skips blocklisted comments', async () => {
    const { deps, dms } = makeDeps({
      reelConfig: { blocklistKeywords: ['spam', 'scam'] },
    });
    const result = await processCommentEvent(
      freshComment({ text: 'this is a SPAM link' }),
      deps,
    );
    expect(result.action).toBe('SKIPPED_BLOCKLISTED');
    expect(dms).toHaveLength(0);
  });
});
