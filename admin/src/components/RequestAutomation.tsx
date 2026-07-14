import { useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, Send, Sparkles, XCircle } from 'lucide-react';
import { api } from '../api';
import type { User } from '../types';
import { Banner, fadeUp } from './ui';
import {
  badge,
  btn,
  card,
  cx,
  field,
  heading,
  hint,
  label,
  statIcon,
  textarea,
} from '../tw';

/**
 * The landing view for a regular (non-admin) user. It reflects where they are in
 * the request lifecycle: not requested -> pending -> approved / rejected.
 */
export function RequestAutomation({
  user,
  onUpdated,
}: {
  user: User;
  onUpdated: (user: User) => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { user: updated } = await api.requestAutomation(
        note.trim() || undefined,
      );
      onUpdated(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit request');
    } finally {
      setBusy(false);
    }
  }

  if (user.status === 'pending') {
    return (
      <motion.div className={cx(card, 'max-w-[620px]')} {...fadeUp}>
        <span className={cx(statIcon.amber, 'mb-4')}>
          <Clock size={22} />
        </span>
        <h2 className={cx(heading, 'text-[22px]')}>Request received</h2>
        <div className={cx(hint, 'mt-2')}>
          Your request to use the Instagram automation is pending admin approval.
          You'll get access here once an admin approves you and configures your
          Instagram credentials.
        </div>
        {user.requestedAt && (
          <span className={cx(badge.default, 'mt-4')}>
            Requested {new Date(user.requestedAt).toLocaleString()}
          </span>
        )}
      </motion.div>
    );
  }

  if (user.status === 'rejected') {
    return (
      <motion.div className={cx(card, 'max-w-[620px]')} {...fadeUp}>
        <span className={cx(statIcon.red, 'mb-4')}>
          <XCircle size={22} />
        </span>
        <h2 className={cx(heading, 'text-[22px]')}>Request not approved</h2>
        <div className={cx(hint, 'mt-2')}>
          Your previous request wasn't approved. You can submit a new request
          below if you think this was a mistake.
        </div>
        {error && <Banner kind="error">{error}</Banner>}
        <div className={cx(field, 'mt-4')}>
          <label className={label}>Message to the admin (optional)</label>
          <textarea
            className={textarea}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <button className={btn.primary} onClick={submit} disabled={busy}>
          {busy ? (
            'Submitting…'
          ) : (
            <>
              <Send size={16} /> Request again
            </>
          )}
        </button>
      </motion.div>
    );
  }

  // status === 'none'
  return (
    <motion.div className={cx(card, 'max-w-[620px]')} {...fadeUp}>
      <span className={cx(statIcon.ig, 'mb-4')}>
        <Sparkles size={22} />
      </span>
      <h2 className={cx(heading, 'text-[22px]')}>
        Request the Instagram automation
      </h2>
      <div className={cx(hint, 'mt-2')}>
        Ask an admin to enable automated comment→DM replies for your Instagram
        Business account. Once approved and configured, you'll be able to set up
        auto-replies on your posts right here.
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      <div className={cx(field, 'mt-[18px]')}>
        <label className={label}>Anything the admin should know? (optional)</label>
        <textarea
          className={textarea}
          value={note}
          placeholder="e.g. my Instagram handle, what I want to automate…"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <button className={btn.premium} onClick={submit} disabled={busy}>
        {busy ? (
          'Submitting…'
        ) : (
          <>
            <Send size={16} /> Request access
          </>
        )}
      </button>
    </motion.div>
  );
}
