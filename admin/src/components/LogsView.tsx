import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { api } from '../api';
import type { LogEntry } from '../types';
import { Banner, EmptyState, fadeUp } from './ui';

const PAGE = 50;

function statusLabel(status: LogEntry['status']) {
  const map = { success: 'on', error: 'off', skipped: '' } as const;
  return <span className={`badge ${map[status]}`}>{status}</span>;
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
      <div className="section-head">
        <div className="titles">
          <h2>Activity log</h2>
          <div className="sub">Every reply, DM and skipped comment, tracked.</div>
        </div>
        <button
          className="btn secondary"
          onClick={() => load(offset)}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      {items.length === 0 && !loading && !error ? (
        <div className="card">
          <EmptyState icon={Activity} title="No activity yet">
            When your automations start replying to comments, every event will
            show up right here.
          </EmptyState>
        </div>
      ) : (
        <motion.div className="card" style={{ padding: 0 }} {...fadeUp}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Comment</th>
                  <th>User</th>
                  <th>Post</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {items.map((l) => (
                  <tr key={l.id}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(l.createdAt).toLocaleString()}
                    </td>
                    <td style={{ fontWeight: 500 }}>{l.action}</td>
                    <td>{statusLabel(l.status)}</td>
                    <td className="muted">{l.commentId ?? '—'}</td>
                    <td className="muted">{l.igUserId ?? '—'}</td>
                    <td className="muted">{l.reelId ?? '—'}</td>
                    <td className="muted">{l.message ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {total > 0 && (
        <div className="pagination">
          <span className="muted">
            {total} total · showing {offset + 1}–{Math.min(offset + PAGE, total)}
          </span>
          <div className="flex" style={{ gap: 8 }}>
            <button
              className="btn secondary sm"
              disabled={offset === 0 || loading}
              onClick={() => load(Math.max(0, offset - PAGE))}
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <button
              className="btn secondary sm"
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
