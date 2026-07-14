import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link2, Plus, Trash2, X } from 'lucide-react';
import { api } from '../api';
import type { MediaItem, MessageLink, ReelConfig } from '../types';
import { Banner, useToast } from './ui';
import {
  btn,
  btnIconSm,
  btnSm,
  codeInline,
  cx,
  field,
  heading,
  hint,
  input,
  label,
  textarea,
} from '../tw';

const MAX_LINKS = 3;
const MAX_LABEL = 20;

const switchBase = `relative shrink-0 w-11 h-[26px] rounded-pill border border-border-strong bg-surface-2 transition-colors duration-200 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-200`;
const switchOn = 'bg-accent border-accent after:translate-x-[18px]';

function keywordsToText(list: string[]): string {
  return list.join(', ');
}
function textToKeywords(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function PostConfigModal({
  media,
  onClose,
  onSaved,
}: {
  media: MediaItem;
  onClose: () => void;
  onSaved: (config: ReelConfig) => void;
}) {
  const cfg = media.config;
  const [enabled, setEnabled] = useState(cfg?.enabled ?? false);
  const [triggerKeywords, setTriggerKeywords] = useState(
    keywordsToText(cfg?.triggerKeywords ?? []),
  );
  const [detailed, setDetailed] = useState(cfg?.detailedMessageContent ?? '');
  const [dmTemplate, setDmTemplate] = useState(cfg?.dmTemplate ?? '');
  const [replyTemplate, setReplyTemplate] = useState(
    cfg?.commentReplyTemplate ?? '',
  );
  const [blocklist, setBlocklist] = useState(
    keywordsToText(cfg?.blocklistKeywords ?? []),
  );
  const [links, setLinks] = useState<MessageLink[]>(cfg?.links ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  function addLink() {
    if (links.length >= MAX_LINKS) return;
    setLinks((prev) => [...prev, { label: '', url: '' }]);
  }
  function updateLink(index: number, patch: Partial<MessageLink>) {
    setLinks((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }
  function removeLink(index: number) {
    setLinks((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const cleanedLinks = links
        .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
        .filter((l) => l.label && l.url);
      const { reel } = await api.saveReelConfig({
        reelId: media.id,
        enabled,
        triggerKeywords: textToKeywords(triggerKeywords),
        blocklistKeywords: textToKeywords(blocklist),
        detailedMessageContent: detailed.trim() || null,
        dmTemplate: dmTemplate.trim() || null,
        commentReplyTemplate: replyTemplate.trim() || null,
        links: cleanedLinks,
      });
      toast.push('ok', 'Auto-reply settings saved');
      onSaved(reel);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      setError(msg);
      toast.push('error', msg);
    } finally {
      setSaving(false);
    }
  }

  async function removeConfig() {
    if (!confirm('Remove auto-reply config for this post?')) return;
    setSaving(true);
    try {
      await api.deleteReelConfig(media.id);
      toast.push('info', 'Auto-reply config removed');
      onSaved({
        reelId: media.id,
        enabled: true,
        triggerKeywords: [],
        dmTemplate: null,
        commentReplyTemplate: null,
        blocklistKeywords: [],
        detailedMessageContent: null,
        links: [],
        createdAt: '',
        updatedAt: '',
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-60 flex items-start justify-center overflow-y-auto px-4 py-12 bg-[rgba(17,24,39,0.45)] backdrop-blur-xs"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <motion.div
          className="w-full max-w-[580px] bg-surface border border-border rounded-dialog shadow-lg p-7 max-[620px]:p-5"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-start justify-between gap-3 mb-5">
            <div>
              <h3 className={cx(heading, 'text-[19px]')}>Auto-reply settings</h3>
              <div className="text-[12.5px] text-muted mt-1 break-all">
                {media.media_product_type ?? media.media_type ?? 'POST'} ·{' '}
                {media.id}
              </div>
            </div>
            <button
              className="flex items-center justify-center w-[34px] h-[34px] rounded-[10px] text-muted cursor-pointer shrink-0 hover:bg-surface-2 hover:text-text"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {error && <Banner kind="error">{error}</Banner>}

          <div className={field}>
            <label className={label}>Automation</label>
            <div
              className="inline-flex items-center gap-2.5 cursor-pointer text-text font-medium select-none text-sm"
              onClick={() => setEnabled((v) => !v)}
              role="switch"
              aria-checked={enabled}
            >
              <div className={cx(switchBase, enabled && switchOn)} />
              <span>{enabled ? 'Auto-reply on' : 'Auto-reply off'}</span>
            </div>
          </div>

          <div className={field}>
            <label className={label}>
              Accepted keywords (comma-separated, case-insensitive)
            </label>
            <input
              type="text"
              className={input}
              value={triggerKeywords}
              placeholder="Interested, Required"
              onChange={(e) => setTriggerKeywords(e.target.value)}
            />
            <div className={hint}>
              Only comments containing one of these trigger the DM. Leave empty to
              reply to every comment.
            </div>
          </div>

          <div className={field}>
            <label className={label}>Details to DM (link / info / offer)</label>
            <textarea
              className={textarea}
              value={detailed}
              placeholder="https://your-link.com/offer"
              onChange={(e) => setDetailed(e.target.value)}
            />
            <div className={hint}>
              Injected into the DM via{' '}
              <code className={codeInline}>{'{{detailedMessageContent}}'}</code>.
              Falls back to the global default if empty.
            </div>
          </div>

          <div className={field}>
            <label className={label}>DM link buttons (up to {MAX_LINKS})</label>
            <div className={cx(hint, 'mb-3 mt-0')}>
              Sent as tappable buttons in the DM. Each needs a short label (max{' '}
              {MAX_LABEL} chars) and a URL. Leave empty to send a plain-text DM.
            </div>

            {links.map((link, i) => (
              <div className="flex gap-2.5 items-center mb-2.5" key={i}>
                <input
                  type="text"
                  className={cx(input, 'flex-[0_0_150px]')}
                  value={link.label}
                  maxLength={MAX_LABEL}
                  placeholder="Click me"
                  onChange={(e) => updateLink(i, { label: e.target.value })}
                />
                <input
                  type="url"
                  className={cx(input, 'flex-1 min-w-0')}
                  value={link.url}
                  placeholder="https://your-link.com"
                  onChange={(e) => updateLink(i, { url: e.target.value })}
                />
                <button
                  type="button"
                  className={cx(btn.danger, btnSm, btnIconSm)}
                  onClick={() => removeLink(i)}
                  title="Remove link"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}

            {links.length < MAX_LINKS && (
              <button
                type="button"
                className={cx(btn.secondary, btnSm, links.length > 0 && 'mt-1')}
                onClick={addLink}
              >
                <Plus size={15} /> Add link button
              </button>
            )}
          </div>

          <div className={field}>
            <label className={label}>DM template (optional override)</label>
            <textarea
              className={textarea}
              value={dmTemplate}
              placeholder="Thanks! Here are the details: {{detailedMessageContent}}"
              onChange={(e) => setDmTemplate(e.target.value)}
            />
          </div>

          <div className={field}>
            <label className={label}>
              Public comment reply (optional override)
            </label>
            <textarea
              className={textarea}
              value={replyTemplate}
              placeholder="I've sent you the details in your DM 📩"
              onChange={(e) => setReplyTemplate(e.target.value)}
            />
          </div>

          <div className={cx(field, 'mb-0')}>
            <label className={cx(label, 'flex items-center gap-[7px]')}>
              <Link2 size={15} /> Blocklist keywords (skip these comments)
            </label>
            <input
              type="text"
              className={input}
              value={blocklist}
              placeholder="spam, http"
              onChange={(e) => setBlocklist(e.target.value)}
            />
          </div>

          <div className="flex justify-between gap-3 border-t border-border mt-6 pt-5 flex-wrap">
            <button
              className={btn.danger}
              onClick={removeConfig}
              disabled={saving || !cfg}
            >
              <Trash2 size={15} /> Remove config
            </button>
            <div className="flex items-center gap-2.5">
              <button
                className={btn.secondary}
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </button>
              <button className={btn.primary} onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
