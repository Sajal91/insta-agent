import { useEffect, useState } from 'react';
import { api, clearToken, getToken } from './api';
import type { User } from './types';
import { Login } from './components/Login';
import { PostsList } from './components/PostsList';
import { CreatePost } from './components/CreatePost';
import { TemplatesEditor } from './components/TemplatesEditor';
import { LogsView } from './components/LogsView';
import { UsersAdmin } from './components/UsersAdmin';
import { RequestAutomation } from './components/RequestAutomation';

type Tab = 'users' | 'posts' | 'create' | 'templates' | 'logs';

const AUTOMATION_TABS: { id: Tab; label: string }[] = [
  { id: 'posts', label: 'Posts' },
  { id: 'create', label: 'Create post' },
  { id: 'templates', label: 'Templates' },
  { id: 'logs', label: 'Activity log' },
];

export function App() {
  const [authState, setAuthState] = useState<'checking' | 'out' | 'in'>(
    'checking',
  );
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>('posts');
  const [health, setHealth] = useState<'unknown' | 'ok' | 'down'>('unknown');

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
    return <div className="empty">Loading…</div>;
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
  const tabs: { id: Tab; label: string }[] = [
    ...(isAdmin ? [{ id: 'users' as Tab, label: 'Users' }] : []),
    ...(canAutomate ? AUTOMATION_TABS : []),
  ];

  // Keep the active tab valid for this user's available tabs.
  const activeTab = tabs.some((t) => t.id === tab)
    ? tab
    : tabs[0]?.id ?? 'posts';

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          insta<span>·</span>agent{' '}
          <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 14 }}>
            {isAdmin ? 'admin' : 'saas'}
          </span>
        </div>
        <div className="apikey-bar">
          <span
            className="status-dot"
            style={{
              background:
                health === 'ok'
                  ? 'var(--green)'
                  : health === 'down'
                    ? 'var(--red)'
                    : 'var(--muted)',
            }}
            title={`API ${health}`}
          />
          {user.picture && (
            <img
              src={user.picture}
              alt=""
              width={24}
              height={24}
              style={{ borderRadius: '50%' }}
              referrerPolicy="no-referrer"
            />
          )}
          <span className="muted" style={{ fontSize: 13 }}>
            {user.email}
          </span>
          <button className="btn secondary sm" onClick={logout}>
            Log out
          </button>
        </div>
      </div>

      {tabs.length > 0 && (
        <div className="tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {!canAutomate && !isAdmin ? (
        <RequestAutomation user={user} onUpdated={setUser} />
      ) : (
        <>
          {activeTab === 'users' && <UsersAdmin />}
          {activeTab === 'posts' && <PostsList />}
          {activeTab === 'create' && <CreatePost />}
          {activeTab === 'templates' && <TemplatesEditor />}
          {activeTab === 'logs' && <LogsView />}
        </>
      )}
    </div>
  );
}
