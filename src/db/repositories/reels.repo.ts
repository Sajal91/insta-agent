import { collections } from '../index';
import type { MessageLink, ReelConfig, ReelConfigDoc } from '../types';

function mapDoc(doc: ReelConfigDoc): ReelConfig {
  return {
    reelId: doc._id,
    enabled: doc.enabled,
    triggerKeywords: doc.triggerKeywords ?? [],
    dmTemplate: doc.dmTemplate,
    commentReplyTemplate: doc.commentReplyTemplate,
    blocklistKeywords: doc.blocklistKeywords ?? [],
    detailedMessageContent: doc.detailedMessageContent,
    links: doc.links ?? [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export interface ReelConfigInput {
  reelId: string;
  enabled?: boolean;
  triggerKeywords?: string[] | null;
  dmTemplate?: string | null;
  commentReplyTemplate?: string | null;
  blocklistKeywords?: string[] | null;
  detailedMessageContent?: string | null;
  links?: MessageLink[] | null;
}

/**
 * Per-reel overrides, scoped to a tenant (ownerId). Media (reel) ids are
 * globally unique across Instagram, so the document _id stays the reel id while
 * every read/write is additionally constrained to the owner for isolation.
 */
export const reelsRepo = {
  async get(ownerId: string, reelId: string): Promise<ReelConfig | null> {
    const doc = await collections
      .reelConfigs()
      .findOne({ _id: reelId, ownerId });
    return doc ? mapDoc(doc) : null;
  },

  async list(ownerId: string): Promise<ReelConfig[]> {
    const docs = await collections
      .reelConfigs()
      .find({ ownerId })
      .sort({ updatedAt: -1 })
      .toArray();
    return docs.map(mapDoc);
  },

  async upsert(ownerId: string, input: ReelConfigInput): Promise<ReelConfig> {
    const existing = await this.get(ownerId, input.reelId);
    const now = new Date().toISOString();

    const enabled = input.enabled ?? existing?.enabled ?? true;
    const blocklist =
      input.blocklistKeywords === undefined
        ? existing?.blocklistKeywords ?? []
        : input.blocklistKeywords ?? [];
    const triggers =
      input.triggerKeywords === undefined
        ? existing?.triggerKeywords ?? []
        : input.triggerKeywords ?? [];
    const links =
      input.links === undefined ? existing?.links ?? [] : input.links ?? [];

    const doc: ReelConfigDoc = {
      _id: input.reelId,
      ownerId,
      enabled,
      triggerKeywords: triggers,
      dmTemplate: input.dmTemplate ?? existing?.dmTemplate ?? null,
      commentReplyTemplate:
        input.commentReplyTemplate ?? existing?.commentReplyTemplate ?? null,
      blocklistKeywords: blocklist,
      detailedMessageContent:
        input.detailedMessageContent ??
        existing?.detailedMessageContent ??
        null,
      links,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await collections
      .reelConfigs()
      .updateOne({ _id: input.reelId }, { $set: doc }, { upsert: true });
    return mapDoc(doc);
  },

  async delete(ownerId: string, reelId: string): Promise<boolean> {
    const res = await collections
      .reelConfigs()
      .deleteOne({ _id: reelId, ownerId });
    return res.deletedCount > 0;
  },
};
