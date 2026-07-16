import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { requireAuth } from '../middleware/auth';
import { usersRepo, mapUser } from '../db/repositories/users.repo';
import { asyncHandler, formatZodError } from '../utils/http';
import {
  billingPricing,
  createCustomer,
  createSubscription,
  isRazorpayConfigured,
  verifyCheckoutSignature,
} from '../services/razorpay.service';

export const billingRouter = Router();

/**
 * Current billing state for the signed-in user, plus the public pricing and the
 * Razorpay key id the frontend needs to open Checkout. Used to render the
 * paywall and the dashboard subscription card.
 */
billingRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    res.json({
      configured: isRazorpayConfigured(),
      keyId: isRazorpayConfigured() ? config.RAZORPAY_KEY_ID : null,
      pricing: billingPricing(),
      subscription: mapUser(user).subscription,
    });
  }),
);

/**
 * Create (or reuse) a Razorpay subscription for the signed-in user. Requires the
 * user to be approved by an admin with Instagram credentials configured. Returns
 * the subscription id + key id so the frontend can launch Razorpay Checkout; the
 * mandate + first payment are confirmed asynchronously via webhook.
 */
billingRouter.post(
  '/subscription',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isRazorpayConfigured()) {
      res.status(503).json({ error: 'Billing is not configured' });
      return;
    }

    const user = req.user!;

    if (user.role === 'admin') {
      res.status(400).json({ error: 'Admins do not need a subscription' });
      return;
    }
    if (!user.igCredentials) {
      res.status(409).json({
        error:
          'Connect your Instagram account before subscribing',
        code: 'instagram_not_connected',
      });
      return;
    }

    const current = user.subscription;
    // If a subscription is already active/awaiting payment, don't create a new
    // one — hand the existing id back so the user can complete/authorize it.
    if (
      current &&
      current.razorpaySubscriptionId &&
      (current.status === 'created' ||
        current.status === 'active' ||
        current.status === 'past_due')
    ) {
      res.json({
        subscriptionId: current.razorpaySubscriptionId,
        keyId: config.RAZORPAY_KEY_ID,
        reused: true,
      });
      return;
    }

    try {
      const customerId =
        current?.razorpayCustomerId ?? (await createCustomer(user));
      const created = await createSubscription(user, customerId);
      const updated = await usersRepo.startSubscription(user._id.toString(), {
        razorpaySubscriptionId: created.subscriptionId,
        razorpayCustomerId: created.customerId,
        planId: created.planId,
      });
      res.json({
        subscriptionId: created.subscriptionId,
        keyId: config.RAZORPAY_KEY_ID,
        shortUrl: created.shortUrl,
        reused: false,
        user: updated,
      });
    } catch (err) {
      logger.error(
        { err: (err as Error).message, userId: user._id.toString() },
        'Failed to create Razorpay subscription',
      );
      res.status(502).json({ error: 'Could not start the subscription' });
    }
  }),
);

const verifySchema = z.object({
  razorpay_payment_id: z.string().min(1),
  razorpay_subscription_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

/**
 * Verify the Razorpay Checkout callback after the user authorizes the mandate.
 * Webhooks remain the source of truth, but verifying here lets us unlock access
 * immediately for a smooth UX. The signature is validated against the API secret.
 */
billingRouter.post(
  '/verify',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(formatZodError(parsed.error));
      return;
    }
    const user = req.user!;
    const {
      razorpay_payment_id: paymentId,
      razorpay_subscription_id: subscriptionId,
      razorpay_signature: signature,
    } = parsed.data;

    // The subscription id must match the one we created for this user.
    if (user.subscription?.razorpaySubscriptionId !== subscriptionId) {
      res.status(409).json({ error: 'Subscription mismatch' });
      return;
    }

    const valid = verifyCheckoutSignature({
      paymentId,
      subscriptionId,
      signature,
    });
    if (!valid) {
      res.status(400).json({ error: 'Payment signature verification failed' });
      return;
    }

    const now = new Date().toISOString();
    const updated = await usersRepo.updateSubscription(user._id.toString(), {
      status: 'active',
      lastPaymentId: paymentId,
      lastEventAt: now,
    });
    res.json({ user: updated });
  }),
);
