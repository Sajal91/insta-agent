import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { verifyWebhookSignature } from '../middleware/verify-webhook-signature';
import { commentQueue } from '../services/queue.service';
import type { CommentEvent } from '../services/flow-engine.service';

export const webhookRouter = Router();

/**
 * GET handshake. Meta calls this once when you save the webhook config. Echo
 * back hub.challenge only if the verify token matches ours.
 */
webhookRouter.get('/instagram', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.IG_VERIFY_TOKEN) {
    logger.info('Webhook verification handshake succeeded');
    res.status(200).send(String(challenge ?? ''));
    return;
  }

  logger.warn({ mode }, 'Webhook verification handshake failed');
  res.sendStatus(403);
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
                  .object({
                    field: z.string(),
                    value: z.unknown(),
                  })
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

/**
 * POST receiver. Signature is verified first. We ACK Meta with 200 immediately
 * and push work onto the in-memory queue — Meta retries on non-2xx, so fast ACK
 * matters.
 */
webhookRouter.post('/instagram', verifyWebhookSignature, (req, res) => {
  // Always ACK fast. Any processing error must never turn into a non-200.
  res.sendStatus(200);

  const parsed = webhookBodySchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, 'Unparseable webhook body');
    return;
  }

  for (const entry of parsed.data.entry) {
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

      commentQueue.enqueue(event);
    }
  }
});
