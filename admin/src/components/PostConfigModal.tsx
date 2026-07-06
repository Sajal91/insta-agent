import { useState } from 'react';
import { api } from '../api';
import type { MediaItem, MessageLink, ReelConfig } from '../types';

const MAX_LINKS = 3;
const MAX_LABEL = 20;

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

  function addLink() {
    if (links.length >= MAX_LINKS) return;
    setLinks((prev) => [...prev, { label: '', url: '' }]);
  }
  function updateLink(index: number, patch: Partial<MessageLink>) {
    setLinks((prev) =>
      prev.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    );
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
      onSaved(reel);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function removeConfig() {
    if (!confirm('Remove auto-reply config for this post?')) return;
    setSaving(true);
    try {
      await api.deleteReelConfig(media.id);
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Auto-reply settings</h3>
        <div className="sub">
          {media.media_product_type ?? media.media_type ?? 'POST'} · {media.id}
        </div>

        {error && <div className="banner error">{error}</div>}

        <div className="field">
          <label>Enabled</label>
          <div
            className="toggle"
            onClick={() => setEnabled((v) => !v)}
            role="switch"
            aria-checked={enabled}
          >
            <div className={`switch ${enabled ? 'on' : ''}`} />
            <span>{enabled ? 'Auto-reply on' : 'Auto-reply off'}</span>
          </div>
        </div>

        <div className="field">
          <label>Accepted keywords (comma-separated, case-insensitive)</label>
          <input
            type="text"
            value={triggerKeywords}
            placeholder="Interested, Required"
            onChange={(e) => setTriggerKeywords(e.target.value)}
          />
          <div className="hint">
            Only comments containing one of these trigger the DM. Leave empty to
            reply to every comment.
          </div>
        </div>

        <div className="field">
          <label>Details to DM (link / info / offer)</label>
          <textarea
            value={detailed}
            placeholder="https://your-link.com/offer"
            onChange={(e) => setDetailed(e.target.value)}
          />
          <div className="hint">
            Injected into the DM via <code className="inline">{'{{detailedMessageContent}}'}</code>. Falls
            back to the global default if empty.
          </div>
        </div>

        <div className="field">
          <label>DM link buttons (up to {MAX_LINKS})</label>
          <div className="hint" style={{ marginBottom: 10 }}>
            Sent as tappable buttons in the DM. Each needs a short label (max{' '}
            {MAX_LABEL} chars) and a URL. Leave empty to send a plain-text DM.
          </div>

          {links.map((link, i) => (
            <div className="link-row" key={i}>
              <input
                type="text"
                value={link.label}
                maxLength={MAX_LABEL}
                placeholder="Click me"
                onChange={(e) => updateLink(i, { label: e.target.value })}
                style={{ flex: '0 0 140px' }}
              />
              <input
                type="url"
                value={link.url}
                placeholder="https://your-link.com"
                onChange={(e) => updateLink(i, { url: e.target.value })}
              />
              <button
                type="button"
                className="btn danger sm"
                onClick={() => removeLink(i)}
                title="Remove link"
              >
                ✕
              </button>
            </div>
          ))}

          {links.length < MAX_LINKS && (
            <button
              type="button"
              className="btn secondary sm"
              onClick={addLink}
              style={{ marginTop: links.length > 0 ? 4 : 0 }}
            >
              + Add link button
            </button>
          )}
        </div>

        <div className="field">
          <label>DM template (optional override)</label>
          <textarea
            value={dmTemplate}
            placeholder="Thanks! Here are the details: {{detailedMessageContent}}"
            onChange={(e) => setDmTemplate(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Public comment reply (optional override)</label>
          <textarea
            value={replyTemplate}
            placeholder="I've sent you the details in your DM 📩"
            onChange={(e) => setReplyTemplate(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Blocklist keywords (skip these comments)</label>
          <input
            type="text"
            value={blocklist}
            placeholder="spam, http"
            onChange={(e) => setBlocklist(e.target.value)}
          />
        </div>

        <div className="modal-actions">
          <button
            className="btn danger"
            onClick={removeConfig}
            disabled={saving || !cfg}
          >
            Remove config
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className="btn" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
