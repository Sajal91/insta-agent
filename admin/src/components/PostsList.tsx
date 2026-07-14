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
import {
  badge,
  btn,
  btnIconSm,
  btnSm,
  card,
  cardHover,
  cx,
  heading,
  sectionHead,
} from '../tw';

const GRID = 'grid gap-5 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]';

function PostSkeleton() {
  return (
    <div className={cx(card, 'p-0 overflow-hidden flex flex-col')}>
      <span className="block aspect-square bg-[linear-gradient(90deg,var(--color-surface-2)_25%,#ececef_50%,var(--color-surface-2)_75%)] bg-size-[200%_100%] animate-shimmer" />
      <div className="p-4 flex flex-col gap-3">
        <span className="block h-3.5 w-[90%] rounded-lg bg-surface-2 animate-pulse" />
        <span className="block h-3.5 w-3/5 rounded-lg bg-surface-2 animate-pulse" />
        <span className="block h-6 w-1/2 rounded-pill bg-surface-2 animate-pulse" />
        <span className="block h-9 rounded-[10px] bg-surface-2 animate-pulse mt-1.5" />
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
      <div className={sectionHead}>
        <div>
          <h2 className={cx(heading, 'text-2xl')}>Your posts &amp; reels</h2>
          <div className="text-muted text-sm mt-1">
            Configure automated comment replies and DMs for each post.
          </div>
        </div>
        <button className={btn.secondary} onClick={load} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      {loading && !error && (
        <div className={GRID}>
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
        <div className={GRID}>
          {items.map((m, i) => {
            const cfg = m.config;
            const configured = !!cfg;
            const on = cfg?.enabled ?? false;
            const thumb = m.thumbnail_url || m.media_url;
            return (
              <motion.div
                key={m.id}
                className={cx(card, cardHover, 'group p-0 overflow-hidden flex flex-col')}
                {...stagger(i)}
              >
                <div className="relative w-full aspect-square bg-surface-2 overflow-hidden">
                  {thumb ? (
                    <img
                      className="w-full h-full object-cover block transition-transform duration-350 group-hover:scale-105"
                      src={thumb}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1.5 text-faint text-xs h-full">
                      <ImageOff size={28} />
                      no preview
                    </div>
                  )}
                  <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-text rounded-pill px-2.5 py-1 bg-white/90 backdrop-blur-[6px] shadow-xs">
                    {m.media_product_type || m.media_type || 'POST'}
                  </span>
                </div>
                <div className="p-4 flex flex-col gap-3 flex-1">
                  <div className="text-[13.5px] text-text leading-[1.45] min-h-[38px] line-clamp-2">
                    {m.caption || <span className="text-faint">(no caption)</span>}
                  </div>
                  <div className="flex gap-3.5 text-muted text-[12.5px]">
                    {typeof m.comments_count === 'number' && (
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle size={14} /> {m.comments_count}
                      </span>
                    )}
                    {typeof m.like_count === 'number' && (
                      <span className="inline-flex items-center gap-1">
                        <Heart size={14} /> {m.like_count}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {!configured && <span className={badge.default}>Not configured</span>}
                    {configured && (
                      <span className={on ? badge.on : badge.off}>
                        {on ? 'Auto-reply ON' : 'Auto-reply OFF'}
                      </span>
                    )}
                    {cfg && cfg.triggerKeywords.length > 0 && (
                      <span className={badge.kw}>
                        <KeyRound size={12} /> {cfg.triggerKeywords.join(', ')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-auto pt-1">
                    <button
                      className={cx(configured ? btn.primary : btn.premium, btnSm, 'flex-1')}
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
                        className={cx(btn.secondary, btnSm, btnIconSm)}
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
