import { logger } from '../utils/logger';
import { processCommentEvent, type CommentEvent } from './flow-engine.service';

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
  private queue: CommentEvent[] = [];
  private processing = false;
  private draining: Promise<void> | null = null;

  enqueue(event: CommentEvent): void {
    this.queue.push(event);
    logger.debug({ commentId: event.commentId, depth: this.queue.length }, 'Enqueued comment event');
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
      const event = this.queue.shift();
      if (!event) break;
      try {
        const result = await processCommentEvent(event);
        logger.info(
          { commentId: event.commentId, action: result.action },
          'Processed comment event',
        );
      } catch (err) {
        // processCommentEvent already handles its own errors, but this is a
        // last-resort guard so a bug there can never kill the worker loop.
        logger.error(
          { commentId: event.commentId, err: (err as Error).message },
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
