import { useEffect, useState } from 'react';
import { api } from '../api';
import type { LogEntry } from '../types';

const PAGE = 50;

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
        <h2>Activity log</h2>
        <button className="btn secondary sm" onClick={() => load(offset)} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="banner error">{error}</div>}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
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
                <td>
                  <span className={`status-dot ${l.status}`} />
                  {l.action}
                </td>
                <td className="muted">{l.commentId ?? '—'}</td>
                <td className="muted">{l.igUserId ?? '—'}</td>
                <td className="muted">{l.reelId ?? '—'}</td>
                <td className="muted">{l.message ?? '—'}</td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="empty">
                  No activity yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
        <span className="muted">
          {total} total · showing {offset + 1}–{Math.min(offset + PAGE, total)}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn secondary sm"
            disabled={offset === 0 || loading}
            onClick={() => load(Math.max(0, offset - PAGE))}
          >
            Prev
          </button>
          <button
            className="btn secondary sm"
            disabled={offset + PAGE >= total || loading}
            onClick={() => load(offset + PAGE)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
