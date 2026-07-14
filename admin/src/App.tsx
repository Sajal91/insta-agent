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
        className="avatar"
        src={user.picture}
        alt=""
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span className="avatar fallback" style={{ width: size, height: size }}>
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
      <div className="shell">
        {/* Sidebar */}
        {menuOpen && (
          <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />
        )}
        <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
          <div className="sidebar-brand">
            <BrandMark size={38} />
            <BrandName />
          </div>

          <nav className="nav">
            <Section items={navItems} section="main" active={activeTab} onGo={go} />
            {navItems.some((n) => n.section === 'workspace') && (
              <>
                <div className="nav-section">Workspace</div>
                <Section items={navItems} section="workspace" active={activeTab} onGo={go} />
              </>
            )}
            {navItems.some((n) => n.section === 'admin') && (
              <>
                <div className="nav-section">Admin</div>
                <Section items={navItems} section="admin" active={activeTab} onGo={go} />
              </>
            )}
          </nav>

          <div className="sidebar-footer">
            <PoweredBy />
          </div>
        </aside>

        {/* Main */}
        <div className="main">
          <header className={`topbar${scrolled ? ' scrolled' : ''}`}>
            <div className="flex" style={{ gap: 14 }}>
              <button
                className="menu-btn"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Toggle menu"
              >
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
              <div className="topbar-title">
                <h1>{meta.title}</h1>
                <span className="sub">{meta.sub}</span>
              </div>
            </div>

            <div className="topbar-actions">
              <span className="chip">
                <span className={`status-dot ${health}`} />
                {health === 'ok'
                  ? 'All systems go'
                  : health === 'down'
                    ? 'API offline'
                    : 'Checking…'}
              </span>

              <div className="user-menu">
                <button
                  className="user-trigger"
                  onClick={() => setUserMenu((v) => !v)}
                >
                  <Avatar user={user} />
                  <span
                    style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {user.name?.split(' ')[0] ?? 'Account'}
                  </span>
                </button>
                <AnimatePresence>
                  {userMenu && (
                    <>
                      <div
                        style={{ position: 'fixed', inset: 0, zIndex: 45 }}
                        onClick={() => setUserMenu(false)}
                      />
                      <motion.div
                        className="dropdown"
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.16 }}
                      >
                        <div className="dd-head">
                          <div className="nm">
                            {user.name}
                            {isAdmin && (
                              <span className="badge kw" style={{ marginLeft: 8 }}>
                                admin
                              </span>
                            )}
                          </div>
                          <div className="em">{user.email}</div>
                        </div>
                        <button
                          className="dropdown-item danger"
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

          <main className="content">
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
          return (
            <button
              key={n.id}
              className={`nav-item${active === n.id ? ' active' : ''}`}
              onClick={() => onGo(n.id)}
            >
              <Icon size={20} strokeWidth={2} />
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
    const el = document.querySelector('.content') as HTMLElement | null;
    function onScroll() {
      onScrolled(window.scrollY > 8);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    // content may scroll internally on some layouts
    el?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      el?.removeEventListener('scroll', onScroll);
    };
  }, [onScrolled]);
  return <>{children}</>;
}
