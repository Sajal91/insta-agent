import { useEffect, useState } from 'react';
import { api, clearToken, getToken } from './api';
import { Login } from './components/Login';
import { PostsList } from './components/PostsList';
import { CreatePost } from './components/CreatePost';
import { TemplatesEditor } from './components/TemplatesEditor';
import { LogsView } from './components/LogsView';

type Tab = 'posts' | 'create' | 'templates' | 'logs';

const TABS: { id: Tab; label: string }[] = [
  { id: 'posts', label: 'Posts' },
  { id: 'create', label: 'Create post' },
  { id: 'templates', label: 'Default templates' },
  { id: 'logs', label: 'Activity log' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('posts');
  const [authState, setAuthState] = useState<'checking' | 'out' | 'in'>(
    'checking',
  );
  const [email, setEmail] = useState('');
  const [health, setHealth] = useState<'unknown' | 'ok' | 'down'>('unknown');

  // Validate any stored token on load.
  useEffect(() => {
    if (!getToken()) {
      setAuthState('out');
      return;
    }
    api
      .me()
      .then(({ email }) => {
        setEmail(email);
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
    setEmail('');
    setAuthState('out');
  }

  if (authState === 'checking') {
    return <div className="empty">Loading…</div>;
  }

  if (authState === 'out') {
    return (
      <Login
        onSuccess={(loggedInAs) => {
          setEmail(loggedInAs);
          setAuthState('in');
        }}
      />
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          insta<span>·</span>agent{' '}
          <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 14 }}>
            admin
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
          <span className="muted" style={{ fontSize: 13 }}>
            {email}
          </span>
          <button className="btn secondary sm" onClick={logout}>
            Log out
          </button>
        </div>
      </div>
      <div className="hint">
        Backend:{' '}
        <code className="inline">{api.baseUrl || window.location.origin}</code>
        {health === 'down' && ' — not reachable'}
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'posts' && <PostsList />}
      {tab === 'create' && <CreatePost />}
      {tab === 'templates' && <TemplatesEditor />}
      {tab === 'logs' && <LogsView />}
    </div>
  );
}
