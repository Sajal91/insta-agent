import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AtSign,
  RefreshCw,
  Shield,
  ShieldOff,
  Users as UsersIcon,
} from 'lucide-react';
import { api } from '../api';
import type { SubscriptionStatus, User } from '../types';
import { Banner, EmptyState, LoadingBlock, stagger, useToast } from './ui';
import {
  avatar,
  avatarFallback,
  badge,
  btn,
  btnSm,
  card,
  cx,
  heading,
  sectionHead,
} from '../tw';

const SUB_BADGE_LABEL: Record<SubscriptionStatus, string> = {
  none: 'no sub',
  created: 'sub: pending',
  active: 'sub: active',
  past_due: 'sub: due',
  paused: 'sub: paused',
  cancelled: 'sub: cancelled',
};

function SubscriptionBadge({ status }: { status: SubscriptionStatus }) {
  // A never-subscribed user adds noise; only surface once billing has started.
  if (status === 'none') return null;
  const map: Record<SubscriptionStatus, string> = {
    none: badge.default,
    created: badge.kw,
    active: badge.on,
    past_due: badge.kw,
    paused: badge.off,
    cancelled: badge.off,
  };
  return <span className={map[status]}>{SUB_BADGE_LABEL[status]}</span>;
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

export function UsersAdmin() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
            Manage roles and review connection &amp; subscription status.
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
            Nobody has signed up yet. New sign-ups will appear here.
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
                  {u.credentials.configured ? (
                    <span className={badge.on}>
                      <AtSign size={12} />
                      {u.credentials.pageHandle
                        ? `@${u.credentials.pageHandle}`
                        : 'connected'}
                    </span>
                  ) : (
                    <span className={badge.default}>not connected</span>
                  )}
                  <SubscriptionBadge status={u.subscription.status} />
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap mt-4">
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
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
