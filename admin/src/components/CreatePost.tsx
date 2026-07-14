import { useState } from 'react';
import { motion } from 'framer-motion';
import { Film, Image as ImageIcon, Info, Send, Sparkles } from 'lucide-react';
import { api } from '../api';
import { Banner, fadeUp, useToast } from './ui';
import {
  badge,
  btn,
  card,
  cx,
  field,
  heading,
  hint,
  input,
  label,
  panelHead,
  sectionHead,
  textarea,
} from '../tw';

const tabInline =
  'flex-1 border-0 bg-transparent px-3.5 py-[7px] rounded-[9px] font-sans text-[13px] font-medium cursor-pointer transition-colors duration-150';

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
      <div className={sectionHead}>
        <div>
          <h2 className={cx(heading, 'text-2xl')}>Create a new post</h2>
          <div className="text-muted text-sm mt-1">
            Publish an image or reel straight to Instagram.
          </div>
        </div>
      </div>

      <Banner kind="info">
        Instagram publishes from a <strong>public URL</strong> — Meta downloads
        the file itself, so <code className="bg-surface-2 border border-border text-accent px-1.5 py-px rounded-md text-xs font-mono">localhost</code> won't work.
        Host the media somewhere public (S3, Cloudinary, etc.) and paste the URL.
        Requires the{' '}
        <code className="bg-surface-2 border border-border text-accent px-1.5 py-px rounded-md text-xs font-mono">instagram_content_publish</code>{' '}
        permission.
      </Banner>

      {error && <Banner kind="error">{error}</Banner>}
      {okMsg && <Banner kind="ok">{okMsg}</Banner>}

      <div className="grid gap-5 items-start grid-cols-[1.3fr_1fr] max-[1100px]:grid-cols-1">
        <motion.div className={card} {...fadeUp}>
          <div className={field}>
            <label className={label}>Post type</label>
            <div className="inline-flex w-full gap-1 p-1 bg-surface-2 border border-border rounded-btn">
              <button
                type="button"
                className={cx(
                  tabInline,
                  mediaType === 'IMAGE'
                    ? 'bg-surface text-text shadow-xs'
                    : 'text-muted',
                )}
                onClick={() => setMediaType('IMAGE')}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <ImageIcon size={15} /> Image
                </span>
              </button>
              <button
                type="button"
                className={cx(
                  tabInline,
                  mediaType === 'REELS'
                    ? 'bg-surface text-text shadow-xs'
                    : 'text-muted',
                )}
                onClick={() => setMediaType('REELS')}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <Film size={15} /> Reel
                </span>
              </button>
            </div>
          </div>

          <div className={field}>
            <label className={label}>
              {mediaType === 'REELS'
                ? 'Public video URL (.mp4)'
                : 'Public image URL (.jpg / .png)'}
            </label>
            <input
              type="url"
              className={input}
              value={mediaUrl}
              placeholder="https://cdn.example.com/my-media.jpg"
              onChange={(e) => setMediaUrl(e.target.value)}
            />
          </div>

          <div className={field}>
            <label className={label}>Caption (optional)</label>
            <textarea
              className={cx(textarea, 'min-h-[120px]')}
              value={caption}
              placeholder="Write a caption… Comment 'Interested' and I'll DM you the details!"
              onChange={(e) => setCaption(e.target.value)}
            />
            <div className={hint}>
              Tip: mention a keyword so InstaPilot knows when to auto-reply.
            </div>
          </div>

          <button
            className={cx(btn.premium, 'w-full')}
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
        <motion.div className={cx(card, 'sticky top-[88px]')} {...fadeUp}>
          <div className={panelHead}>
            <h3 className={cx(heading, 'text-base')}>Preview</h3>
            <span className={badge.kw}>
              <Sparkles size={12} /> {mediaType === 'REELS' ? 'Reel' : 'Image'}
            </span>
          </div>
          <div className="relative w-full aspect-square bg-surface-2 overflow-hidden rounded-xl border border-border">
            {isValidUrl ? (
              mediaType === 'REELS' ? (
                <video
                  src={mediaUrl}
                  className="w-full h-full object-cover block"
                  muted
                  playsInline
                  controls
                />
              ) : (
                <img
                  className="w-full h-full object-cover block"
                  src={mediaUrl}
                  alt="preview"
                />
              )
            ) : (
              <div className="flex flex-col items-center justify-center gap-1.5 text-faint text-xs h-full">
                <Info size={26} />
                Paste a public URL to preview
              </div>
            )}
          </div>
          <div className="mt-3.5">
            <div className="text-[13.5px] text-text leading-[1.45] line-clamp-4">
              {caption || (
                <span className="text-faint">Your caption appears here…</span>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
