import { logger } from '../utils/logger';
import type { IgCredentials, MessageLink } from '../db/types';

// Instagram button-template limits.
const MAX_BUTTONS = 3;
const MAX_BUTTON_TITLE = 20;
const MAX_TEMPLATE_TEXT = 640;

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** Build the Instagram button-template payload from a text + CTA links. */
function buildButtonMessage(text: string, links: MessageLink[]): unknown {
  return {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'button',
        text: truncate(text, MAX_TEMPLATE_TEXT),
        buttons: links.slice(0, MAX_BUTTONS).map((link) => ({
          type: 'web_url',
          url: link.url,
          title: truncate(link.label, MAX_BUTTON_TITLE),
        })),
      },
    },
  };
}

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

export interface GraphMedia {
  id: string;
  caption?: string;
  media_type?: string; // IMAGE | VIDEO | CAROUSEL_ALBUM
  media_product_type?: string; // FEED | REELS | STORY
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  comments_count?: number;
  like_count?: number;
}

export type PublishMediaType = 'IMAGE' | 'REELS';

export interface PublishInput {
  mediaType: PublishMediaType;
  /** Publicly reachable URL (Meta fetches it). Image for IMAGE, video for REELS. */
  mediaUrl: string;
  caption?: string;
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

async function graphRequest<T>(
  creds: IgCredentials,
  opts: RequestOptions,
): Promise<T> {
  const { method, path, query = {}, body, maxRetries = 3 } = opts;
  const url = new URL(`${creds.graphBaseUrl}/${creds.graphApiVersion}/${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', creds.accessToken);

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

/**
 * A credentials-bound Instagram client. Build one per tenant with
 * `createInstagramClient(creds)`; all calls use that tenant's access token,
 * business account id, and Graph host/version.
 */
export interface InstagramClient {
  replyToComment(commentId: string, message: string): Promise<string>;
  sendPrivateReply(
    commentId: string,
    message: string,
    links?: MessageLink[],
  ): Promise<string>;
  getComment(commentId: string): Promise<GraphComment>;
  listMedia(limit?: number): Promise<GraphMedia[]>;
  publishMedia(input: PublishInput): Promise<string>;
  waitForContainerReady(
    containerId: string,
    opts?: { attempts?: number; intervalMs?: number },
  ): Promise<void>;
}

export function createInstagramClient(creds: IgCredentials): InstagramClient {
  const client: InstagramClient = {
    /**
     * Post a PUBLIC reply to a specific comment.
     * POST /{ig-comment-id}/replies?message=...  Returns the new comment id.
     */
    async replyToComment(commentId, message) {
      const result = await graphRequest<{ id: string }>(creds, {
        method: 'POST',
        path: `${commentId}/replies`,
        query: { message },
      });
      logger.info({ commentId, replyId: result.id }, 'Posted reply to comment');
      return result.id;
    },

    /**
     * Send a PRIVATE reply (DM) to the author of a comment.
     * POST /{ig-user-id}/messages  with { recipient: { comment_id }, message }.
     * When `links` are supplied the DM is sent as a button template (max 3).
     */
    async sendPrivateReply(commentId, message, links = []) {
      const messageBody =
        links.length > 0 ? buildButtonMessage(message, links) : { text: message };

      const result = await graphRequest<{
        message_id?: string;
        recipient_id?: string;
      }>(creds, {
        method: 'POST',
        path: `${creds.businessAccountId}/messages`,
        body: {
          recipient: { comment_id: commentId },
          message: messageBody,
        },
      });
      const messageId = result.message_id ?? '';
      logger.info(
        { commentId, messageId, buttons: Math.min(links.length, MAX_BUTTONS) },
        'Sent private reply (DM) to commenter',
      );
      return messageId;
    },

    /** Fetch a single comment's details. */
    async getComment(commentId) {
      return graphRequest<GraphComment>(creds, {
        method: 'GET',
        path: commentId,
        query: {
          fields: 'id,text,username,timestamp,from,parent_id,media',
        },
      });
    },

    /** List the connected account's media (posts + reels), newest first. */
    async listMedia(limit = 25) {
      const result = await graphRequest<{ data?: GraphMedia[] }>(creds, {
        method: 'GET',
        path: `${creds.businessAccountId}/media`,
        query: {
          fields:
            'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,comments_count,like_count',
          limit: String(limit),
        },
      });
      return result.data ?? [];
    },

    /**
     * Publish a new post (IMAGE) or reel (REELS) from a public media URL via the
     * two-step Content Publishing API. Returns the published media id.
     */
    async publishMedia(input) {
      const containerQuery: Record<string, string> =
        input.mediaType === 'REELS'
          ? { media_type: 'REELS', video_url: input.mediaUrl }
          : { image_url: input.mediaUrl };
      if (input.caption) containerQuery.caption = input.caption;

      const container = await graphRequest<{ id: string }>(creds, {
        method: 'POST',
        path: `${creds.businessAccountId}/media`,
        query: containerQuery,
      });

      // Reels need processing time before they can be published.
      if (input.mediaType === 'REELS') {
        await client.waitForContainerReady(container.id);
      }

      const published = await graphRequest<{ id: string }>(creds, {
        method: 'POST',
        path: `${creds.businessAccountId}/media_publish`,
        query: { creation_id: container.id },
      });
      logger.info({ mediaId: published.id }, 'Published media');
      return published.id;
    },

    /** Poll a media container until it's FINISHED (or throw on ERROR/timeout). */
    async waitForContainerReady(containerId, { attempts = 20, intervalMs = 3000 } = {}) {
      for (let i = 0; i < attempts; i += 1) {
        const status = await graphRequest<{
          status_code?: string;
          status?: string;
        }>(creds, {
          method: 'GET',
          path: containerId,
          query: { fields: 'status_code,status' },
        });
        if (status.status_code === 'FINISHED') return;
        if (status.status_code === 'ERROR') {
          throw new InstagramApiError(
            `Media container ${containerId} failed processing: ${status.status ?? 'ERROR'}`,
            400,
            status,
          );
        }
        await sleep(intervalMs);
      }
      throw new InstagramApiError(
        `Media container ${containerId} not ready after ${attempts} checks`,
        408,
        null,
      );
    },
  };
  return client;
}
