import { useEffect, useState } from 'react';
import { api } from '../api';

export function TemplatesEditor() {
  const [dm, setDm] = useState('');
  const [reply, setReply] = useState('');
  const [detailed, setDetailed] = useState('');
  const [keywords, setKeywords] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { templates } = await api.getTemplates();
      setDm(templates.DM_TEMPLATE ?? '');
      setReply(templates.COMMENT_REPLY_TEMPLATE ?? '');
      setDetailed(templates.DETAILED_MESSAGE_CONTENT ?? '');
      setKeywords(templates.DEFAULT_TRIGGER_KEYWORDS ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      await api.putTemplates({
        DM_TEMPLATE: dm,
        COMMENT_REPLY_TEMPLATE: reply,
        DETAILED_MESSAGE_CONTENT: detailed,
        DEFAULT_TRIGGER_KEYWORDS: keywords,
      });
      setOkMsg('Saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="empty">Loading templates…</div>;

  return (
    <div>
      <div className="section-head">
        <h2>Default templates</h2>
      </div>
      <div className="hint" style={{ marginBottom: 16 }}>
        Your account's fallbacks, used when a post has no override. Placeholders:{' '}
        <code className="inline">{'{{detailedMessageContent}}'}</code>,{' '}
        <code className="inline">{'{{pageHandle}}'}</code>,{' '}
        <code className="inline">{'{{username}}'}</code>.
      </div>

      {error && <div className="banner error">{error}</div>}
      {okMsg && <div className="banner ok">{okMsg}</div>}

      <div className="card" style={{ maxWidth: 680 }}>
        <div className="field">
          <label>DM template</label>
          <textarea value={dm} onChange={(e) => setDm(e.target.value)} />
        </div>
        <div className="field">
          <label>Public comment reply</label>
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} />
        </div>
        <div className="field">
          <label>Default details content</label>
          <textarea
            value={detailed}
            onChange={(e) => setDetailed(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Default accepted keywords (comma-separated, case-insensitive)</label>
          <input
            type="text"
            value={keywords}
            placeholder="Interested, Info"
            onChange={(e) => setKeywords(e.target.value)}
          />
          <div className="hint">
            Applied to posts that don’t define their own keywords. Empty = reply to
            all comments.
          </div>
        </div>
        <button className="btn" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save templates'}
        </button>
      </div>
    </div>
  );
}
