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
 * Per-commenter delivery record, scoped to a tenant. Keyed by
 * (ownerId, igUserId, reelId) with a unique index.
 */
export const flowStateRepo = {
  async listByUser(ownerId: string, igUserId: string): Promise<FlowState[]> {
    const docs = await collections
      .flowStates()
      .find({ ownerId, igUserId })
      .sort({ updatedAt: -1 })
      .toArray();
    return docs.map(mapDoc);
  },

  async upsert(params: {
    ownerId: string;
    igUserId: string;
    commentId: string;
    reelId: string;
    stage: FlowStage;
  }): Promise<void> {
    const now = new Date().toISOString();
    await collections.flowStates().updateOne(
      {
        ownerId: params.ownerId,
        igUserId: params.igUserId,
        reelId: params.reelId,
      },
      {
        $set: {
          commentId: params.commentId,
          stage: params.stage,
          updatedAt: now,
        },
        $setOnInsert: {
          ownerId: params.ownerId,
          igUserId: params.igUserId,
          reelId: params.reelId,
          createdAt: now,
        },
      },
      { upsert: true },
    );
  },
};
