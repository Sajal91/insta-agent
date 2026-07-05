import { collections } from '../index';
import type { ReelConfig, ReelConfigDoc } from '../types';

function mapDoc(doc: ReelConfigDoc): ReelConfig {
  return {
    reelId: doc._id,
    enabled: doc.enabled,
    confirmationKeyword: doc.confirmationKeyword,
    step1Template: doc.step1Template,
    step2Template: doc.step2Template,
    nudgeTemplate: doc.nudgeTemplate,
    blocklistKeywords: doc.blocklistKeywords ?? [],
    detailedMessageContent: doc.detailedMessageContent,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export interface ReelConfigInput {
  reelId: string;
  enabled?: boolean;
  confirmationKeyword?: string | null;
  step1Template?: string | null;
  step2Template?: string | null;
  nudgeTemplate?: string | null;
  blocklistKeywords?: string[] | null;
  detailedMessageContent?: string | null;
}

/** Per-Reel overrides: enable/disable, keyword override, template overrides. */
export const reelsRepo = {
  async get(reelId: string): Promise<ReelConfig | null> {
    const doc = await collections.reelConfigs().findOne({ _id: reelId });
    return doc ? mapDoc(doc) : null;
  },

  async list(): Promise<ReelConfig[]> {
    const docs = await collections
      .reelConfigs()
      .find()
      .sort({ updatedAt: -1 })
      .toArray();
    return docs.map(mapDoc);
  },

  async upsert(input: ReelConfigInput): Promise<ReelConfig> {
    const existing = await this.get(input.reelId);
    const now = new Date().toISOString();

    const enabled = input.enabled ?? existing?.enabled ?? true;
    const blocklist =
      input.blocklistKeywords === undefined
        ? existing?.blocklistKeywords ?? []
        : input.blocklistKeywords ?? [];

    const doc: ReelConfigDoc = {
      _id: input.reelId,
      enabled,
      confirmationKeyword:
        input.confirmationKeyword ?? existing?.confirmationKeyword ?? null,
      step1Template: input.step1Template ?? existing?.step1Template ?? null,
      step2Template: input.step2Template ?? existing?.step2Template ?? null,
      nudgeTemplate: input.nudgeTemplate ?? existing?.nudgeTemplate ?? null,
      blocklistKeywords: blocklist,
      detailedMessageContent:
        input.detailedMessageContent ??
        existing?.detailedMessageContent ??
        null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await collections.reelConfigs().updateOne(
      { _id: input.reelId },
      { $set: doc },
      { upsert: true },
    );
    return mapDoc(doc);
  },

  async delete(reelId: string): Promise<boolean> {
    const res = await collections.reelConfigs().deleteOne({ _id: reelId });
    return res.deletedCount > 0;
  },
};
