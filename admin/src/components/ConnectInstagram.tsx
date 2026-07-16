import { useState } from 'react';
import { motion } from 'framer-motion';
import { AtSign, Link2, ShieldCheck, Zap } from 'lucide-react';
import { api } from '../api';
import { Banner, fadeUp } from './ui';
import { btn, card, cx, heading, hint, statIcon } from '../tw';

/**
 * Landing view for a non-admin user who hasn't connected their Instagram
 * account yet. Fetches the Business Login authorize URL from the backend and
 * redirects the browser to Meta to complete the OAuth flow.
 */
export function ConnectInstagram() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api.getInstagramLoginUrl();
      window.location.href = url;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Failed to start Instagram connection',
      );
      setBusy(false);
    }
  }

  return (
    <motion.div className={cx(card, 'max-w-[620px]')} {...fadeUp}>
      <span className={cx(statIcon.ig, 'mb-4')}>
        <AtSign size={22} />
      </span>
      <h2 className={cx(heading, 'text-[22px]')}>Connect your Instagram</h2>
      <div className={cx(hint, 'mt-2')}>
        Link your Instagram Business account to enable automated comment→DM
        replies. You'll be redirected to Instagram to authorize access, then
        brought right back here.
      </div>

      <ul className="mt-5 space-y-3 text-[13px] text-muted">
        <li className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-emerald-400" />
          Secure Business Login — we never see your password.
        </li>
        <li className="flex items-center gap-2">
          <Zap size={16} className="text-amber-400" />
          Instantly automate replies on your posts &amp; reels.
        </li>
      </ul>

      {error && <Banner kind="error">{error}</Banner>}

      <button className={cx(btn.premium, 'mt-6')} onClick={connect} disabled={busy}>
        {busy ? (
          'Redirecting…'
        ) : (
          <>
            <Link2 size={16} /> Connect Instagram
          </>
        )}
      </button>
    </motion.div>
  );
}
