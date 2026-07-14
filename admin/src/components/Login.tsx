import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, MessageSquareText, ShieldCheck, Zap } from 'lucide-react';
import { api, setToken } from '../api';
import type { User } from '../types';
import { Banner, BrandMark, PoweredBy, Spinner } from './ui';

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
    <div className="login-wrap">
      <div className="login-hero">
        <div className="hero-brand">
          <BrandMark size={44} />
          <div className="name">
            Insta<b>Pilot</b>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1>
            Put your Instagram engagement on <span className="grad">autopilot</span>.
          </h1>
          <p className="lead">
            InstaPilot turns every comment into a conversation — automatically
            DMing the right people and replying in your voice, 24/7.
          </p>
          <div className="hero-points">
            {HERO_POINTS.map((p, i) => {
              const Icon = p.icon;
              return (
                <motion.div
                  key={p.text}
                  className="hero-point"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.15 + i * 0.08 }}
                >
                  <span className="hp-icon">
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

      <div className="login-form">
        <motion.div
          className="login-card"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <div
            className="flex"
            style={{ gap: 10, marginBottom: 20, display: 'none' }}
          >
            <BrandMark size={40} />
          </div>
          <h2>Welcome back</h2>
          <p className="lead">
            Sign in to manage your Instagram automation and AI replies.
          </p>

          {error && <Banner kind="error">{error}</Banner>}

          <div
            ref={buttonRef}
            style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }}
          />

          {busy && (
            <div
              className="flex"
              style={{ justifyContent: 'center', gap: 10, marginTop: 18 }}
            >
              <Spinner /> <span className="muted">Signing you in…</span>
            </div>
          )}

          <div className="login-divider">SECURE SIGN-IN</div>

          <div
            className="flex"
            style={{ justifyContent: 'center', gap: 8, color: 'var(--muted)', fontSize: 13 }}
          >
            <ShieldCheck size={16} /> Protected by Google OAuth
          </div>

          <div className="login-legal">
            By continuing you agree to InstaPilot's Terms & Privacy Policy.
          </div>
        </motion.div>
      </div>
    </div>
  );
}
