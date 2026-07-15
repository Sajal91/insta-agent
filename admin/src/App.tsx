import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Images,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  PlusCircle,
  Users as UsersIcon,
  X,
  type LucideIcon,
} from 'lucide-react';
import { api, clearToken, getToken } from './api';
import type { User } from './types';
import { Login } from './components/Login';
import { PostsList } from './components/PostsList';
import { CreatePost } from './components/CreatePost';
import { TemplatesEditor } from './components/TemplatesEditor';
import { LogsView } from './components/LogsView';
import { UsersAdmin } from './components/UsersAdmin';
import { RequestAutomation } from './components/RequestAutomation';
import { Dashboard } from './components/Dashboard';
import {
  BrandMark,
  BrandName,
  LoadingBlock,
  PoweredBy,
  fadeUp,
} from './components/ui';
import {
  avatar,
  avatarFallback,
  badge,
  chip,
  cx,
  heading,
  statusDot,
} from './tw';

type Tab = 'dashboard' | 'users' | 'posts' | 'create' | 'templates' | 'logs';

type NavItem = {
  id: Tab;
  label: string;
  icon: LucideIcon;
  section: 'main' | 'workspace' | 'admin';
};

const PAGE_META: Record<Tab, { title: string; sub: string }> = {
  dashboard: { title: 'Dashboard', sub: 'Your automation at a glance' },
  posts: { title: 'Posts & Reels', sub: 'Manage auto-replies on your content' },
  create: { title: 'Create Post', sub: 'Publish new content to Instagram' },
  templates: { title: 'Templates', sub: 'Default DM & reply messages' },
  logs: { title: 'Activity Log', sub: 'Every automation event, tracked' },
  users: { title: 'Users', sub: 'Access requests & credentials' },
};

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

function Avatar({ user, size = 30 }: { user: User; size?: number }) {
  if (user.picture) {
    return (
      <img
        className={avatar}
        src={user.picture}
        alt=""
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      className={cx(avatarFallback, 'text-[13px]')}
      style={{ width: size, height: size }}
    >
      {initials(user.name)}
    </span>
  );
}

export function App() {
  const [authState, setAuthState] = useState<'checking' | 'out' | 'in'>(
    'checking',
  );
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [health, setHealth] = useState<'unknown' | 'ok' | 'down'>('unknown');
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      setAuthState('out');
      return;
    }
    api
      .me()
      .then(({ user }) => {
        setUser(user);
        setAuthState('in');
      })
      .catch(() => {
        clearToken();
        setAuthState('out');
      });
  }, []);

  useEffect(() => {
    if (authState !== 'in') return;
    api
      .health()
      .then(() => setHealth('ok'))
      .catch(() => setHealth('down'));
  }, [authState]);

  function logout() {
    clearToken();
    setUser(null);
    setAuthState('out');
  }

  if (authState === 'checking') {
    return <LoadingBlock label="Loading InstaPilot…" />;
  }

  if (authState === 'out' || !user) {
    return (
      <Login
        onSuccess={(loggedIn) => {
          setUser(loggedIn);
          setAuthState('in');
        }}
      />
    );
  }

  const isAdmin = user.role === 'admin';
  const canAutomate = isAdmin || user.status === 'approved';

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'main' },
    ...(canAutomate
      ? ([
          { id: 'posts', label: 'Posts & Reels', icon: Images, section: 'workspace' },
          { id: 'create', label: 'Create post', icon: PlusCircle, section: 'workspace' },
          { id: 'templates', label: 'Templates', icon: MessageSquareText, section: 'workspace' },
          { id: 'logs', label: 'Activity log', icon: Activity, section: 'workspace' },
        ] as NavItem[])
      : []),
    ...(isAdmin
      ? ([{ id: 'users', label: 'Users', icon: UsersIcon, section: 'admin' }] as NavItem[])
      : []),
  ];

  const activeTab: Tab = navItems.some((n) => n.id === tab)
    ? tab
    : navItems[0]?.id ?? 'dashboard';

  function go(next: Tab) {
    setTab(next);
    setMenuOpen(false);
  }

  const meta = PAGE_META[activeTab];

  return (
    <UserMenuScroll onScrolled={setScrolled}>
      <div className="flex min-h-screen">
        {menuOpen && (
          <div
            className="fixed inset-0 z-39 bg-[rgba(17,24,39,0.4)] backdrop-blur-[2px]"
            onClick={() => setMenuOpen(false)}
          />
        )}
        <aside
          className={cx(
            'fixed top-0 left-0 bottom-0 w-66 z-40 flex flex-col px-4 py-5 bg-surface border-r border-border transition-transform duration-240 ease-out max-[900px]:-translate-x-full max-[900px]:shadow-lg',
            menuOpen && 'max-[900px]:translate-x-0',
          )}
        >
          <div className="flex items-center gap-2.5 pt-1.5 px-2 pb-4.5">
            <BrandMark size={38} />
            <BrandName />
          </div>

          <nav className="flex flex-col gap-1 flex-1">
            <Section items={navItems} section="main" active={activeTab} onGo={go} />
            {navItems.some((n) => n.section === 'workspace') && (
              <>
                <div className="text-[11px] uppercase tracking-[0.08em] text-faint font-semibold px-2.5 pt-4 pb-2">
                  Workspace
                </div>
                <Section items={navItems} section="workspace" active={activeTab} onGo={go} />
              </>
            )}
            {navItems.some((n) => n.section === 'admin') && (
              <>
                <div className="text-[11px] uppercase tracking-[0.08em] text-faint font-semibold px-2.5 pt-4 pb-2">
                  Admin
                </div>
                <Section items={navItems} section="admin" active={activeTab} onGo={go} />
              </>
            )}
          </nav>

          <div className="border-t border-border pt-3.5 mt-2">
            <PoweredBy />
          </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col ml-66 max-[900px]:ml-0">
          <header
            className={cx(
              'sticky top-0 z-30 h-16 flex items-center justify-between gap-4 px-7 max-[620px]:px-4 border-b border-transparent transition-[background-color,border-color,backdrop-filter] duration-240',
              scrolled &&
                'bg-white/70 backdrop-blur-md backdrop-saturate-[1.8] border-b-border',
            )}
          >
            <div className="flex items-center gap-3.5">
              <button
                className="hidden max-[900px]:flex items-center justify-center w-10 h-10 rounded-btn border border-border bg-surface text-text cursor-pointer"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Toggle menu"
              >
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
              <div className="flex flex-col min-w-0">
                <h1 className={cx(heading, 'text-xl leading-[1.2] max-[620px]:text-[17px]')}>
                  {meta.title}
                </h1>
                <span className="text-[12.5px] text-muted">{meta.sub}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <span className={chip}>
                <span className={statusDot(health)} />
                {health === 'ok'
                  ? 'All systems go'
                  : health === 'down'
                    ? 'API offline'
                    : 'Checking…'}
              </span>

              <div className="relative">
                <button
                  className="flex items-center gap-2 py-1.25 pl-1.25 pr-2.5 rounded-pill border border-border bg-surface text-[13px] text-text cursor-pointer transition-[box-shadow,border-color] duration-150 hover:shadow-sm hover:border-border-strong"
                  onClick={() => setUserMenu((v) => !v)}
                >
                  <Avatar user={user} />
                  <span className="max-w-30 overflow-hidden text-ellipsis whitespace-nowrap">
                    {user.name?.split(' ')[0] ?? 'Account'}
                  </span>
                </button>
                <AnimatePresence>
                  {userMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-45"
                        onClick={() => setUserMenu(false)}
                      />
                      <motion.div
                        className="absolute right-0 top-[calc(100%+8px)] min-w-60 z-50 bg-surface border border-border rounded-card shadow-lg p-2"
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.16 }}
                      >
                        <div className="px-2.5 pt-2 pb-2.5 border-b border-border mb-1.5">
                          <div className="font-semibold">
                            {user.name}
                            {isAdmin && (
                              <span className={cx(badge.kw, 'ml-2')}>admin</span>
                            )}
                          </div>
                          <div className="text-xs text-muted break-all">
                            {user.email}
                          </div>
                        </div>
                        <button
                          className="flex items-center gap-2.5 w-full px-2.5 py-2.5 rounded-btn text-[13.5px] text-red cursor-pointer text-left hover:bg-red-soft"
                          onClick={logout}
                        >
                          <LogOut size={16} /> Log out
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </header>

          <main className="w-full px-7 pt-6 pb-18 max-[620px]:px-4 max-[620px]:pt-4 max-[620px]:pb-14">
            {!canAutomate && !isAdmin && activeTab === 'dashboard' ? (
              <motion.div {...fadeUp}>
                <RequestAutomation user={user} onUpdated={setUser} />
              </motion.div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  {activeTab === 'dashboard' && (
                    <Dashboard user={user} onNavigate={(k) => go(k as Tab)} />
                  )}
                  {activeTab === 'users' && <UsersAdmin />}
                  {activeTab === 'posts' && <PostsList />}
                  {activeTab === 'create' && <CreatePost />}
                  {activeTab === 'templates' && <TemplatesEditor />}
                  {activeTab === 'logs' && <LogsView />}
                </motion.div>
              </AnimatePresence>
            )}
          </main>
        </div>
      </div>
    </UserMenuScroll>
  );
}

function Section({
  items,
  section,
  active,
  onGo,
}: {
  items: NavItem[];
  section: NavItem['section'];
  active: Tab;
  onGo: (t: Tab) => void;
}) {
  return (
    <>
      {items
        .filter((n) => n.section === section)
        .map((n) => {
          const Icon = n.icon;
          const isActive = active === n.id;
          return (
            <button
              key={n.id}
              onClick={() => onGo(n.id)}
              className={cx(
                'group flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-btn text-sm font-sans cursor-pointer relative transition-colors duration-150',
                isActive
                  ? 'bg-accent-soft text-accent font-semibold'
                  : 'text-muted font-medium hover:bg-surface-2 hover:text-text',
              )}
            >
              <Icon
                size={20}
                strokeWidth={2}
                className={cx(
                  'shrink-0',
                  isActive ? 'text-accent' : 'text-faint group-hover:text-muted',
                )}
              />
              {n.label}
            </button>
          );
        })}
    </>
  );
}

/** Tracks window scroll to toggle the sticky topbar's translucent state. */
function UserMenuScroll({
  children,
  onScrolled,
}: {
  children: React.ReactNode;
  onScrolled: (v: boolean) => void;
}) {
  useEffect(() => {
    const el = document.querySelector('main') as HTMLElement | null;
    function onScroll() {
      onScrolled(window.scrollY > 8);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    el?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      el?.removeEventListener('scroll', onScroll);
    };
  }, [onScrolled]);
  return <>{children}</>;
}
