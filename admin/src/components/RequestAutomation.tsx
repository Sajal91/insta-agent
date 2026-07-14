import { useState } from 'react';
import { api } from '../api';
import type { User } from '../types';

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
      const { user: updated } = await api.requestAutomation(note.trim() || undefined);
      onUpdated(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit request');
    } finally {
      setBusy(false);
    }
  }

  if (user.status === 'pending') {
    return (
      <div className="card" style={{ maxWidth: 620 }}>
        <h2>Request received ⏳</h2>
        <div className="hint" style={{ marginTop: 8 }}>
          Your request to use the Instagram automation is pending admin approval.
          You'll get access here once an admin approves you and configures your
          Instagram credentials.
        </div>
        {user.requestedAt && (
          <div className="muted" style={{ marginTop: 12, fontSize: 13 }}>
            Requested {new Date(user.requestedAt).toLocaleString()}
          </div>
        )}
      </div>
    );
  }

  if (user.status === 'rejected') {
    return (
      <div className="card" style={{ maxWidth: 620 }}>
        <h2>Request not approved</h2>
        <div className="hint" style={{ marginTop: 8 }}>
          Your previous request wasn't approved. You can submit a new request
          below if you think this was a mistake.
        </div>
        {error && <div className="banner error" style={{ marginTop: 12 }}>{error}</div>}
        <div className="field" style={{ marginTop: 16 }}>
          <label>Message to the admin (optional)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className="btn" onClick={submit} disabled={busy}>
          {busy ? 'Submitting…' : 'Request again'}
        </button>
      </div>
    );
  }

  // status === 'none'
  return (
    <div className="card" style={{ maxWidth: 620 }}>
      <h2>Request the Instagram automation</h2>
      <div className="hint" style={{ marginTop: 8 }}>
        Ask an admin to enable automated comment→DM replies for your Instagram
        Business account. Once approved and configured, you'll be able to set up
        auto-replies on your posts right here.
      </div>

      {error && <div className="banner error" style={{ marginTop: 12 }}>{error}</div>}

      <div className="field" style={{ marginTop: 16 }}>
        <label>Anything the admin should know? (optional)</label>
        <textarea
          value={note}
          placeholder="e.g. my Instagram handle, what I want to automate…"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <button className="btn" onClick={submit} disabled={busy}>
        {busy ? 'Submitting…' : 'Request access'}
      </button>
    </div>
  );
}
