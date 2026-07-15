import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { isRazorpayConfigured } from '../config/env';
import { logger } from '../utils/logger';
import { commentQueue } from '../services/queue.service';
import {
  findOwnerByBusinessAccountId,
  isKnownVerifyToken,
} from '../services/credentials.service';
import { usersRepo } from '../db/repositories/users.repo';
import { isSubscriptionActive, type Subscription } from '../db/types';
import {
  mapRazorpayStatus,
  verifyWebhookSignature,
} from '../services/razorpay.service';
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

      // Pause automation for tenants without an active subscription (unless the
      // owner is the admin, or billing isn't configured on this deployment).
      if (
        isRazorpayConfigured() &&
        owner.user.role !== 'admin' &&
        !isSubscriptionActive(owner.user.subscription)
      ) {
        logger.info(
          { businessAccountId, ownerId: owner.ownerId },
          'Tenant subscription inactive — skipping automation for webhook entry',
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

// ---- Razorpay subscription webhooks ----

const razorpaySubscriptionEntitySchema = z
  .object({
    id: z.string(),
    status: z.string(),
    current_end: z.number().nullable().optional(),
    charge_at: z.number().nullable().optional(),
    customer_id: z.string().nullable().optional(),
    notes: z.record(z.union([z.string(), z.number()])).optional(),
  })
  .passthrough();

const razorpayWebhookSchema = z
  .object({
    event: z.string(),
    created_at: z.number().optional(),
    payload: z
      .object({
        subscription: z
          .object({ entity: razorpaySubscriptionEntitySchema })
          .optional(),
        payment: z
          .object({ entity: z.object({ id: z.string() }).passthrough() })
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

/**
 * Receiver for Razorpay subscription webhooks. We verify the HMAC signature
 * against the exact raw body (RAZORPAY_WEBHOOK_SECRET), then reconcile the
 * user's subscription state. Webhooks are the source of truth for activation,
 * renewals, retries and pausing on failed payments.
 */
webhookRouter.post('/razorpay', (req, res) => {
  const raw = req.rawBody;
  const signature = req.get('x-razorpay-signature');

  if (!raw || !verifyWebhookSignature(raw, signature)) {
    logger.warn('Razorpay webhook signature verification failed');
    res.sendStatus(400);
    return;
  }

  const parsed = razorpayWebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn(
      { issues: parsed.error.issues },
      'Unparseable Razorpay webhook body',
    );
    res.sendStatus(200);
    return;
  }

  // ACK immediately; Razorpay retries on non-2xx.
  res.sendStatus(200);

  const { event, created_at: createdAt } = parsed.data;
  const subEntity = parsed.data.payload.subscription?.entity;
  const paymentId = parsed.data.payload.payment?.entity.id ?? null;

  void (async () => {
    if (!subEntity) {
      logger.debug({ event }, 'Razorpay webhook without a subscription entity — ignoring');
      return;
    }

    // Resolve the owning user: prefer the userId note we set on creation, then
    // fall back to the stored subscription id.
    const noteUserId =
      subEntity.notes && typeof subEntity.notes.userId === 'string'
        ? (subEntity.notes.userId as string)
        : null;
    const user =
      (noteUserId ? await usersRepo.findById(noteUserId) : null) ??
      (await usersRepo.findBySubscriptionId(subEntity.id));

    if (!user) {
      logger.warn(
        { event, subscriptionId: subEntity.id },
        'Razorpay webhook for unknown subscription — ignoring',
      );
      return;
    }

    // Idempotency / ordering: skip events older than the last one we applied.
    const eventAtMs = createdAt ? createdAt * 1000 : Date.now();
    const lastEventAt = user.subscription?.lastEventAt
      ? Date.parse(user.subscription.lastEventAt)
      : 0;
    if (eventAtMs < lastEventAt) {
      logger.debug(
        { event, subscriptionId: subEntity.id },
        'Ignoring stale Razorpay webhook event',
      );
      return;
    }

    const patch: Partial<Subscription> = {
      status: mapRazorpayStatus(subEntity.status),
      razorpaySubscriptionId: subEntity.id,
      lastEventAt: new Date(eventAtMs).toISOString(),
    };
    if (subEntity.customer_id) patch.razorpayCustomerId = subEntity.customer_id;
    const periodEnd = subEntity.current_end ?? subEntity.charge_at ?? null;
    if (periodEnd) patch.currentPeriodEnd = new Date(periodEnd * 1000).toISOString();

    // A successful charge confirms the setup fee (billed on the first invoice)
    // and records the payment.
    if (event === 'subscription.charged') {
      patch.setupFeePaid = true;
      if (paymentId) patch.lastPaymentId = paymentId;
    }

    await usersRepo.updateSubscription(user._id.toString(), patch);
    logger.info(
      {
        event,
        subscriptionId: subEntity.id,
        userId: user._id.toString(),
        status: patch.status,
      },
      'Applied Razorpay subscription webhook',
    );
  })();
});
