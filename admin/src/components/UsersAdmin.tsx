import { useEffect, useState } from 'react';
import { api } from '../api';
import type { AutomationStatus, CredentialsInput, User } from '../types';

const EMPTY_CREDS: CredentialsInput = {
  appId: '',
  appSecret: '',
  accessToken: '',
  businessAccountId: '',
  pageHandle: '',
  verifyToken: '',
  graphApiVersion: 'v21.0',
  graphBaseUrl: 'https://graph.instagram.com',
};

function StatusBadge({ status }: { status: AutomationStatus }) {
  const map: Record<AutomationStatus, string> = {
    none: 'off',
    pending: 'kw',
    approved: 'on',
    rejected: 'off',
  };
  return <span className={`badge ${map[status]}`}>{status}</span>;
}

function CredentialsForm({
  user,
  onSaved,
}: {
  user: User;
  onSaved: (user: User) => void;
}) {
  const [form, setForm] = useState<CredentialsInput>(EMPTY_CREDS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function set<K extends keyof CredentialsInput>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const { user: updated } = await api.setUserCredentials(user.id, form);
      setOk('Credentials saved.');
      onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save credentials');
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!confirm('Remove stored Instagram credentials for this user?')) return;
    setBusy(true);
    setError(null);
    try {
      const { user: updated } = await api.clearUserCredentials(user.id);
      setOk('Credentials removed.');
      onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove credentials');
    } finally {
      setBusy(false);
    }
  }

  const fields: { key: keyof CredentialsInput; label: string; ph?: string }[] = [
    { key: 'appId', label: 'App ID' },
    { key: 'appSecret', label: 'App Secret' },
    { key: 'accessToken', label: 'Access Token' },
    { key: 'businessAccountId', label: 'IG Business Account ID' },
    { key: 'pageHandle', label: 'Page @handle (without @)', ph: 'yourpage' },
    { key: 'verifyToken', label: 'Webhook Verify Token' },
    { key: 'graphBaseUrl', label: 'Graph Base URL' },
    { key: 'graphApiVersion', label: 'Graph API Version' },
  ];

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--border, #333)', paddingTop: 12 }}>
      <div className="hint" style={{ marginBottom: 10 }}>
        {user.credentials.configured ? (
          <>
            Credentials configured (source: <b>{user.credentials.source}</b>, IG
            account <code className="inline">{user.credentials.businessAccountId}</code>).
            Fill the form to replace them — secrets are never shown back.
          </>
        ) : (
          <>No Instagram credentials set for this user yet.</>
        )}
      </div>

      {error && <div className="banner error">{error}</div>}
      {ok && <div className="banner ok">{ok}</div>}

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {fields.map((f) => (
          <div className="field" key={f.key}>
            <label>{f.label}</label>
            <input
              type="text"
              value={form[f.key] ?? ''}
              placeholder={f.ph}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button className="btn" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save credentials'}
        </button>
        {user.credentials.configured && (
          <button className="btn danger" onClick={clear} disabled={busy}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

export function UsersAdmin() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { users } = await api.listUsers();
      setUsers(users);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function replaceUser(updated: User) {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  }

  async function act(fn: () => Promise<{ user: User }>) {
    try {
      const { user } = await fn();
      replaceUser(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    }
  }

  if (loading) return <div className="empty">Loading users…</div>;

  return (
    <div>
      <div className="section-head">
        <h2>Users &amp; access requests</h2>
        <button className="btn secondary sm" onClick={load}>
          Refresh
        </button>
      </div>

      {error && <div className="banner error">{error}</div>}

      {users.length === 0 && (
        <div className="empty">No users have signed up yet.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {users.map((u) => (
          <div className="card" key={u.id}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {u.picture && (
                  <img
                    src={u.picture}
                    alt=""
                    width={36}
                    height={36}
                    style={{ borderRadius: '50%' }}
                    referrerPolicy="no-referrer"
                  />
                )}
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {u.name}{' '}
                    {u.role === 'admin' && <span className="badge on">admin</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {u.email}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <StatusBadge status={u.status} />
                {u.credentials.configured && (
                  <span className="badge kw">creds ✓</span>
                )}
              </div>
            </div>

            {u.requestNote && (
              <div className="hint" style={{ marginTop: 10 }}>
                Note: {u.requestNote}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {u.status !== 'approved' && (
                <button
                  className="btn sm"
                  onClick={() => act(() => api.setUserStatus(u.id, 'approved'))}
                >
                  Approve
                </button>
              )}
              {u.status !== 'rejected' && (
                <button
                  className="btn secondary sm"
                  onClick={() => act(() => api.setUserStatus(u.id, 'rejected'))}
                >
                  Reject
                </button>
              )}
              {u.role === 'user' ? (
                <button
                  className="btn secondary sm"
                  onClick={() => act(() => api.setUserRole(u.id, 'admin'))}
                >
                  Make admin
                </button>
              ) : (
                <button
                  className="btn secondary sm"
                  onClick={() => act(() => api.setUserRole(u.id, 'user'))}
                >
                  Revoke admin
                </button>
              )}
              <button
                className="btn secondary sm"
                onClick={() => setExpanded(expanded === u.id ? null : u.id)}
              >
                {expanded === u.id ? 'Hide credentials' : 'Set credentials'}
              </button>
            </div>

            {expanded === u.id && (
              <CredentialsForm user={u} onSaved={replaceUser} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
