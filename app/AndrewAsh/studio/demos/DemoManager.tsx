'use client';
// app/AndrewAsh/studio/demos/DemoManager.tsx
//
// ── A REEL CAN POINT AT A URL OR AT THE LIBRARY ─────────────────────────────────────────────────
//
// Both, because they solve different moments. Early on the reel lives on SoundCloud or Dropbox and
// pasting a link is the fastest route to a working page. Later it is uploaded here, and referencing
// it by media id means re-recording it updates every page that plays it without hunting for pasted
// URLs. Supporting only the second would have made "get something on the site today" impossible.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AudioLines, Check, Loader2, Plus, Trash2 } from 'lucide-react';
import StudioUploader from '../_ui/StudioUploader';

interface Demo {
  id: string;
  title: string;
  category: string;
  description: string;
  audioUrl: string;
  traits: string[];
  featured: boolean;
}

const CATEGORIES = [
  { id: 'commercial', label: 'Commercial' },
  { id: 'telephony', label: 'Telephony & on-hold' },
  { id: 'narration', label: 'Narration & e-learning' },
  { id: 'character', label: 'Character' },
  { id: 'promo', label: 'Promo' },
  { id: 'singing', label: 'Singing' },
];

export default function DemoManager({
  demos,
  audioLibrary,
  missing,
}: {
  demos: Demo[];
  audioLibrary: { id: string; title: string; url: string }[];
  missing: { category: string; title: string; blurb: string }[];
}): React.ReactElement {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('commercial');
  const [description, setDescription] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [traits, setTraits] = useState('');

  async function call(method: string, body: Record<string, unknown> | null, key: string, query = ''): Promise<boolean> {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/voice/demos${query}`, {
        method,
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That did not work.');
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  function startAdd(cat: string, suggestedTitle: string, suggestedBlurb: string): void {
    setAdding(cat);
    setCategory(cat);
    setTitle(suggestedTitle);
    setDescription(suggestedBlurb);
    setAudioUrl('');
    setTraits('');
  }

  return (
    <>
      {error && (
        <div className="vaNotice vaNoticeBad" role="alert">
          {error}
        </div>
      )}

      <div className="vaPanel">
        <div className="vaPanelHead">
          <h2 className="vaPanelTitle">Upload a reel</h2>
        </div>
        <StudioUploader
          destination="media"
          accept="audio/*"
          label="Drop an audio file here"
          hint="MP3 or WAV. It lands in your library, then pick it below."
        />
      </div>

      {missing.length > 0 && (
        <div className="vaPanel">
          <div className="vaPanelHead">
            <h2 className="vaPanelTitle">Still to record</h2>
          </div>
          <div className="vaGrid vaGrid2">
            {missing.map((m) => (
              <div key={m.category} className="vaCard">
                <h3 className="vaCardTitle" style={{ fontSize: '1rem' }}>{m.title}</h3>
                <p className="vaCardBody" style={{ marginBottom: 14 }}>{m.blurb}</p>
                <button
                  type="button"
                  className="vaBtn vaBtnOutline vaBtnSm"
                  onClick={() => startAdd(m.category, m.title, m.blurb)}
                >
                  <Plus size={13} aria-hidden /> Add this one
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="vaPanel">
        <div className="vaPanelHead">
          <h2 className="vaPanelTitle">
            <AudioLines size={15} aria-hidden style={{ verticalAlign: -2, marginRight: 8, color: 'var(--va-accent)' }} />
            Live reels
          </h2>
          {!adding && (
            <button type="button" className="vaBtn vaBtnOutline vaBtnSm" onClick={() => startAdd('commercial', '', '')}>
              <Plus size={13} aria-hidden /> Add a reel
            </button>
          )}
        </div>

        {demos.length === 0 ? (
          <p className="vaMuted" style={{ margin: 0, fontSize: '0.9375rem' }}>
            Nothing published yet. The site is showing four &ldquo;coming soon&rdquo; players.
          </p>
        ) : (
          <table className="vaDataTable">
            <thead>
              <tr>
                <th>Reel</th>
                <th>Category</th>
                <th>Audio</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {demos.map((d) => (
                <tr key={d.id}>
                  <td data-label="Reel">
                    <span style={{ color: 'var(--va-text)', fontWeight: 600 }}>{d.title}</span>
                    {d.description && (
                      <span style={{ display: 'block', color: 'var(--va-text-muted)', fontSize: '0.8125rem' }}>
                        {d.description}
                      </span>
                    )}
                  </td>
                  <td data-label="Category">{CATEGORIES.find((c) => c.id === d.category)?.label ?? d.category}</td>
                  <td data-label="Audio">
                    {d.audioUrl ? (
                      // Playable right here — checking that the right take is attached should not
                      // require opening the public site.
                      <audio controls preload="none" src={d.audioUrl} style={{ maxWidth: 220, height: 34 }} />
                    ) : (
                      <span className="vaStatusPill vaStatusDraft">No audio</span>
                    )}
                  </td>
                  <td data-label="">
                    <button
                      type="button"
                      className="vaBtn vaBtnGhost vaBtnSm"
                      style={{ color: '#ff9c7e' }}
                      disabled={busy === d.id}
                      onClick={() => {
                        if (!window.confirm(`Remove "${d.title}" from the site?`)) return;
                        void call('DELETE', null, d.id, `?id=${encodeURIComponent(d.id)}`);
                      }}
                    >
                      {busy === d.id ? <Loader2 size={12} aria-hidden className="vaSpin" /> : <Trash2 size={12} aria-hidden />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {adding && (
          <div style={{ marginTop: 18, borderTop: '1px solid var(--va-line)', paddingTop: 18 }}>
            <div className="vaFieldRow vaFieldRow2">
              <div className="vaField">
                <label className="vaLabel" htmlFor="va-dm-title">Name it</label>
                <input id="va-dm-title" className="vaInput" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Commercial reel" />
              </div>
              <div className="vaField">
                <label className="vaLabel" htmlFor="va-dm-cat">Category</label>
                <select id="va-dm-cat" className="vaSelect" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="vaField">
              <label className="vaLabel" htmlFor="va-dm-audio">The audio</label>
              {audioLibrary.length > 0 && (
                <select
                  className="vaSelect"
                  style={{ marginBottom: 8 }}
                  value=""
                  onChange={(e) => {
                    const found = audioLibrary.find((a) => a.id === e.target.value);
                    if (found) setAudioUrl(found.url);
                  }}
                >
                  <option value="">Pick from your library…</option>
                  {audioLibrary.map((a) => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                </select>
              )}
              <input
                id="va-dm-audio"
                className="vaInput"
                value={audioUrl}
                onChange={(e) => setAudioUrl(e.target.value)}
                placeholder="…or paste a direct audio URL"
              />
              <p className="vaHint">A link works fine to get something live today; upload it here when you can.</p>
            </div>

            <div className="vaField">
              <label className="vaLabel" htmlFor="va-dm-desc">One line about it</label>
              <input id="va-dm-desc" className="vaInput" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div className="vaField">
              <label className="vaLabel" htmlFor="va-dm-traits">Traits, comma separated</label>
              <input id="va-dm-traits" className="vaInput" value={traits} onChange={(e) => setTraits(e.target.value)} placeholder="Warm, conversational, confident" />
              <p className="vaHint">Shown under the player. These are the words a casting director scans for.</p>
            </div>

            <div className="vaStudioActions">
              <button
                type="button"
                className="vaBtn vaBtnSolid vaBtnSm"
                disabled={busy === 'add' || !title.trim()}
                onClick={async () => {
                  const ok = await call(
                    'POST',
                    {
                      title,
                      category,
                      description,
                      audioUrl,
                      traits: traits.split(',').map((t) => t.trim()).filter(Boolean),
                      sortOrder: demos.length,
                    },
                    'add',
                  );
                  if (ok) setAdding(null);
                }}
              >
                {busy === 'add' ? <Loader2 size={14} aria-hidden className="vaSpin" /> : <Check size={14} aria-hidden />}
                Put it on the site
              </button>
              <button type="button" className="vaBtn vaBtnGhost vaBtnSm" onClick={() => setAdding(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
