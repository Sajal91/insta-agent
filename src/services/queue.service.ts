import { logger } from '../utils/logger';
import {
  buildProductionDeps,
  processCommentEvent,
  type CommentEvent,
} from './flow-engine.service';
import type { IgCredentials } from '../db/types';

/**
 * A queued unit of work: the normalized comment plus the tenant (owner) it
 * belongs to and the resolved credentials to act with.
 */
export interface QueueItem {
  event: CommentEvent;
  ownerId: string;
  credentials: IgCredentials;
}

/**
 * Minimal in-memory FIFO queue + single-worker runner for v1.
 *
 * Why: the webhook route must return 200 to Meta immediately, so actual
 * processing (Graph API calls, DB writes) happens off the request path here.
 * Processing sequentially also naturally serialises Graph API writes, which
 * keeps us well under rate limits for a single account.
 *
 * UPGRADE PATH FOR SCALE: replace this with BullMQ + Redis. That gives you
 * durable jobs (survives restarts), retries/backoff with dead-letter queues,
 * concurrency control, and multiple worker processes. The public surface
 * (`enqueue`) is intentionally tiny so swapping the backend is low-risk.
 */
class CommentQueue {
  private queue: QueueItem[] = [];
  private processing = false;
  private draining: Promise<void> | null = null;

  enqueue(item: QueueItem): void {
    this.queue.push(item);
    logger.debug(
      {
        commentId: item.event.commentId,
        ownerId: item.ownerId,
        depth: this.queue.length,
      },
      'Enqueued comment event',
    );
    void this.kick();
  }

  get size(): number {
    return this.queue.length;
  }

  private kick(): Promise<void> {
    if (this.processing) return this.draining ?? Promise.resolve();
    this.processing = true;
    this.draining = this.drain().finally(() => {
      this.processing = false;
      this.draining = null;
    });
    return this.draining;
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;
      try {
        const deps = buildProductionDeps(item.ownerId, item.credentials);
        const result = await processCommentEvent(item.event, deps);
        logger.info(
          {
            commentId: item.event.commentId,
            ownerId: item.ownerId,
            action: result.action,
          },
          'Processed comment event',
        );
      } catch (err) {
        // processCommentEvent already handles its own errors, but this is a
        // last-resort guard so a bug there can never kill the worker loop.
        logger.error(
          { commentId: item.event.commentId, err: (err as Error).message },
          'Unhandled error in queue worker',
        );
      }
    }
  }

  /** Wait for the queue to fully drain (used for graceful shutdown / tests). */
  async onIdle(): Promise<void> {
    if (this.draining) await this.draining;
  }
}

export const commentQueue = new CommentQueue();
