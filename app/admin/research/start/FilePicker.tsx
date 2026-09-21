'use client';
// app/admin/research/start/FilePicker.tsx — choosing what the AI actually reads.
//
// Owner, 2026-09-21: "I want it so that we can specifically choose which files get used for the
// research. There should be a pop up window or something with all of the files showing with large
// rendered thumbnails and their names, and the user has to select which files he wants to be
// included in the AI research pipeline and analysis."
//
// ── WHY A THUMBNAIL AND NOT A FILE NAME ─────────────────────────────────────────────────────────
//
// Because survey files are named things like `IMG_4471.HEIC`, `Scan_20260914.pdf` and
// `document (3).pdf`. A list of those is not a choice anybody can make — the operator would have to
// open six of them to find the deed. A page-one render answers it at a glance, which is the whole
// reason the thumbnail system in seeds/644 exists.
//
// A missing thumbnail is ORDINARY here, not an error: `thumb_state` is `pending` until a browser
// generates one and `unsupported` when nothing can. Both draw a labelled placeholder showing the
// file's kind and extension. A broken-image icon would read as a broken FILE, and somebody would
// leave the deed out because it looked corrupt.
//
// ── WHY SELECTION IS EXPLICIT ───────────────────────────────────────────────────────────────────
//
// Everything ticked here is copied into the research project and read by a model that costs money
// per page. The default ticks documents and leaves site photography alone — 147 of this database's
// 182 job files are photos and video — but the operator makes the call, and the dialog shows what
// the defaults did rather than hiding it.

import { useEffect, useRef, useState } from 'react';
import type { OfferedFile } from '@/lib/research/job-documents';
import './FilePicker.css';

const KIND_LABEL: Record<string, string> = {
  document: 'Document',
  media: 'Photo / video',
  other: 'File',
};

function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name ?? '');
  return m ? m[1]!.toUpperCase() : 'FILE';
}

function prettySize(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FilePicker({
  files, picked, onDone, onClose,
}: {
  files: OfferedFile[];
  picked: Set<string>;
  onDone: (next: Set<string>) => void;
  onClose: () => void;
}) {
  // A working copy. Closing with Cancel or Escape must leave the real selection untouched —
  // otherwise "look at what I picked" silently becomes "change what I picked".
  const [draft, setDraft] = useState<Set<string>>(() => new Set(picked));
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape closes, and focus starts inside the dialog rather than wherever it was on the page
  // behind it. Without this a screen-reader user lands on the page they cannot see any more.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    // The page behind must not scroll under the dialog.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const toggle = (id: string, blocked: boolean) => {
    if (blocked) return;
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectable = files.filter((f) => !f.why.startsWith('too large'));
  const allDocs = selectable.filter((f) => f.verdict === 'document').map((f) => f.id);

  return (
    <div
      className="fpick__scrim"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="research-file-picker"
    >
      <div className="fpick" role="dialog" aria-modal="true" aria-labelledby="fpick-title" ref={dialogRef}>
        <header className="fpick__head">
          <div>
            <h2 id="fpick-title" className="fpick__title">Which files should the research read?</h2>
            <p className="fpick__sub">
              Everything you pick is copied into the research project and read by the AI. Each page
              costs money to read, so leave out what it does not need.
            </p>
          </div>
          <button type="button" className="fpick__x" onClick={onClose} aria-label="Close" ref={closeRef}>×</button>
        </header>

        <div className="fpick__bulk">
          <button type="button" className="fpick__bulkbtn" onClick={() => setDraft(new Set(allDocs))}>
            Documents only
          </button>
          <button type="button" className="fpick__bulkbtn" onClick={() => setDraft(new Set(selectable.map((f) => f.id)))}>
            Select all
          </button>
          <button type="button" className="fpick__bulkbtn" onClick={() => setDraft(new Set())}>
            Clear
          </button>
          <span className="fpick__count" aria-live="polite">
            {draft.size} of {files.length} selected
          </span>
        </div>

        <div className="fpick__grid">
          {files.map((f) => {
            const blocked = f.why.startsWith('too large');
            const on = draft.has(f.id);
            return (
              <div
                key={f.id}
                className={`fpick__card${on ? ' fpick__card--on' : ''}${blocked ? ' fpick__card--blocked' : ''}`}
                data-testid={`fpick-file-${f.id}`}
              >
                <button
                  type="button"
                  className="fpick__hit"
                  aria-pressed={on}
                  disabled={blocked}
                  onClick={() => toggle(f.id, blocked)}
                  title={blocked ? f.why : on ? 'Leave this one out' : 'Include this one'}
                >
                  <span className="fpick__thumb">
                    {/* A bare <img>, not next/image, and the lint warning about it is expected.
                        These are SIGNED Supabase URLs with a short TTL: the optimizer would need
                        the storage host allow-listed, would cache a URL that expires, and would
                        bill for proxying an image that is already a thumbnail. The map's file
                        panel renders the same URLs the same way for the same reason. */}
                    {f.thumbUrl
                      ? <img className="fpick__img" src={f.thumbUrl} alt="" loading="lazy" />
                      : (
                        <span className="fpick__noimg">
                          <span className="fpick__ext">{extensionOf(f.name)}</span>
                          <span className="fpick__kind">{KIND_LABEL[f.verdict] ?? 'File'}</span>
                        </span>
                      )}
                    <span className={`fpick__tick${on ? ' fpick__tick--on' : ''}`} aria-hidden>{on ? '✓' : ''}</span>
                  </span>
                  <span className="fpick__name" title={f.name}>{f.name}</span>
                  <span className="fpick__meta">
                    {[KIND_LABEL[f.verdict], prettySize(f.sizeBytes)].filter(Boolean).join(' · ')}
                  </span>
                  {blocked && <span className="fpick__blocked">{f.why}</span>}
                </button>

                {f.url && (
                  /* Opening the file is how somebody settles "is this the deed or the tax notice?"
                     when the thumbnail is a wall of small text. Outside the toggle button, so
                     looking at a file never changes whether it is selected. */
                  <a className="fpick__open" href={f.url} target="_blank" rel="noreferrer">Open ↗</a>
                )}
              </div>
            );
          })}
        </div>

        <footer className="fpick__foot">
          <button type="button" className="fpick__cancel" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="fpick__done"
            onClick={() => onDone(draft)}
            data-testid="fpick-done"
          >
            Use {draft.size} file{draft.size === 1 ? '' : 's'}
          </button>
        </footer>
      </div>
    </div>
  );
}
