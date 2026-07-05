import { config } from '../config/env';
import { logger } from '../utils/logger';

const BASE_URL = config.IG_GRAPH_BASE_URL;

export interface GraphCommentAuthor {
  id?: string;
  username?: string;
}

export interface GraphComment {
  id: string;
  text: string;
  username?: string;
  timestamp?: string;
  from?: GraphCommentAuthor;
  parent_id?: string;
  media?: { id: string };
}

export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'InstagramApiError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A 4xx (except 429) means the request itself is bad — retrying won't help.
 * 429 (rate limit) and 5xx are transient and worth backing off + retrying.
 */
function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

interface RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, string>;
  /** Optional JSON body (sent with content-type: application/json). */
  body?: unknown;
  maxRetries?: number;
}

async function graphRequest<T>(opts: RequestOptions): Promise<T> {
  const { method, path, query = {}, body, maxRetries = 3 } = opts;
  const url = new URL(`${BASE_URL}/${config.IG_GRAPH_API_VERSION}/${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', config.IG_ACCESS_TOKEN);

  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  let attempt = 0;
  // Retry with exponential backoff on transient failures.
  while (true) {
    attempt += 1;
    try {
      const res = await fetch(url, init);
      const rawText = await res.text();
      let parsed: unknown = null;
      try {
        parsed = rawText ? JSON.parse(rawText) : null;
      } catch {
        parsed = rawText;
      }

      if (res.ok) return parsed as T;

      if (isRetryable(res.status) && attempt <= maxRetries) {
        const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 15_000);
        logger.warn(
          { status: res.status, attempt, backoffMs, path },
          'Instagram API transient error, backing off',
        );
        await sleep(backoffMs);
        continue;
      }

      throw new InstagramApiError(
        `Instagram API ${method} ${path} failed with ${res.status}`,
        res.status,
        parsed,
      );
    } catch (err) {
      if (err instanceof InstagramApiError) throw err;
      // Network-level error (fetch threw). Retry if attempts remain.
      if (attempt <= maxRetries) {
        const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 15_000);
        logger.warn(
          { attempt, backoffMs, path, err: (err as Error).message },
          'Instagram API network error, backing off',
        );
        await sleep(backoffMs);
        continue;
      }
      throw err;
    }
  }
}

export const instagramService = {
  /**
   * Post a PUBLIC reply to a specific comment.
   * POST /{ig-comment-id}/replies?message=...
   * Returns the newly-created comment id.
   */
  async replyToComment(commentId: string, message: string): Promise<string> {
    const result = await graphRequest<{ id: string }>({
      method: 'POST',
      path: `${commentId}/replies`,
      query: { message },
    });
    logger.info({ commentId, replyId: result.id }, 'Posted reply to comment');
    return result.id;
  },

  /**
   * Send a PRIVATE reply (DM) to the author of a comment.
   * POST /{ig-user-id}/messages  with { recipient: { comment_id }, message: { text } }
   *
   * Requires the `instagram_business_manage_messages` permission (Instagram Login)
   * / `pages_messaging` (Facebook Login) plus Advanced Access. Meta rules: one
   * private reply per comment, must be sent within 7 days of the comment.
   * Returns the message id.
   */
  async sendPrivateReply(commentId: string, message: string): Promise<string> {
    const result = await graphRequest<{ message_id?: string; recipient_id?: string }>({
      method: 'POST',
      path: `${config.IG_BUSINESS_ACCOUNT_ID}/messages`,
      body: {
        recipient: { comment_id: commentId },
        message: { text: message },
      },
    });
    const messageId = result.message_id ?? '';
    logger.info({ commentId, messageId }, 'Sent private reply (DM) to commenter');
    return messageId;
  },

  /**
   * Fetch a single comment's details. Handy for the manual-reply endpoint and
   * for enriching events that arrive without full context.
   */
  async getComment(commentId: string): Promise<GraphComment> {
    return graphRequest<GraphComment>({
      method: 'GET',
      path: commentId,
      query: {
        fields: 'id,text,username,timestamp,from,parent_id,media',
      },
    });
  },
};
