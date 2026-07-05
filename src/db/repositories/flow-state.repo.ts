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
 * Per-user delivery record. Keyed by (igUserId, reelId) with a unique index, so
 * we keep one row per user+reel recording that details were delivered.
 */
export const flowStateRepo = {
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
};
