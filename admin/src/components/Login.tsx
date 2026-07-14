import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, MessageSquareText, ShieldCheck, Zap } from 'lucide-react';
import { api, setToken } from '../api';
import type { User } from '../types';
import { Banner, BrandMark, PoweredBy, Spinner } from './ui';
import { IG_TEXT, cx, heading } from '../tw';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

const HERO_POINTS = [
  { icon: Bot, text: 'AI-powered comment → DM automation' },
  { icon: MessageSquareText, text: 'Smart templates & keyword triggers' },
  { icon: Zap, text: 'Publish posts & reels in seconds' },
];

export function Login({ onSuccess }: { onSuccess: (user: User) => void }) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setError(
        'Google sign-in is not configured. Set VITE_GOOGLE_CLIENT_ID in the admin .env.',
      );
      return;
    }

    let cancelled = false;

    function tryInit(attempt = 0) {
      if (cancelled) return;
      const google = window.google;
      if (!google) {
        if (attempt < 40) setTimeout(() => tryInit(attempt + 1), 100);
        else setError('Could not load Google sign-in. Check your connection.');
        return;
      }

      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          setBusy(true);
          setError(null);
          try {
            const { token, user } = await api.googleLogin(response.credential);
            setToken(token);
            onSuccess(user);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Sign-in failed');
          } finally {
            setBusy(false);
          }
        },
      });

      if (buttonRef.current) {
        google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: 320,
        });
      }
    }

    tryInit();
    return () => {
      cancelled = true;
    };
  }, [onSuccess]);

  return (
    <div className="grid min-h-screen grid-cols-2 max-[900px]:grid-cols-1">
      <div className="relative overflow-hidden flex flex-col justify-between p-14 border-r border-border max-[900px]:hidden bg-[radial-gradient(120%_120%_at_0%_0%,rgba(124,58,237,0.14),transparent_50%),radial-gradient(120%_120%_at_100%_100%,rgba(221,42,123,0.12),transparent_55%),#fff]">
        <div className="flex items-center gap-3">
          <BrandMark size={44} />
          <div className="text-[22px] font-extrabold tracking-[-0.03em]">
            Insta<b className={IG_TEXT}>Pilot</b>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className={cx(heading, 'text-[40px] leading-[1.1] tracking-[-0.035em] max-w-[460px]')}>
            Put your Instagram engagement on{' '}
            <span className={IG_TEXT}>autopilot</span>.
          </h1>
          <p className="text-muted text-base max-w-[420px] mt-4">
            InstaPilot turns every comment into a conversation — automatically
            DMing the right people and replying in your voice, 24/7.
          </p>
          <div className="flex flex-col gap-3.5 mt-7">
            {HERO_POINTS.map((p, i) => {
              const Icon = p.icon;
              return (
                <motion.div
                  key={p.text}
                  className="flex items-center gap-3 text-[14.5px] font-medium"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.15 + i * 0.08 }}
                >
                  <span className="flex items-center justify-center w-[34px] h-[34px] rounded-[10px] bg-surface border border-border text-accent shadow-xs">
                    <Icon size={18} />
                  </span>
                  {p.text}
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        <PoweredBy />
      </div>

      <div className="flex items-center justify-center p-10">
        <motion.div
          className="w-full max-w-[400px]"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <h2 className={cx(heading, 'text-2xl')}>Welcome back</h2>
          <p className="text-muted mt-2 mb-7">
            Sign in to manage your Instagram automation and AI replies.
          </p>

          {error && <Banner kind="error">{error}</Banner>}

          <div
            ref={buttonRef}
            className="flex justify-center min-h-[44px]"
          />

          {busy && (
            <div className="flex items-center justify-center gap-2.5 mt-[18px]">
              <Spinner /> <span className="text-muted">Signing you in…</span>
            </div>
          )}

          <div className="flex items-center gap-3 text-faint text-xs my-[22px] before:content-[''] before:flex-1 before:h-px before:bg-border after:content-[''] after:flex-1 after:h-px after:bg-border">
            SECURE SIGN-IN
          </div>

          <div className="flex items-center justify-center gap-2 text-muted text-[13px]">
            <ShieldCheck size={16} /> Protected by Google OAuth
          </div>

          <div className="mt-7 text-xs text-faint text-center">
            By continuing you agree to InstaPilot's Terms & Privacy Policy.
          </div>
        </motion.div>
      </div>
    </div>
  );
}
