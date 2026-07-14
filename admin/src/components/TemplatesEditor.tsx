import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, MessageSquareText, Save, Send } from 'lucide-react';
import { api } from '../api';
import { Banner, LoadingBlock, fadeUp, useToast } from './ui';

export function TemplatesEditor() {
  const [dm, setDm] = useState('');
  const [reply, setReply] = useState('');
  const [detailed, setDetailed] = useState('');
  const [keywords, setKeywords] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const toast = useToast();

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
      toast.push('ok', 'Templates saved');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      setError(msg);
      toast.push('error', msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingBlock label="Loading templates…" />;

  return (
    <div>
      <div className="section-head">
        <div className="titles">
          <h2>Default templates</h2>
          <div className="sub">
            Account fallbacks, used whenever a post has no override.
          </div>
        </div>
        <button className="btn" onClick={save} disabled={saving}>
          {saving ? (
            'Saving…'
          ) : (
            <>
              <Save size={16} /> Save templates
            </>
          )}
        </button>
      </div>

      <Banner kind="info">
        Placeholders you can use:{' '}
        <code className="inline">{'{{detailedMessageContent}}'}</code>,{' '}
        <code className="inline">{'{{pageHandle}}'}</code>,{' '}
        <code className="inline">{'{{username}}'}</code>.
      </Banner>

      {error && <Banner kind="error">{error}</Banner>}
      {okMsg && <Banner kind="ok">{okMsg}</Banner>}

      <motion.div className="card" style={{ maxWidth: 760 }} {...fadeUp}>
        <div className="field">
          <label>
            <span className="flex" style={{ gap: 7 }}>
              <Send size={15} /> DM template
            </span>
          </label>
          <textarea value={dm} onChange={(e) => setDm(e.target.value)} />
        </div>
        <div className="field">
          <label>
            <span className="flex" style={{ gap: 7 }}>
              <MessageSquareText size={15} /> Public comment reply
            </span>
          </label>
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} />
        </div>
        <div className="field">
          <label>Default details content</label>
          <textarea
            value={detailed}
            onChange={(e) => setDetailed(e.target.value)}
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>
            <span className="flex" style={{ gap: 7 }}>
              <KeyRound size={15} /> Default accepted keywords
            </span>
          </label>
          <input
            type="text"
            value={keywords}
            placeholder="Interested, Info"
            onChange={(e) => setKeywords(e.target.value)}
          />
          <div className="hint">
            Comma-separated, case-insensitive. Applied to posts that don't define
            their own keywords. Empty = reply to all comments.
          </div>
        </div>
      </motion.div>
    </div>
  );
}
