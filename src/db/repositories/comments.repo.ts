import { collections } from '../index';

/**
 * Idempotency store: tracks comment IDs we've already acted on so a webhook
 * re-delivery (Meta retries) never triggers a duplicate reply. Comment ids are
 * globally unique across Instagram; `ownerId` is recorded for tenant cleanup.
 */
export const commentsRepo = {
  async isProcessed(commentId: string): Promise<boolean> {
    const doc = await collections
      .processedComments()
      .findOne({ _id: commentId }, { projection: { _id: 1 } });
    return doc !== null;
  },

  /** Returns true if this call inserted the row (i.e. it was NOT processed before). */
  async markProcessed(ownerId: string, commentId: string): Promise<boolean> {
    const res = await collections.processedComments().updateOne(
      { _id: commentId },
      {
        $setOnInsert: {
          _id: commentId,
          ownerId,
          processedAt: new Date().toISOString(),
        },
      },
      { upsert: true },
    );
    return res.upsertedCount === 1;
  },
};
