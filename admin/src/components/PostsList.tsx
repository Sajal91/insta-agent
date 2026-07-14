import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Eye,
  Heart,
  ImageOff,
  Images,
  KeyRound,
  MessageCircle,
  RefreshCw,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { api } from '../api';
import type { MediaItem, ReelConfig } from '../types';
import { PostConfigModal } from './PostConfigModal';
import { Banner, EmptyState, stagger } from './ui';

function PostSkeleton() {
  return (
    <div className="card post-card">
      <div className="skeleton" style={{ aspectRatio: '1 / 1', borderRadius: 0 }} />
      <div className="post-body">
        <div className="skeleton" style={{ height: 14, width: '90%' }} />
        <div className="skeleton" style={{ height: 14, width: '60%' }} />
        <div className="skeleton" style={{ height: 24, width: '50%', borderRadius: 999 }} />
        <div className="skeleton" style={{ height: 36, borderRadius: 10, marginTop: 6 }} />
      </div>
    </div>
  );
}

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
        <div className="titles">
          <h2>Your posts &amp; reels</h2>
          <div className="sub">
            Configure automated comment replies and DMs for each post.
          </div>
        </div>
        <button className="btn secondary" onClick={load} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      {loading && !error && (
        <div className="grid">
          {[0, 1, 2, 3].map((i) => (
            <PostSkeleton key={i} />
          ))}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <EmptyState icon={Images} title="No posts found yet">
          No media found for this account. Publish something from the “Create
          post” tab, or check your Instagram connection & permissions.
        </EmptyState>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="grid">
          {items.map((m, i) => {
            const cfg = m.config;
            const configured = !!cfg;
            const on = cfg?.enabled ?? false;
            const thumb = m.thumbnail_url || m.media_url;
            return (
              <motion.div
                key={m.id}
                className="card hover post-card"
                {...stagger(i)}
              >
                <div className="post-thumb-wrap">
                  {thumb ? (
                    <img className="post-thumb" src={thumb} alt="" loading="lazy" />
                  ) : (
                    <div className="post-thumb placeholder">
                      <ImageOff size={28} />
                      no preview
                    </div>
                  )}
                  <span className="post-type-chip">
                    {m.media_product_type || m.media_type || 'POST'}
                  </span>
                </div>
                <div className="post-body">
                  <div className="post-caption">
                    {m.caption || <span className="faint">(no caption)</span>}
                  </div>
                  <div className="post-meta">
                    {typeof m.comments_count === 'number' && (
                      <span>
                        <MessageCircle size={14} /> {m.comments_count}
                      </span>
                    )}
                    {typeof m.like_count === 'number' && (
                      <span>
                        <Heart size={14} /> {m.like_count}
                      </span>
                    )}
                  </div>
                  <div className="badges">
                    {!configured && (
                      <span className="badge">Not configured</span>
                    )}
                    {configured && (
                      <span className={`badge ${on ? 'on' : 'off'}`}>
                        {on ? 'Auto-reply ON' : 'Auto-reply OFF'}
                      </span>
                    )}
                    {cfg && cfg.triggerKeywords.length > 0 && (
                      <span className="badge kw">
                        <KeyRound size={12} /> {cfg.triggerKeywords.join(', ')}
                      </span>
                    )}
                  </div>
                  <div className="flex mt-auto" style={{ gap: 8, paddingTop: 4 }}>
                    <button
                      className={`btn sm grow ${configured ? '' : 'premium'}`}
                      onClick={() => setEditing(m)}
                    >
                      {configured ? (
                        <>
                          <Settings2 size={15} /> Edit settings
                        </>
                      ) : (
                        <>
                          <Sparkles size={15} /> Set up auto-reply
                        </>
                      )}
                    </button>
                    {m.permalink && (
                      <a
                        className="btn secondary sm icon"
                        href={m.permalink}
                        target="_blank"
                        rel="noreferrer"
                        title="View on Instagram"
                      >
                        <Eye size={16} />
                      </a>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

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
