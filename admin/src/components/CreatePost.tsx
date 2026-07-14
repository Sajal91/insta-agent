import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Film,
  Image as ImageIcon,
  Info,
  Send,
  Sparkles,
} from 'lucide-react';
import { api } from '../api';
import { Banner, fadeUp, useToast } from './ui';

export function CreatePost() {
  const [mediaType, setMediaType] = useState<'IMAGE' | 'REELS'>('IMAGE');
  const [mediaUrl, setMediaUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const toast = useToast();

  async function publish() {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const { mediaId } = await api.publishMedia({
        mediaType,
        mediaUrl: mediaUrl.trim(),
        caption: caption.trim() || undefined,
      });
      setOkMsg(`Published! Media ID: ${mediaId}`);
      toast.push('ok', 'Post published to Instagram 🎉');
      setMediaUrl('');
      setCaption('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to publish';
      setError(msg);
      toast.push('error', msg);
    } finally {
      setBusy(false);
    }
  }

  const isValidUrl = /^https?:\/\/.+/i.test(mediaUrl.trim());

  return (
    <div>
      <div className="section-head">
        <div className="titles">
          <h2>Create a new post</h2>
          <div className="sub">Publish an image or reel straight to Instagram.</div>
        </div>
      </div>

      <Banner kind="info">
        Instagram publishes from a <strong>public URL</strong> — Meta downloads
        the file itself, so <code className="inline">localhost</code> won't work.
        Host the media somewhere public (S3, Cloudinary, etc.) and paste the URL.
        Requires the <code className="inline">instagram_content_publish</code>{' '}
        permission.
      </Banner>

      {error && <Banner kind="error">{error}</Banner>}
      {okMsg && <Banner kind="ok">{okMsg}</Banner>}

      <div className="dash-grid" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
        <motion.div className="card" {...fadeUp}>
          <div className="field">
            <label>Post type</label>
            <div className="tabs-inline" style={{ display: 'flex', width: '100%' }}>
              <button
                type="button"
                className={`tab-inline grow ${mediaType === 'IMAGE' ? 'active' : ''}`}
                onClick={() => setMediaType('IMAGE')}
              >
                <span className="flex" style={{ justifyContent: 'center', gap: 6 }}>
                  <ImageIcon size={15} /> Image
                </span>
              </button>
              <button
                type="button"
                className={`tab-inline grow ${mediaType === 'REELS' ? 'active' : ''}`}
                onClick={() => setMediaType('REELS')}
              >
                <span className="flex" style={{ justifyContent: 'center', gap: 6 }}>
                  <Film size={15} /> Reel
                </span>
              </button>
            </div>
          </div>

          <div className="field">
            <label>
              {mediaType === 'REELS'
                ? 'Public video URL (.mp4)'
                : 'Public image URL (.jpg / .png)'}
            </label>
            <input
              type="url"
              value={mediaUrl}
              placeholder="https://cdn.example.com/my-media.jpg"
              onChange={(e) => setMediaUrl(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Caption (optional)</label>
            <textarea
              value={caption}
              placeholder="Write a caption… Comment 'Interested' and I'll DM you the details!"
              onChange={(e) => setCaption(e.target.value)}
              style={{ minHeight: 120 }}
            />
            <div className="hint">
              Tip: mention a keyword so InstaPilot knows when to auto-reply.
            </div>
          </div>

          <button
            className="btn premium block"
            onClick={publish}
            disabled={busy || !isValidUrl}
          >
            {busy ? (
              'Publishing…'
            ) : (
              <>
                <Send size={17} /> Publish to Instagram
              </>
            )}
          </button>
        </motion.div>

        {/* Live-ish preview */}
        <motion.div
          className="card"
          {...fadeUp}
          style={{ position: 'sticky', top: 88 }}
        >
          <div className="panel-head">
            <h3>Preview</h3>
            <span className="badge kw">
              <Sparkles size={12} /> {mediaType === 'REELS' ? 'Reel' : 'Image'}
            </span>
          </div>
          <div
            className="post-thumb-wrap"
            style={{ borderRadius: 12, border: '1px solid var(--border)' }}
          >
            {isValidUrl ? (
              mediaType === 'REELS' ? (
                <video
                  src={mediaUrl}
                  className="post-thumb"
                  muted
                  playsInline
                  controls
                />
              ) : (
                <img className="post-thumb" src={mediaUrl} alt="preview" />
              )
            ) : (
              <div className="post-thumb placeholder">
                <Info size={26} />
                Paste a public URL to preview
              </div>
            )}
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="post-caption" style={{ WebkitLineClamp: 4 }}>
              {caption || <span className="faint">Your caption appears here…</span>}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
