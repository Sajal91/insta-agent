import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { commentQueue } from '../services/queue.service';
import {
  findOwnerByBusinessAccountId,
  isKnownVerifyToken,
} from '../services/credentials.service';
import type { CommentEvent } from '../services/flow-engine.service';

export const webhookRouter = Router();

/**
 * GET handshake. Meta calls this once when a webhook is saved. Because each
 * tenant brings their own Meta app + verify token, we echo hub.challenge if the
 * token matches ANY known tenant (the admin env token or a per-user token).
 */
webhookRouter.get('/instagram', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = String(req.query['hub.verify_token'] ?? '');
  const challenge = req.query['hub.challenge'];

  void (async () => {
    if (mode === 'subscribe' && (await isKnownVerifyToken(token))) {
      logger.info('Webhook verification handshake succeeded');
      res.status(200).send(String(challenge ?? ''));
      return;
    }
    logger.warn({ mode }, 'Webhook verification handshake failed');
    res.sendStatus(403);
  })();
});

// Lenient schema: Meta occasionally adds fields; we only pull what we need and
// ignore the rest so an unexpected extra field never causes a hard failure.
const commentValueSchema = z
  .object({
    id: z.string(),
    text: z.string().optional().default(''),
    parent_id: z.string().optional(),
    from: z
      .object({ id: z.string().optional(), username: z.string().optional() })
      .partial()
      .optional(),
    media: z
      .object({ id: z.string().optional(), media_product_type: z.string().optional() })
      .partial()
      .optional(),
  })
  .passthrough();

const webhookBodySchema = z
  .object({
    object: z.string().optional(),
    entry: z
      .array(
        z
          .object({
            id: z.string().optional(),
            time: z.number().optional(),
            changes: z
              .array(
                z
                  .object({ field: z.string(), value: z.unknown() })
                  .passthrough(),
              )
              .optional()
              .default([]),
          })
          .passthrough(),
      )
      .optional()
      .default([]),
  })
  .passthrough();

/** Constant-time check of Meta's X-Hub-Signature-256 against an app secret. */
function signatureValid(
  raw: Buffer,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!header) return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(raw).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * POST receiver. We ACK Meta with 200 immediately (Meta retries on non-2xx),
 * then resolve which tenant each entry belongs to (via entry.id = the IG
 * business account id), verify the signature with THAT tenant's app secret, and
 * enqueue the work bound to that owner + their credentials.
 */
webhookRouter.post('/instagram', (req, res) => {
  res.sendStatus(200);

  const raw = req.rawBody;
  const parsed = webhookBodySchema.safeParse(req.body);
  if (!raw || !parsed.success) {
    logger.warn('Unparseable webhook body or missing raw body');
    return;
  }
  const signatureHeader = req.get('x-hub-signature-256');

  void (async () => {
    for (const entry of parsed.data.entry) {
      const businessAccountId = entry.id;
      if (!businessAccountId) {
        logger.warn('Webhook entry missing id — cannot route to a tenant');
        continue;
      }

      const owner = await findOwnerByBusinessAccountId(businessAccountId);
      if (!owner) {
        logger.warn(
          { businessAccountId },
          'No tenant owns this Instagram account — ignoring webhook entry',
        );
        continue;
      }

      // Verify the signature with the resolving tenant's app secret.
      if (!signatureValid(raw, signatureHeader, owner.credentials.appSecret)) {
        logger.warn(
          { businessAccountId, ownerId: owner.ownerId },
          'Webhook signature mismatch for tenant — rejecting entry',
        );
        continue;
      }

      for (const change of entry.changes) {
        if (change.field !== 'comments') {
          logger.debug({ field: change.field }, 'Ignoring non-comment change');
          continue;
        }

        const valueResult = commentValueSchema.safeParse(change.value);
        if (!valueResult.success) {
          logger.warn(
            { issues: valueResult.error.issues },
            'Ignoring malformed comment change value',
          );
          continue;
        }
        const value = valueResult.data;

        const mediaId = value.media?.id;
        const fromId = value.from?.id;
        if (!mediaId || !fromId) {
          logger.warn(
            { commentId: value.id },
            'Comment change missing media.id or from.id — skipping',
          );
          continue;
        }

        const event: CommentEvent = {
          commentId: value.id,
          text: value.text ?? '',
          fromId,
          fromUsername: value.from?.username,
          mediaId,
          parentId: value.parent_id,
        };

        commentQueue.enqueue({
          event,
          ownerId: owner.ownerId,
          credentials: owner.credentials,
        });
      }
    }
  })();
});
