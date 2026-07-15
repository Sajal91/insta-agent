import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowUpRight,
  AtSign,
  BarChart3,
  Bot,
  CheckCircle2,
  CircleSlash,
  Images,
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
import {
  IG_BG,
  IG_SOFT_CARD,
  badge,
  banner,
  btn,
  btnSm,
  card,
  cx,
  heading,
  panelHead,
  sectionHead,
  statIcon,
  statusDot,
} from '../tw';

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
  variant = 'accent',
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
    <motion.div
      className="bg-surface border border-border rounded-card shadow-sm p-5.5 flex flex-col gap-3.5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg"
      {...stagger(index)}
    >
      <div className="flex items-center justify-between">
        <span className={statIcon[variant]}>
          <Icon size={22} />
        </span>
        {delta && (
          <span
            className={cx(
              'inline-flex items-center gap-1 text-xs font-semibold',
              delta.dir === 'up'
                ? 'text-green'
                : delta.dir === 'down'
                  ? 'text-red'
                  : 'text-muted',
            )}
          >
            {delta.dir === 'up' && <TrendingUp size={14} />}
            {delta.text}
          </span>
        )}
      </div>
      <div>
        <div className="text-[30px] font-extrabold tracking-[-0.03em] leading-none">
          {value}
        </div>
        <div className="text-[13px] text-muted font-medium mt-1.5">{label}</div>
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
      <motion.div className={sectionHead} {...fadeUp}>
        <div>
          <h2 className={cx(heading, 'text-2xl')}>
            Welcome back{user.name ? `, ${user.name.split(' ')[0]}` : ''} 👋
          </h2>
          <div className="text-muted text-sm mt-1">
            Here's how your Instagram automation is performing today.
          </div>
        </div>
        <button className={btn.premium} onClick={() => onNavigate('create')}>
          <Sparkles size={18} />
          New post
        </button>
      </motion.div>

      {/* stat cards */}
      <div className="grid gap-5 grid-cols-4 max-[1100px]:grid-cols-2 max-[620px]:grid-cols-1">
        {loading
          ? [0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-surface border border-border rounded-card shadow-sm p-5.5 flex flex-col gap-3.5"
              >
                <Skeleton w={44} h={44} radius={12} />
                <Skeleton w="60%" h={28} />
                <Skeleton w="40%" h={12} />
              </div>
            ))
          : (
              <>
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
              </>
            )}
      </div>

      {/* main grid */}
      <div className="grid gap-5 items-start grid-cols-2 max-[1100px]:grid-cols-1 mt-5">
        {/* left column */}
        <div className="flex flex-col gap-4">
          <motion.div className={card} {...fadeUp}>
            <div className={panelHead}>
              <div>
                <h3 className={cx(heading, 'text-base')}>Automation activity</h3>
                <div className="text-[12.5px] text-muted">
                  Successful replies over the last 7 days
                </div>
              </div>
              <span className={badge.kw}>
                <Activity size={13} /> Live
              </span>
            </div>
            <div className="w-full h-60">
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
          <motion.div className={card} {...fadeUp}>
            <div className={panelHead}>
              <div>
                <h3 className={cx(heading, 'text-base')}>Recent activity</h3>
                <div className="text-[12.5px] text-muted">
                  Latest automation events
                </div>
              </div>
              <button
                className={cx(btn.ghost, btnSm)}
                onClick={() => onNavigate('logs')}
              >
                View all <ArrowUpRight size={15} />
              </button>
            </div>
            {loading ? (
              <div className="flex flex-col gap-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton w={34} h={34} radius={10} />
                    <div className="flex-1">
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
              <div className="flex flex-col">
                {recent.map((l) => {
                  const Icon =
                    l.status === 'success'
                      ? CheckCircle2
                      : l.status === 'error'
                        ? XCircle
                        : CircleSlash;
                  const iconCls =
                    l.status === 'success'
                      ? 'bg-green-soft text-green'
                      : l.status === 'error'
                        ? 'bg-red-soft text-red'
                        : 'bg-surface-2 text-faint';
                  return (
                    <div
                      className="flex gap-3 py-3 border-b border-border last:border-b-0"
                      key={l.id}
                    >
                      <span
                        className={cx(
                          'flex items-center justify-center w-8.5 h-8.5 rounded-[10px] shrink-0',
                          iconCls,
                        )}
                      >
                        <Icon size={17} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-medium">{l.action}</div>
                        <div className="text-xs text-muted mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap">
                          {l.message ?? l.commentId ?? 'Automation event'}
                        </div>
                      </div>
                      <span className="text-[11.5px] text-faint whitespace-nowrap shrink-0">
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
        <div className="flex flex-col gap-4">
          {/* subscription */}
          <motion.div
            className={cx(
              IG_SOFT_CARD,
              'border border-border rounded-card shadow-sm p-5.5',
            )}
            {...fadeUp}
          >
            <div className="flex items-center justify-between">
              <span
                className={cx(
                  'inline-flex items-center gap-1.5 text-xs font-bold text-white rounded-pill px-3 py-1 tracking-[0.02em]',
                  IG_BG,
                )}
              >
                <Sparkles size={13} /> PRO
              </span>
              <span className={badge.on}>Active</span>
            </div>
            <h3 className={cx(heading, 'text-lg mt-4')}>InstaPilot Pro</h3>
            <div className="text-[13px] text-muted mt-1">
              Unlimited automations & AI replies for your account.
            </div>
            <div className="mt-4.5">
              <div className="flex flex-col gap-2 mb-4.5">
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted font-medium">Monthly replies</span>
                  <span className="font-semibold">
                    {stats.dms.toLocaleString()} / 10,000
                  </span>
                </div>
                <div className="h-2 rounded-pill bg-surface-2 overflow-hidden">
                  <span
                    className={cx(
                      'block h-full rounded-pill bg-size-[200%_100%] animate-gradient-slow',
                      IG_BG,
                    )}
                    style={{
                      width: `${Math.min(100, (stats.dms / 10000) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted font-medium">Automated posts</span>
                  <span className="font-semibold">
                    {stats.configured} / {Math.max(stats.totalPosts, 25)}
                  </span>
                </div>
                <div className="h-2 rounded-pill bg-surface-2 overflow-hidden">
                  <span
                    className="block h-full rounded-pill bg-accent"
                    style={{
                      width: `${Math.min(
                        100,
                        (stats.configured / Math.max(stats.totalPosts, 25)) * 100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </motion.div>

          {/* connected account */}
          <motion.div className={card} {...fadeUp}>
            <div className={panelHead}>
              <h3 className={cx(heading, 'text-base')}>Connected account</h3>
            </div>
            <div className="flex items-center gap-3">
              <span className={cx(statIcon.ig, 'w-11.5 h-11.5')}>
                <AtSign size={22} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold">
                  {cred.pageHandle ? `@${cred.pageHandle}` : 'Instagram Business'}
                </div>
                <div className="text-[12.5px] text-muted">
                  {cred.configured
                    ? `Connected · ${cred.source}`
                    : 'Not connected yet'}
                </div>
              </div>
              <span className={statusDot(cred.configured ? 'ok' : 'down')} />
            </div>
            {!cred.configured && (
              <div className={cx(banner.warn, 'mt-4 mb-0')}>
                An admin needs to configure your Instagram credentials before
                automations can run.
              </div>
            )}
          </motion.div>

          {/* quick actions */}
          <motion.div className={card} {...fadeUp}>
            <div className={panelHead}>
              <h3 className={cx(heading, 'text-base')}>Quick actions</h3>
            </div>
            <div className="grid gap-3 grid-cols-2 max-[620px]:grid-cols-1">
              <QuickAction
                icon={PlusCircle}
                title="Create post"
                desc="Publish to Instagram"
                onClick={() => onNavigate('create')}
              />
              <QuickAction
                icon={Zap}
                title="Automations"
                desc="Set up auto-replies"
                onClick={() => onNavigate('posts')}
              />
              <QuickAction
                icon={MessageSquareText}
                title="Templates"
                desc="Edit default messages"
                onClick={() => onNavigate('templates')}
              />
              {isAdmin ? (
                <QuickAction
                  icon={UsersIcon}
                  title="Users"
                  desc={userCount !== null ? `${userCount} members` : 'Manage access'}
                  onClick={() => onNavigate('users')}
                />
              ) : (
                <QuickAction
                  icon={Activity}
                  title="Activity"
                  desc="View full log"
                  onClick={() => onNavigate('logs')}
                />
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex items-center gap-3 p-4 rounded-btn border border-border bg-surface cursor-pointer text-left transition duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-accent"
      onClick={onClick}
    >
      <span className="flex items-center justify-center w-9.5 h-9.5 rounded-[10px] bg-accent-soft text-accent shrink-0">
        <Icon size={20} />
      </span>
      <span>
        <span className="block text-[13.5px] font-semibold">{title}</span>
        <span className="block text-xs text-muted">{desc}</span>
      </span>
    </button>
  );
}
