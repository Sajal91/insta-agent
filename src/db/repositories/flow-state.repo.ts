import { collections } from '../index';
import type { FlowStage, FlowState, FlowStateDoc } from '../types';

function mapDoc(doc: FlowStateDoc): FlowState {
  return {
    igUserId: doc.igUserId,
    commentId: doc.commentId,
    reelId: doc.reelId,
    stage: doc.stage,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Per-user flow state. Keyed by (igUserId, reelId): a user can be mid-flow on
 * multiple different Reels at once, but only one open state per Reel (enforced
 * by a unique index).
 */
export const flowStateRepo = {
  async findOpenByUserAndReel(
    igUserId: string,
    reelId: string,
  ): Promise<FlowState | null> {
    const doc = await collections.flowStates().findOne({
      igUserId,
      reelId,
      stage: 'AWAITING_FOLLOW_CONFIRMATION',
    });
    return doc ? mapDoc(doc) : null;
  },

  async listByUser(igUserId: string): Promise<FlowState[]> {
    const docs = await collections
      .flowStates()
      .find({ igUserId })
      .sort({ updatedAt: -1 })
      .toArray();
    return docs.map(mapDoc);
  },

  async upsert(params: {
    igUserId: string;
    commentId: string;
    reelId: string;
    stage: FlowStage;
  }): Promise<void> {
    const now = new Date().toISOString();
    await collections.flowStates().updateOne(
      { igUserId: params.igUserId, reelId: params.reelId },
      {
        $set: {
          commentId: params.commentId,
          stage: params.stage,
          updatedAt: now,
        },
        $setOnInsert: {
          igUserId: params.igUserId,
          reelId: params.reelId,
          createdAt: now,
        },
      },
      { upsert: true },
    );
  },

  async updateStage(
    igUserId: string,
    reelId: string,
    stage: FlowStage,
  ): Promise<void> {
    await collections
      .flowStates()
      .updateOne(
        { igUserId, reelId },
        { $set: { stage, updatedAt: new Date().toISOString() } },
      );
  },
};
