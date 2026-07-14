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
import {
  avatar,
  avatarFallback,
  badge,
  btn,
  btnSm,
  card,
  cx,
  field,
  heading,
  hint,
  input,
  label,
  sectionHead,
} from '../tw';

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
    none: badge.default,
    pending: badge.kw,
    approved: badge.on,
    rejected: badge.off,
  };
  return <span className={map[status]}>{status}</span>;
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
      className="border-t border-border pt-[18px] mt-[18px] overflow-hidden"
    >
      <div className={cx(hint, 'mb-3.5 mt-0')}>
        {user.credentials.configured ? (
          <>
            Credentials configured (source: <b>{user.credentials.source}</b>, IG
            account{' '}
            <code className="bg-surface-2 border border-border text-accent px-1.5 py-px rounded-md text-xs font-mono">
              {user.credentials.businessAccountId}
            </code>
            ). Fill the form to replace them — secrets are never shown back.
          </>
        ) : (
          <>No Instagram credentials set for this user yet.</>
        )}
      </div>

      {error && <Banner kind="error">{error}</Banner>}
      {ok && <Banner kind="ok">{ok}</Banner>}

      <div className="grid grid-cols-2 gap-3.5 max-[620px]:grid-cols-1">
        {fields.map((f) => (
          <div className={cx(field, 'mb-0')} key={f.key}>
            <label className={label}>{f.label}</label>
            <input
              type="text"
              className={input}
              value={form[f.key] ?? ''}
              placeholder={f.ph}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2.5 mt-4">
        <button className={btn.primary} onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save credentials'}
        </button>
        {user.credentials.configured && (
          <button className={btn.danger} onClick={clear} disabled={busy}>
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
      <div className={sectionHead}>
        <div>
          <h2 className={cx(heading, 'text-2xl')}>Users &amp; access</h2>
          <div className="text-muted text-sm mt-1">
            Approve requests and manage Instagram credentials.
          </div>
        </div>
        <button className={btn.secondary} onClick={load}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      {users.length === 0 ? (
        <div className={card}>
          <EmptyState icon={UsersIcon} title="No users yet">
            Nobody has signed up yet. New sign-ups will appear here for approval.
          </EmptyState>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {users.map((u, i) => (
            <motion.div className={card} key={u.id} {...stagger(i)}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3.5">
                  {u.picture ? (
                    <img
                      className={avatar}
                      src={u.picture}
                      alt=""
                      style={{ width: 44, height: 44 }}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span
                      className={cx(avatarFallback, 'text-sm')}
                      style={{ width: 44, height: 44 }}
                    >
                      {initials(u.name)}
                    </span>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{u.name}</span>
                      {u.role === 'admin' && (
                        <span className={badge.kw}>admin</span>
                      )}
                    </div>
                    <div className="text-[13px] text-muted">{u.email}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={u.status} />
                  {u.credentials.configured && (
                    <span className={badge.on}>
                      <KeyRound size={12} /> creds
                    </span>
                  )}
                </div>
              </div>

              {u.requestNote && (
                <div className={cx(hint, 'mt-3')}>Note: {u.requestNote}</div>
              )}

              <div className="flex items-center gap-2 flex-wrap mt-4">
                {u.status !== 'approved' && (
                  <button
                    className={cx(btn.primary, btnSm)}
                    onClick={() => act(() => api.setUserStatus(u.id, 'approved'))}
                  >
                    <Check size={15} /> Approve
                  </button>
                )}
                {u.status !== 'rejected' && (
                  <button
                    className={cx(btn.secondary, btnSm)}
                    onClick={() => act(() => api.setUserStatus(u.id, 'rejected'))}
                  >
                    <X size={15} /> Reject
                  </button>
                )}
                {u.role === 'user' ? (
                  <button
                    className={cx(btn.secondary, btnSm)}
                    onClick={() => act(() => api.setUserRole(u.id, 'admin'))}
                  >
                    <Shield size={15} /> Make admin
                  </button>
                ) : (
                  <button
                    className={cx(btn.secondary, btnSm)}
                    onClick={() => act(() => api.setUserRole(u.id, 'user'))}
                  >
                    <ShieldOff size={15} /> Revoke admin
                  </button>
                )}
                <button
                  className={cx(btn.ghost, btnSm)}
                  onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                >
                  <UserCheck size={15} />
                  {expanded === u.id ? 'Hide credentials' : 'Set credentials'}
                  <ChevronDown
                    size={15}
                    className={cx(
                      'transition-transform duration-200',
                      expanded === u.id && 'rotate-180',
                    )}
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
