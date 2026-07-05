import { useEffect, useState } from 'react';
import { api } from '../api';
import type { MediaItem, ReelConfig } from '../types';
import { PostConfigModal } from './PostConfigModal';

export function PostsList() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MediaItem | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { items } = await api.listMedia();
      console.log(items)
      setItems(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load posts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function onSaved(config: ReelConfig) {
    const hasConfig =
      config.createdAt !== '' || config.triggerKeywords.length > 0;
    setItems((prev) =>
      prev.map((m) =>
        m.id === config.reelId ? { ...m, config: hasConfig ? config : null } : m,
      ),
    );
    setEditing(null);
  }

  return (
    <div>
      <div className="section-head">
        <h2>Your posts &amp; reels</h2>
        <button className="btn secondary sm" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="banner error">{error}</div>}

      {!error && loading && <div className="empty">Loading posts…</div>}

      {!loading && !error && items.length === 0 && (
        <div className="empty">
          No media found for this account. Publish something from the “Create
          post” tab, or check the API key / permissions.
        </div>
      )}

      <div className="grid">
        {items.map((m) => {
          const cfg = m.config;
          const configured = !!cfg;
          const on = cfg?.enabled ?? false;
          const thumb = m.thumbnail_url || m.media_url;
          return (
            <div key={m.id} className="card post-card">
              {thumb ? (
                <img className="post-thumb" src={thumb} alt="" loading="lazy" />
              ) : (
                <div className="post-thumb placeholder">no preview</div>
              )}
              <div className="post-body">
                <div className="post-caption">
                  {m.caption || <span className="muted">(no caption)</span>}
                </div>
                <div className="post-meta">
                  <span>{m.media_product_type || m.media_type || 'POST'}</span>
                  {typeof m.comments_count === 'number' && (
                    <span>💬 {m.comments_count}</span>
                  )}
                  {typeof m.like_count === 'number' && (
                    <span>❤ {m.like_count}</span>
                  )}
                </div>
                <div className="badges">
                  {!configured && <span className="badge">Not configured</span>}
                  {configured && (
                    <span className={`badge ${on ? 'on' : 'off'}`}>
                      {on ? 'Auto-reply ON' : 'Auto-reply OFF'}
                    </span>
                  )}
                  {cfg && cfg.triggerKeywords.length > 0 && (
                    <span className="badge kw">
                      🔑 {cfg.triggerKeywords.join(', ')}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                  <button
                    className="btn sm"
                    onClick={() => setEditing(m)}
                    style={{ flex: 1 }}
                  >
                    {configured ? 'Edit settings' : 'Set up auto-reply'}
                  </button>
                  {m.permalink && (
                    <a
                      className="btn secondary sm"
                      href={m.permalink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <PostConfigModal
          media={editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
