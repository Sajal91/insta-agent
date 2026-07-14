import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Bot,
  CheckCircle2,
  CircleSlash,
  Images,
  AtSign,
  MessageSquareText,
  PlusCircle,
  Send,
  Sparkles,
  TrendingUp,
  Users as UsersIcon,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api';
import type { LogEntry, MediaItem, User } from '../types';
import { EmptyState, Skeleton, fadeUp, stagger } from './ui';

type NavKey =
  | 'dashboard'
  | 'posts'
  | 'create'
  | 'templates'
  | 'logs'
  | 'users';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function StatCard({
  icon: Icon,
  variant,
  label,
  value,
  delta,
  index,
}: {
  icon: LucideIcon;
  variant?: 'accent' | 'ig' | 'green' | 'amber';
  label: string;
  value: string | number;
  delta?: { dir: 'up' | 'down' | 'flat'; text: string };
  index: number;
}) {
  return (
    <motion.div className="stat-card" {...stagger(index)}>
      <div className="stat-top">
        <span className={`stat-icon ${variant === 'accent' ? '' : variant ?? ''}`}>
          <Icon size={22} />
        </span>
        {delta && (
          <span className={`stat-delta ${delta.dir}`}>
            {delta.dir === 'up' && <TrendingUp size={14} />}
            {delta.text}
          </span>
        )}
      </div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label" style={{ marginTop: 6 }}>
          {label}
        </div>
      </div>
    </motion.div>
  );
}

export function Dashboard({
  user,
  onNavigate,
}: {
  user: User;
  onNavigate: (key: NavKey) => void;
}) {
  const [media, setMedia] = useState<MediaItem[] | null>(null);
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [userCount, setUserCount] = useState<number | null>(null);

  const isAdmin = user.role === 'admin';

  useEffect(() => {
    let alive = true;
    api
      .listMedia()
      .then(({ items }) => alive && setMedia(items))
      .catch(() => alive && setMedia([]));
    api
      .getLogs(100, 0)
      .then(({ items }) => alive && setLogs(items))
      .catch(() => alive && setLogs([]));
    if (isAdmin) {
      api
        .listUsers()
        .then(({ users }) => alive && setUserCount(users.length))
        .catch(() => alive && setUserCount(null));
    }
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  const stats = useMemo(() => {
    const posts = media ?? [];
    const configured = posts.filter((m) => m.config);
    const active = configured.filter((m) => m.config?.enabled);
    const entries = logs ?? [];
    const success = entries.filter((l) => l.status === 'success').length;
    const errors = entries.filter((l) => l.status === 'error').length;
    const acted = success + errors;
    const rate = acted ? Math.round((success / acted) * 100) : 100;
    const dms = entries.filter(
      (l) => l.status === 'success' && /dm|message|send/i.test(l.action),
    ).length;
    return {
      totalPosts: posts.length,
      configured: configured.length,
      active: active.length,
      success,
      errors,
      rate,
      dms: dms || success,
    };
  }, [media, logs]);

  const chartData = useMemo(() => {
    const days: { label: string; key: string; replies: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({
        label: d.toLocaleDateString(undefined, { weekday: 'short' }),
        key: d.toISOString().slice(0, 10),
        replies: 0,
      });
    }
    const map = new Map(days.map((d) => [d.key, d]));
    (logs ?? []).forEach((l) => {
      if (l.status !== 'success') return;
      const key = new Date(l.createdAt).toISOString().slice(0, 10);
      const bucket = map.get(key);
      if (bucket) bucket.replies += 1;
    });
    return days;
  }, [logs]);

  const recent = (logs ?? []).slice(0, 6);
  const loading = media === null || logs === null;

  const cred = user.credentials;

  return (
    <div>
      <motion.div className="section-head" {...fadeUp}>
        <div className="titles">
          <h2>
            Welcome back{user.name ? `, ${user.name.split(' ')[0]}` : ''} 👋
          </h2>
          <div className="sub">
            Here's how your Instagram automation is performing today.
          </div>
        </div>
        <button className="btn premium" onClick={() => onNavigate('create')}>
          <Sparkles size={18} />
          New post
        </button>
      </motion.div>

      {/* stat cards */}
      {loading ? (
        <div className="stat-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="stat-card">
              <Skeleton w={44} h={44} radius={12} />
              <Skeleton w="60%" h={28} />
              <Skeleton w="40%" h={12} />
            </div>
          ))}
        </div>
      ) : (
        <div className="stat-grid">
          <StatCard
            index={0}
            icon={Images}
            variant="accent"
            label="Total posts & reels"
            value={stats.totalPosts}
          />
          <StatCard
            index={1}
            icon={Bot}
            variant="ig"
            label="Active automations"
            value={stats.active}
            delta={{ dir: 'up', text: `${stats.configured} configured` }}
          />
          <StatCard
            index={2}
            icon={Send}
            variant="green"
            label="Replies sent"
            value={stats.dms}
          />
          <StatCard
            index={3}
            icon={BarChart3}
            variant="amber"
            label="Success rate"
            value={`${stats.rate}%`}
          />
        </div>
      )}

      {/* main grid */}
      <div className="dash-grid" style={{ marginTop: 20 }}>
        {/* left column */}
        <div className="stack">
          <motion.div className="card" {...fadeUp}>
            <div className="panel-head">
              <div>
                <h3>Automation activity</h3>
                <div className="sub">Successful replies over the last 7 days</div>
              </div>
              <span className="badge kw">
                <Activity size={13} /> Live
              </span>
            </div>
            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 6, right: 6, left: -18, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="fillReplies" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#7C3AED" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#E4E4E7"
                  />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#9CA3AF', fontSize: 12 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    tick={{ fill: '#9CA3AF', fontSize: 12 }}
                    width={40}
                  />
                  <Tooltip
                    cursor={{ stroke: '#7C3AED', strokeWidth: 1, strokeDasharray: '4 4' }}
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid #E4E4E7',
                      boxShadow: '0 10px 30px rgba(0,0,0,.08)',
                      fontSize: 13,
                    }}
                    labelStyle={{ color: '#111827', fontWeight: 600 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="replies"
                    stroke="#7C3AED"
                    strokeWidth={2.5}
                    fill="url(#fillReplies)"
                    name="Replies"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* recent activity */}
          <motion.div className="card" {...fadeUp}>
            <div className="panel-head">
              <div>
                <h3>Recent activity</h3>
                <div className="sub">Latest automation events</div>
              </div>
              <button
                className="btn ghost sm"
                onClick={() => onNavigate('logs')}
              >
                View all <ArrowUpRight size={15} />
              </button>
            </div>
            {loading ? (
              <div className="stack">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex" style={{ gap: 12 }}>
                    <Skeleton w={34} h={34} radius={10} />
                    <div className="grow">
                      <Skeleton w="50%" h={13} />
                      <Skeleton w="30%" h={11} style={{ marginTop: 6 }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : recent.length === 0 ? (
              <EmptyState icon={Activity} title="No activity yet">
                Once your automations start replying, events will appear here.
              </EmptyState>
            ) : (
              <div className="activity">
                {recent.map((l) => {
                  const Icon =
                    l.status === 'success'
                      ? CheckCircle2
                      : l.status === 'error'
                        ? XCircle
                        : CircleSlash;
                  return (
                    <div className="activity-item" key={l.id}>
                      <span className={`activity-icon ${l.status}`}>
                        <Icon size={17} />
                      </span>
                      <div className="activity-body">
                        <div className="a-title">{l.action}</div>
                        <div className="a-meta">
                          {l.message ?? l.commentId ?? 'Automation event'}
                        </div>
                      </div>
                      <span className="activity-time">
                        {timeAgo(l.createdAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>

        {/* right column */}
        <div className="stack">
          {/* subscription */}
          <motion.div className="sub-card" {...fadeUp}>
            <div className="flex between">
              <span className="plan">
                <Sparkles size={13} /> PRO
              </span>
              <span className="badge on">Active</span>
            </div>
            <h3 style={{ marginTop: 16, fontSize: 18 }}>InstaPilot Pro</h3>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              Unlimited automations & AI replies for your account.
            </div>
            <div style={{ marginTop: 18 }}>
              <div className="usage-row">
                <div className="usage-meta">
                  <span className="lbl">Monthly replies</span>
                  <span className="val">
                    {stats.dms.toLocaleString()} / 10,000
                  </span>
                </div>
                <div className="progress">
                  <span
                    style={{
                      width: `${Math.min(100, (stats.dms / 10000) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="usage-row">
                <div className="usage-meta">
                  <span className="lbl">Automated posts</span>
                  <span className="val">
                    {stats.configured} / {Math.max(stats.totalPosts, 25)}
                  </span>
                </div>
                <div className="progress">
                  <span
                    className="plain"
                    style={{
                      width: `${Math.min(
                        100,
                        (stats.configured / Math.max(stats.totalPosts, 25)) *
                          100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </motion.div>

          {/* connected account */}
          <motion.div className="card" {...fadeUp}>
            <div className="panel-head">
              <h3>Connected account</h3>
            </div>
            <div className="flex" style={{ gap: 12 }}>
              <span
                className="stat-icon ig"
                style={{ width: 46, height: 46 }}
              >
                <AtSign size={22} />
              </span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>
                  {cred.pageHandle ? `@${cred.pageHandle}` : 'Instagram Business'}
                </div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {cred.configured
                    ? `Connected · ${cred.source}`
                    : 'Not connected yet'}
                </div>
              </div>
              <span className={`status-dot ${cred.configured ? 'ok' : 'down'}`} />
            </div>
            {!cred.configured && (
              <div className="banner warn" style={{ margin: '16px 0 0' }}>
                An admin needs to configure your Instagram credentials before
                automations can run.
              </div>
            )}
          </motion.div>

          {/* quick actions */}
          <motion.div className="card" {...fadeUp}>
            <div className="panel-head">
              <h3>Quick actions</h3>
            </div>
            <div className="quick-actions">
              <button
                className="quick-action"
                onClick={() => onNavigate('create')}
              >
                <span className="qa-icon">
                  <PlusCircle size={20} />
                </span>
                <span className="qa-text">
                  <div className="t">Create post</div>
                  <div className="d">Publish to Instagram</div>
                </span>
              </button>
              <button
                className="quick-action"
                onClick={() => onNavigate('posts')}
              >
                <span className="qa-icon">
                  <Zap size={20} />
                </span>
                <span className="qa-text">
                  <div className="t">Automations</div>
                  <div className="d">Set up auto-replies</div>
                </span>
              </button>
              <button
                className="quick-action"
                onClick={() => onNavigate('templates')}
              >
                <span className="qa-icon">
                  <MessageSquareText size={20} />
                </span>
                <span className="qa-text">
                  <div className="t">Templates</div>
                  <div className="d">Edit default messages</div>
                </span>
              </button>
              {isAdmin ? (
                <button
                  className="quick-action"
                  onClick={() => onNavigate('users')}
                >
                  <span className="qa-icon">
                    <UsersIcon size={20} />
                  </span>
                  <span className="qa-text">
                    <div className="t">Users</div>
                    <div className="d">
                      {userCount !== null ? `${userCount} members` : 'Manage access'}
                    </div>
                  </span>
                </button>
              ) : (
                <button
                  className="quick-action"
                  onClick={() => onNavigate('logs')}
                >
                  <span className="qa-icon">
                    <Activity size={20} />
                  </span>
                  <span className="qa-text">
                    <div className="t">Activity</div>
                    <div className="d">View full log</div>
                  </span>
                </button>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
