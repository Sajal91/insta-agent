import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { api } from '../api';
import type { LogEntry } from '../types';
import { Banner, EmptyState, fadeUp } from './ui';
import {
  badge,
  btn,
  btnSm,
  card,
  cx,
  heading,
  sectionHead,
  tableCls,
  td,
  th,
  tr,
} from '../tw';

const PAGE = 50;

function statusLabel(status: LogEntry['status']) {
  const map = { success: badge.on, error: badge.off, skipped: badge.default };
  return <span className={map[status]}>{status}</span>;
}

export function LogsView() {
  const [items, setItems] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(nextOffset: number) {
    setLoading(true);
    setError(null);
    try {
      const { items, total } = await api.getLogs(PAGE, nextOffset);
      setItems(items);
      setTotal(total);
      setOffset(nextOffset);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(0);
  }, []);

  return (
    <div>
      <div className={sectionHead}>
        <div>
          <h2 className={cx(heading, 'text-2xl')}>Activity log</h2>
          <div className="text-muted text-sm mt-1">
            Every reply, DM and skipped comment, tracked.
          </div>
        </div>
        <button
          className={btn.secondary}
          onClick={() => load(offset)}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      {items.length === 0 && !loading && !error ? (
        <div className={card}>
          <EmptyState icon={Activity} title="No activity yet">
            When your automations start replying to comments, every event will
            show up right here.
          </EmptyState>
        </div>
      ) : (
        <motion.div className={cx(card, 'p-0 overflow-hidden')} {...fadeUp}>
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={th}>When</th>
                  <th className={th}>Action</th>
                  <th className={th}>Status</th>
                  <th className={th}>Comment</th>
                  <th className={th}>User</th>
                  <th className={th}>Post</th>
                  <th className={th}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {items.map((l) => (
                  <tr key={l.id} className={tr}>
                    <td className={cx(td, 'text-muted whitespace-nowrap')}>
                      {new Date(l.createdAt).toLocaleString()}
                    </td>
                    <td className={cx(td, 'font-medium')}>{l.action}</td>
                    <td className={td}>{statusLabel(l.status)}</td>
                    <td className={cx(td, 'text-muted')}>{l.commentId ?? '—'}</td>
                    <td className={cx(td, 'text-muted')}>{l.igUserId ?? '—'}</td>
                    <td className={cx(td, 'text-muted')}>{l.reelId ?? '—'}</td>
                    <td className={cx(td, 'text-muted')}>{l.message ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {total > 0 && (
        <div className="flex justify-between items-center gap-3 flex-wrap mt-4">
          <span className="text-muted">
            {total} total · showing {offset + 1}–{Math.min(offset + PAGE, total)}
          </span>
          <div className="flex items-center gap-2">
            <button
              className={cx(btn.secondary, btnSm)}
              disabled={offset === 0 || loading}
              onClick={() => load(Math.max(0, offset - PAGE))}
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <button
              className={cx(btn.secondary, btnSm)}
              disabled={offset + PAGE >= total || loading}
              onClick={() => load(offset + PAGE)}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
