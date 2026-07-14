import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  ChevronDown,
  KeyRound,
  RefreshCw,
  Shield,
  ShieldOff,
  Trash2,
  UserCheck,
  Users as UsersIcon,
  X,
} from 'lucide-react';
import { api } from '../api';
import type { AutomationStatus, CredentialsInput, User } from '../types';
import { Banner, EmptyState, LoadingBlock, stagger, useToast } from './ui';

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
    none: '',
    pending: 'kw',
    approved: 'on',
    rejected: 'off',
  };
  return <span className={`badge ${map[status]}`}>{status}</span>;
}

function initials(name: string): string {
  return (
    name
      .split(' ')
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'U'
  );
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
  const toast = useToast();

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
      toast.push('ok', 'Credentials saved');
      onSaved(updated);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save credentials';
      setError(msg);
      toast.push('error', msg);
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
      toast.push('info', 'Credentials removed');
      onSaved(updated);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to remove credentials';
      setError(msg);
      toast.push('error', msg);
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
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22 }}
      style={{
        marginTop: 18,
        borderTop: '1px solid var(--border)',
        paddingTop: 18,
        overflow: 'hidden',
      }}
    >
      <div className="hint" style={{ marginBottom: 14 }}>
        {user.credentials.configured ? (
          <>
            Credentials configured (source: <b>{user.credentials.source}</b>, IG
            account{' '}
            <code className="inline">{user.credentials.businessAccountId}</code>).
            Fill the form to replace them — secrets are never shown back.
          </>
        ) : (
          <>No Instagram credentials set for this user yet.</>
        )}
      </div>

      {error && <Banner kind="error">{error}</Banner>}
      {ok && <Banner kind="ok">{ok}</Banner>}

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {fields.map((f) => (
          <div className="field" key={f.key} style={{ marginBottom: 0 }}>
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

      <div className="flex" style={{ gap: 10, marginTop: 16 }}>
        <button className="btn" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save credentials'}
        </button>
        {user.credentials.configured && (
          <button className="btn danger" onClick={clear} disabled={busy}>
            <Trash2 size={15} /> Remove
          </button>
        )}
      </div>
    </motion.div>
  );
}

export function UsersAdmin() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const toast = useToast();

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
      const msg = e instanceof Error ? e.message : 'Action failed';
      setError(msg);
      toast.push('error', msg);
    }
  }

  if (loading) return <LoadingBlock label="Loading users…" />;

  return (
    <div>
      <div className="section-head">
        <div className="titles">
          <h2>Users &amp; access</h2>
          <div className="sub">Approve requests and manage Instagram credentials.</div>
        </div>
        <button className="btn secondary" onClick={load}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      {users.length === 0 ? (
        <div className="card">
          <EmptyState icon={UsersIcon} title="No users yet">
            Nobody has signed up yet. New sign-ups will appear here for approval.
          </EmptyState>
        </div>
      ) : (
        <div className="stack">
          {users.map((u, i) => (
            <motion.div className="card" key={u.id} {...stagger(i)}>
              <div className="flex between flex-wrap" style={{ gap: 12 }}>
                <div className="flex" style={{ gap: 14 }}>
                  {u.picture ? (
                    <img
                      className="avatar"
                      src={u.picture}
                      alt=""
                      style={{ width: 44, height: 44 }}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span
                      className="avatar fallback"
                      style={{ width: 44, height: 44 }}
                    >
                      {initials(u.name)}
                    </span>
                  )}
                  <div>
                    <div className="flex" style={{ gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{u.name}</span>
                      {u.role === 'admin' && (
                        <span className="badge kw">admin</span>
                      )}
                    </div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {u.email}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap" style={{ gap: 8 }}>
                  <StatusBadge status={u.status} />
                  {u.credentials.configured && (
                    <span className="badge on">
                      <KeyRound size={12} /> creds
                    </span>
                  )}
                </div>
              </div>

              {u.requestNote && (
                <div className="hint" style={{ marginTop: 12 }}>
                  Note: {u.requestNote}
                </div>
              )}

              <div className="flex flex-wrap" style={{ gap: 8, marginTop: 16 }}>
                {u.status !== 'approved' && (
                  <button
                    className="btn sm"
                    onClick={() => act(() => api.setUserStatus(u.id, 'approved'))}
                  >
                    <Check size={15} /> Approve
                  </button>
                )}
                {u.status !== 'rejected' && (
                  <button
                    className="btn secondary sm"
                    onClick={() => act(() => api.setUserStatus(u.id, 'rejected'))}
                  >
                    <X size={15} /> Reject
                  </button>
                )}
                {u.role === 'user' ? (
                  <button
                    className="btn secondary sm"
                    onClick={() => act(() => api.setUserRole(u.id, 'admin'))}
                  >
                    <Shield size={15} /> Make admin
                  </button>
                ) : (
                  <button
                    className="btn secondary sm"
                    onClick={() => act(() => api.setUserRole(u.id, 'user'))}
                  >
                    <ShieldOff size={15} /> Revoke admin
                  </button>
                )}
                <button
                  className="btn ghost sm"
                  onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                >
                  <UserCheck size={15} />
                  {expanded === u.id ? 'Hide credentials' : 'Set credentials'}
                  <ChevronDown
                    size={15}
                    style={{
                      transform: expanded === u.id ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s ease',
                    }}
                  />
                </button>
              </div>

              {expanded === u.id && (
                <CredentialsForm user={u} onSaved={replaceUser} />
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
