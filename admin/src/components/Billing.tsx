import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, CreditCard, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../api';
import type { BillingInfo, User } from '../types';
import { Banner, fadeUp, useToast } from './ui';
import { badge, btn, card, cx, heading, hint, statIcon } from '../tw';

/**
 * Minimal typing for the Razorpay Checkout script loaded in index.html.
 */
interface RazorpayCheckoutResponse {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}
interface RazorpayOptions {
  key: string;
  subscription_id: string;
  name: string;
  description?: string;
  image?: string;
  prefill?: { name?: string; email?: string };
  theme?: { color?: string };
  handler: (response: RazorpayCheckoutResponse) => void;
  modal?: { ondismiss?: () => void };
}
interface RazorpayInstance {
  open: () => void;
  on: (event: string, cb: (payload: unknown) => void) => void;
}
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

/**
 * The paywall shown to a connected user whose subscription isn't active yet.
 * Launches Razorpay Checkout to authorize the mandate + pay the first month;
 * access unlocks once the subscription is active.
 */
export function Billing({
  user,
  onUpdated,
}: {
  user: User;
  onUpdated: (user: User) => void;
}) {
  const toast = useToast();
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getBilling()
      .then((b) => {
        if (alive) setInfo(b);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load billing');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const sub = info?.subscription ?? user.subscription;
  const isPaused = sub.status === 'paused' || sub.status === 'cancelled';

  async function startPayment() {
    setBusy(true);
    setError(null);
    try {
      if (!window.Razorpay) {
        throw new Error('Payment library failed to load. Please refresh and try again.');
      }
      const { subscriptionId, keyId } = await api.createSubscription();

      const rzp = new window.Razorpay({
        key: keyId,
        subscription_id: subscriptionId,
        name: 'InstaPilot',
        description: 'Monthly automation subscription',
        prefill: { name: user.name, email: user.email },
        theme: { color: '#dd2a7b' },
        handler: (response) => {
          void (async () => {
            try {
              const { user: updated } = await api.verifyPayment({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_subscription_id: response.razorpay_subscription_id,
                razorpay_signature: response.razorpay_signature,
              });
              toast.push('ok', 'Payment successful — your account is now active!');
              onUpdated(updated);
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : 'Payment could not be verified. If you were charged, it will activate shortly.',
              );
            } finally {
              setBusy(false);
            }
          })();
        },
        modal: {
          ondismiss: () => setBusy(false),
        },
      });
      rzp.on('payment.failed', () => {
        setError('Payment failed. Please try again.');
        setBusy(false);
      });
      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the payment');
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className={cx(card, 'max-w-[620px] flex items-center gap-3')}>
        <Loader2 className="animate-spin" size={18} />
        <span className={hint}>Loading billing…</span>
      </div>
    );
  }

  if (info && !info.configured) {
    return (
      <motion.div className={cx(card, 'max-w-[620px]')} {...fadeUp}>
        <span className={cx(statIcon.amber, 'mb-4')}>
          <CreditCard size={22} />
        </span>
        <h2 className={cx(heading, 'text-[22px]')}>Payments not enabled yet</h2>
        <div className={cx(hint, 'mt-2')}>
          Your account is set up, but online payments aren't configured on this
          workspace yet. Please contact your admin to get activated.
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div className={cx(card, 'max-w-[620px]')} {...fadeUp}>
      <div className="flex items-center justify-between">
        <span className={cx(statIcon.ig, 'mb-1')}>
          <Sparkles size={22} />
        </span>
        <span className={isPaused ? badge.off : badge.premium}>
          {isPaused ? 'Paused' : 'Payment pending'}
        </span>
      </div>

      <h2 className={cx(heading, 'text-[22px] mt-3')}>
        {isPaused ? 'Reactivate your subscription' : 'Activate your account'}
      </h2>
      <div className={cx(hint, 'mt-2')}>
        {isPaused
          ? 'Your subscription is paused because a payment could not be collected. Pay now to resume your Instagram automation.'
          : 'Your Instagram account is connected. Complete payment to start your monthly subscription and unlock the automation.'}
      </div>

      {error && (
        <div className="mt-4">
          <Banner kind="error">{error}</Banner>
        </div>
      )}

      <div className="mt-5 rounded-card border border-border bg-surface-2 p-4">
        <div className="flex items-center justify-between text-[13.5px]">
          <span className="text-muted font-medium">Monthly subscription</span>
          <span className="font-semibold">billed monthly</span>
        </div>
        <div className="mt-3 pt-3 border-t border-border flex items-start gap-2 text-[12.5px] text-muted">
          <ShieldCheck size={15} className="shrink-0 mt-px text-green" />
          <span>
            Secure auto-debit via Razorpay. You authorize a monthly mandate and
            are charged the plan amount each month.
          </span>
        </div>
      </div>

      <button
        className={cx(btn.premium, 'mt-5 w-full')}
        onClick={startPayment}
        disabled={busy}
      >
        {busy ? (
          <>
            <Loader2 className="animate-spin" size={16} /> Opening checkout…
          </>
        ) : (
          <>
            <CreditCard size={16} /> {isPaused ? 'Pay & reactivate' : 'Pay & activate'}
          </>
        )}
      </button>

      <div className="mt-3 flex items-center gap-1.5 justify-center text-[12px] text-faint">
        <CheckCircle2 size={13} /> Cancel anytime from your dashboard
      </div>
    </motion.div>
  );
}
