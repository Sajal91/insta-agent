import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import type { WithId } from 'mongodb';
import { config, isRazorpayConfigured } from '../config/env';
import { logger } from '../utils/logger';
import type { SubscriptionStatus, UserDoc } from '../db/types';

/**
 * Thin wrapper around the Razorpay Node SDK for the subscription billing flow.
 *
 * The monthly Plan is created once in the Razorpay dashboard; its id is provided
 * via RAZORPAY_PLAN_ID. When a user subscribes we create (or reuse) a Razorpay
 * customer and a subscription for that plan, charging the one-time setup fee as
 * an addon on the first invoice. The mandate + first payment happen through
 * Razorpay Checkout on the frontend; state is confirmed asynchronously via
 * webhooks.
 */

// Charge the customer for a large number of cycles; effectively "until
// cancelled" for a monthly plan (~10 years). Razorpay requires a finite count.
const DEFAULT_TOTAL_COUNT = 120;

let client: Razorpay | null = null;

/** Lazily construct the Razorpay client, or null when billing isn't configured. */
function getClient(): Razorpay | null {
  if (!isRazorpayConfigured()) return null;
  if (!client) {
    client = new Razorpay({
      key_id: config.RAZORPAY_KEY_ID,
      key_secret: config.RAZORPAY_KEY_SECRET,
    });
  }
  return client;
}

export interface CreatedSubscription {
  subscriptionId: string;
  customerId: string | null;
  planId: string;
  shortUrl: string;
  status: string;
}

/**
 * Create a Razorpay customer for the given user. Uses fail_existing: 0 so that
 * repeat calls return the existing customer instead of erroring.
 */
export async function createCustomer(
  user: WithId<UserDoc>,
): Promise<string | null> {
  const rzp = getClient();
  if (!rzp) return null;
  try {
    const customer = await rzp.customers.create({
      name: user.name?.slice(0, 50) || user.email,
      email: user.email,
      fail_existing: 0,
      notes: { userId: user._id.toString() },
    });
    return customer.id;
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, userId: user._id.toString() },
      'Failed to create Razorpay customer — proceeding without one',
    );
    return null;
  }
}

/**
 * Create a monthly subscription for the user. The first charge and every
 * subsequent charge equal the plan amount only (no setup fee).
 */
export async function createSubscription(
  user: WithId<UserDoc>,
  customerId: string | null,
): Promise<CreatedSubscription> {
  const rzp = getClient();
  if (!rzp) {
    throw new Error('Razorpay is not configured');
  }

  const subscription = await rzp.subscriptions.create({
    plan_id: config.RAZORPAY_PLAN_ID,
    total_count: DEFAULT_TOTAL_COUNT,
    customer_notify: 1,
    ...(customerId ? { customer_id: customerId } : {}),
    notes: { userId: user._id.toString() },
  } as Parameters<typeof rzp.subscriptions.create>[0]);

  return {
    subscriptionId: subscription.id,
    customerId: subscription.customer_id ?? customerId,
    planId: config.RAZORPAY_PLAN_ID,
    shortUrl: subscription.short_url,
    status: subscription.status,
  };
}

/** Fetch the latest subscription snapshot from Razorpay. */
export async function fetchSubscription(subscriptionId: string) {
  const rzp = getClient();
  if (!rzp) throw new Error('Razorpay is not configured');
  return rzp.subscriptions.fetch(subscriptionId);
}

/**
 * Verify the signature returned by Razorpay Checkout after a subscription
 * authorization payment. For subscriptions the signature is an HMAC-SHA256 of
 * `${razorpay_payment_id}|${razorpay_subscription_id}` keyed by the API secret.
 */
export function verifyCheckoutSignature(params: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
}): boolean {
  if (!config.RAZORPAY_KEY_SECRET) return false;
  const expected = crypto
    .createHmac('sha256', config.RAZORPAY_KEY_SECRET)
    .update(`${params.paymentId}|${params.subscriptionId}`)
    .digest('hex');
  return timingSafeEqualHex(expected, params.signature);
}

/**
 * Verify an incoming Razorpay webhook. The signature is an HMAC-SHA256 of the
 * exact raw request body keyed by the webhook secret.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  signature: string | undefined,
): boolean {
  if (!signature || !config.RAZORPAY_WEBHOOK_SECRET) return false;
  const body =
    typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const expected = crypto
    .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest('hex');
  return timingSafeEqualHex(expected, signature);
}

/** Constant-time comparison of two hex strings of equal expected length. */
function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Map a Razorpay subscription status to our internal SubscriptionStatus.
 *   authenticated/active           -> active
 *   pending                        -> past_due (a charge failed; retrying)
 *   halted                         -> paused (retries exhausted)
 *   cancelled/completed/expired    -> cancelled
 *   created                        -> created (awaiting first payment)
 */
export function mapRazorpayStatus(
  razorpayStatus: string,
): SubscriptionStatus {
  switch (razorpayStatus) {
    case 'authenticated':
    case 'active':
      return 'active';
    case 'pending':
      return 'past_due';
    case 'halted':
    case 'paused':
      return 'paused';
    case 'cancelled':
    case 'completed':
    case 'expired':
      return 'cancelled';
    case 'created':
    default:
      return 'created';
  }
}

/** Public pricing snapshot shown to users on the paywall. */
export function billingPricing() {
  return {
    currency: config.RAZORPAY_CURRENCY,
  };
}

export { isRazorpayConfigured };
