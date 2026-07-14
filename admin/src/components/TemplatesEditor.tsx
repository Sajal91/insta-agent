import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, MessageSquareText, Save, Send } from 'lucide-react';
import { api } from '../api';
import { Banner, LoadingBlock, fadeUp, useToast } from './ui';
import {
  btn,
  card,
  codeInline,
  cx,
  field,
  heading,
  hint,
  input,
  label,
  sectionHead,
  textarea,
} from '../tw';

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
      <div className={sectionHead}>
        <div>
          <h2 className={cx(heading, 'text-2xl')}>Default templates</h2>
          <div className="text-muted text-sm mt-1">
            Account fallbacks, used whenever a post has no override.
          </div>
        </div>
        <button className={btn.primary} onClick={save} disabled={saving}>
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
        <code className={codeInline}>{'{{detailedMessageContent}}'}</code>,{' '}
        <code className={codeInline}>{'{{pageHandle}}'}</code>,{' '}
        <code className={codeInline}>{'{{username}}'}</code>.
      </Banner>

      {error && <Banner kind="error">{error}</Banner>}
      {okMsg && <Banner kind="ok">{okMsg}</Banner>}

      <motion.div className={cx(card, 'max-w-[760px]')} {...fadeUp}>
        <div className={field}>
          <label className={cx(label, 'flex items-center gap-[7px]')}>
            <Send size={15} /> DM template
          </label>
          <textarea className={textarea} value={dm} onChange={(e) => setDm(e.target.value)} />
        </div>
        <div className={field}>
          <label className={cx(label, 'flex items-center gap-[7px]')}>
            <MessageSquareText size={15} /> Public comment reply
          </label>
          <textarea
            className={textarea}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
        </div>
        <div className={field}>
          <label className={label}>Default details content</label>
          <textarea
            className={textarea}
            value={detailed}
            onChange={(e) => setDetailed(e.target.value)}
          />
        </div>
        <div className={cx(field, 'mb-0')}>
          <label className={cx(label, 'flex items-center gap-[7px]')}>
            <KeyRound size={15} /> Default accepted keywords
          </label>
          <input
            type="text"
            className={input}
            value={keywords}
            placeholder="Interested, Info"
            onChange={(e) => setKeywords(e.target.value)}
          />
          <div className={hint}>
            Comma-separated, case-insensitive. Applied to posts that don't define
            their own keywords. Empty = reply to all comments.
          </div>
        </div>
      </motion.div>
    </div>
  );
}
