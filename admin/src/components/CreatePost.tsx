import { useState } from 'react';
import { api } from '../api';

export function CreatePost() {
  const [mediaType, setMediaType] = useState<'IMAGE' | 'REELS'>('IMAGE');
  const [mediaUrl, setMediaUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

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
      setMediaUrl('');
      setCaption('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to publish');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="section-head">
        <h2>Create a new post</h2>
      </div>

      <div className="banner warn">
        Instagram publishes from a <strong>public URL</strong> — Meta downloads the
        file itself, so <code className="inline">localhost</code> won’t work. Host the
        image/video somewhere public (S3, Cloudinary, etc.) and paste the URL.
        Requires the <code className="inline">instagram_content_publish</code>{' '}
        permission. Reels take a few seconds to process before publishing.
      </div>

      {error && <div className="banner error">{error}</div>}
      {okMsg && <div className="banner ok">{okMsg}</div>}

      <div className="card" style={{ maxWidth: 620 }}>
        <div className="field">
          <label>Post type</label>
          <select
            value={mediaType}
            onChange={(e) => setMediaType(e.target.value as 'IMAGE' | 'REELS')}
          >
            <option value="IMAGE">Image (feed post)</option>
            <option value="REELS">Reel (video)</option>
          </select>
        </div>

        <div className="field">
          <label>
            {mediaType === 'REELS' ? 'Public video URL (.mp4)' : 'Public image URL (.jpg/.png)'}
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
          />
        </div>

        <button className="btn" onClick={publish} disabled={busy || !mediaUrl.trim()}>
          {busy ? 'Publishing…' : 'Publish to Instagram'}
        </button>
      </div>
    </div>
  );
}
