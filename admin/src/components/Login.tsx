import { useEffect, useRef, useState } from 'react';
import { api, setToken } from '../api';
import type { User } from '../types';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

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

    // The GIS script loads async; poll briefly until window.google is ready.
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
          theme: 'filled_blue',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: 280,
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
      <div className="card login-card">
        <div className="brand" style={{ marginBottom: 4 }}>
          insta<span>·</span>agent
        </div>
        <div className="hint" style={{ marginBottom: 24 }}>
          Sign in to request or manage your Instagram automation
        </div>

        {error && <div className="banner error">{error}</div>}

        <div
          ref={buttonRef}
          style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }}
        />

        {busy && (
          <div className="hint" style={{ marginTop: 16 }}>
            Signing you in…
          </div>
        )}
      </div>
    </div>
  );
}
