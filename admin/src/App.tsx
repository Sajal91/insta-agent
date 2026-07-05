import { useEffect, useState } from 'react';
import { api, getApiKey, setApiKey } from './api';
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
  const [apiKey, setKey] = useState(getApiKey());
  const [health, setHealth] = useState<'unknown' | 'ok' | 'down'>('unknown');

  useEffect(() => {
    api
      .health()
      .then(() => setHealth('ok'))
      .catch(() => setHealth('down'));
  }, [apiKey]);

  function saveKey(value: string) {
    setApiKey(value);
    setKey(value);
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          insta<span>·</span>agent <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 14 }}>admin</span>
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
          <input
            type="password"
            placeholder="x-api-key"
            value={apiKey}
            onChange={(e) => saveKey(e.target.value)}
            style={{ width: 220 }}
          />
        </div>
      </div>
      <div className="hint">
        Backend: <code className="inline">{api.baseUrl}</code>
        {health === 'down' && ' — not reachable / wrong API key'}
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
