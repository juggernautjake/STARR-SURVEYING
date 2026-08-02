'use client';
// app/AndrewAsh/studio/media/MediaGrid.tsx
//
// ── COPY-THE-REFERENCE IS THE PRIMARY ACTION ────────────────────────────────────────────────────
//
// A media library's job is not to display files; it is to get a file INTO a page. The reference —
// a manifest id for a bundled photo, a URL for an upload — is what a widget's field wants, so it is
// one click away on every tile. Without it the workflow is right-click, copy image address, hope it
// was the right one.
//
// Built-in photos cannot be deleted. They ship with the repository, so a delete button would either
// lie or break the pages using them.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, FileAudio, FileVideo, ImageIcon, Loader2, Trash2 } from 'lucide-react';
import { formatBytes } from '@/lib/voice/attachments';

interface Item {
  id: string;
  title: string;
  kind: string;
  url: string;
  sizeBytes: number;
  isBuiltIn: boolean;
  reference: string;
}

const FILTERS = [
  { id: 'all', label: 'Everything' },
  { id: 'image', label: 'Photos' },
  { id: 'audio', label: 'Audio' },
  { id: 'video', label: 'Video' },
];

export default function MediaGrid({ uploaded, builtIn }: { uploaded: Item[]; builtIn: Item[] }): React.ReactElement {
  const router = useRouter();
  const [filter, setFilter] = useState('all');
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const all = [...uploaded, ...builtIn];
  const shown = filter === 'all' ? all : all.filter((i) => i.kind === filter);

  const Icon = (kind: string) => (kind === 'audio' ? FileAudio : kind === 'video' ? FileVideo : ImageIcon);

  return (
    <div className="vaPanel">
      <div className="vaPanelHead">
        <h2 className="vaPanelTitle">Library</h2>
        <span className="vaMuted" style={{ fontSize: '0.75rem' }}>{all.length} items</span>
      </div>

      <div className="vaTabRow">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`vaTab${filter === f.id ? ' vaTabActive' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            <span className="vaTabCount">{f.id === 'all' ? all.length : all.filter((i) => i.kind === f.id).length}</span>
          </button>
        ))}
      </div>

      <div className="vaMediaGrid">
        {shown.map((item) => {
          const K = Icon(item.kind);
          return (
            <div key={`${item.isBuiltIn ? 'b' : 'u'}-${item.id}`} className="vaMediaTile">
              <div className="vaMediaThumb">
                {item.kind === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt="" loading="lazy" />
                ) : (
                  <K size={26} aria-hidden />
                )}
              </div>

              <div className="vaMediaMeta">
                <span className="vaMediaTitle" title={item.title}>{item.title}</span>
                <span className="vaMediaSub">
                  {item.isBuiltIn ? 'Built in' : formatBytes(item.sizeBytes) || item.kind}
                </span>
              </div>

              <div className="vaMediaActions">
                <button
                  type="button"
                  className="vaBtn vaBtnOutline vaBtnSm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(item.reference);
                      setCopied(item.id);
                      window.setTimeout(() => setCopied(null), 2000);
                    } catch {
                      /* clipboard refused — the reference is visible in the title attribute */
                    }
                  }}
                  title={item.isBuiltIn ? 'Copy the photo id for a widget' : 'Copy the URL'}
                >
                  {copied === item.id ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
                  {copied === item.id ? 'Copied' : item.isBuiltIn ? 'Copy id' : 'Copy URL'}
                </button>

                {!item.isBuiltIn && (
                  <button
                    type="button"
                    className="vaBtn vaBtnGhost vaBtnSm"
                    style={{ color: '#ff9c7e' }}
                    disabled={busy === item.id}
                    onClick={async () => {
                      if (!window.confirm(`Delete "${item.title}"? Any page using it will lose it.`)) return;
                      setBusy(item.id);
                      await fetch(`/api/voice/media?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' });
                      setBusy(null);
                      router.refresh();
                    }}
                  >
                    {busy === item.id ? <Loader2 size={12} aria-hidden className="vaSpin" /> : <Trash2 size={12} aria-hidden />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="vaHint" style={{ marginTop: 16 }}>
        In a page, an image widget takes a <strong>photo id</strong> for the built-in shots or a{' '}
        <strong>URL</strong> for anything you upload. Copy takes the right one either way.
      </p>
    </div>
  );
}
