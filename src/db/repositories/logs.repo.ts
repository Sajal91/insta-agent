import { collections } from '../index';
import type { ActionType, LogDoc, LogEntry, LogStatus } from '../types';
import type { WithId } from 'mongodb';

function mapDoc(doc: WithId<LogDoc>): LogEntry {
  return {
    id: doc._id.toString(),
    commentId: doc.commentId,
    igUserId: doc.igUserId,
    reelId: doc.reelId,
    action: doc.action,
    status: doc.status,
    message: doc.message,
    createdAt: doc.createdAt,
  };
}

export interface LogInput {
  ownerId: string;
  commentId?: string | null;
  igUserId?: string | null;
  reelId?: string | null;
  action: ActionType;
  status: LogStatus;
  message?: string | null;
}

export const logsRepo = {
  async add(input: LogInput): Promise<void> {
    const doc: LogDoc = {
      ownerId: input.ownerId,
      commentId: input.commentId ?? null,
      igUserId: input.igUserId ?? null,
      reelId: input.reelId ?? null,
      action: input.action,
      status: input.status,
      message: input.message ?? null,
      createdAt: new Date().toISOString(),
    };
    await collections.logs().insertOne(doc);
  },

  async list(params: {
    ownerId: string;
    limit: number;
    offset: number;
  }): Promise<{ items: LogEntry[]; total: number }> {
    const coll = collections.logs();
    const filter = { ownerId: params.ownerId };
    const total = await coll.countDocuments(filter);
    const docs = await coll
      .find(filter)
      .sort({ _id: -1 })
      .skip(params.offset)
      .limit(params.limit)
      .toArray();
    return { items: docs.map(mapDoc), total };
  },
};
