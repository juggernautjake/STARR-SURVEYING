'use client';
// app/admin/components/files/FileViewer.tsx — THE file viewer. One, for every surface.
//
// Owner, 2026-09-09: "We have one for viewing files in the file explorer, one for files attached
// to a job, one for the research pipeline … We need to make all of these uniform." The viewer takes
// a collection (lib/files/viewer-model.ts) and a set of capabilities, and gives every surface the
// same thing:
//
//   ‹  name  ›   arrows either side of the document name walk the folder
//   zoom in / out / fit, pan by dragging, pages for a PDF (pdf.js, rendered to canvas — the
//   browser's own PDF viewer is never navigated to), rotate
//   ONE Download button → the OS save dialog (lib/files/download.ts), never a page load
//   an info panel: rename, notes, tags, metadata, move / copy to another destination, delete —
//   each shown only when the surface can do it
//   keyboard: ← → files, PgUp PgDn pages, + − zoom, 0 fit, Esc close
//
// Styles: ./FileViewer.css (tokens only). Motion follows app/styles/motion.css.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, RotateCw, Download, Info,
  FileText, Image as ImageIcon, File as FileIcon, Loader2, Check, Pencil, Tag, StickyNote,
  FolderInput, Copy, Trash2, AlertTriangle,
} from 'lucide-react';
import {
  fileKind, neighbourIndex, applyRename, normalizeTags,
  type ViewerCollection, type ViewerFile, type ViewerCapabilities, type Destination,
} from '@/lib/files/viewer-model';
import { downloadFile, canChooseWhereToSave, type SaveOutcome } from '@/lib/files/download';
import { nextRotation, rotationFit, clampZoom, MIN_ZOOM, MAX_ZOOM, type Rotation } from '@/lib/viewers/viewer-fit';
import { formatBytes, formatWhen } from './format';
import './FileViewer.css';

export interface FileViewerProps {
  collection: ViewerCollection;
  /** The file to open first. */
  fileId: string;
  capabilities?: ViewerCapabilities;
  onClose: () => void;
  /** Called after a capability changed a file (rename, notes, tags), so the surface can refresh. */
  onFileChanged?: (file: ViewerFile) => void;
  /** Called after a move or delete removed a file from this collection. */
  onFileRemoved?: (fileId: string) => void;
  /** Called whenever the viewer steps to another file, so a caller that owns the selection can follow. */
  onCurrentChange?: (fileId: string) => void;
  /** A surface's own panel under the details (e.g. a comment thread). */
  extra?: (file: ViewerFile) => React.ReactNode;
}

const ZOOM_STEPS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3, 4];

// ── pdf.js, loaded on first use ───────────────────────────────────────────

type PdfDocument = { numPages: number; getPage(n: number): Promise<PdfPage>; destroy(): Promise<void> };
type PdfPage = {
  getViewport(o: { scale: number; rotation?: number }): { width: number; height: number };
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): { promise: Promise<void>; cancel(): void };
};
type PdfLib = {
  getDocument(src: { url: string; withCredentials?: boolean; wasmUrl?: string; standardFontDataUrl?: string }): { promise: Promise<PdfDocument> };
  GlobalWorkerOptions: { workerSrc: string };
};

const PDFJS_ASSETS = '/pdfjs/';
let pdfLibPromise: Promise<PdfLib> | null = null;
function loadPdfLib(): Promise<PdfLib> {
  if (!pdfLibPromise) {
    // The MINIFIED build on purpose. pdf.mjs is itself a webpack bundle with its own
    // __webpack_require__; under next dev (eval-wrapped modules) that name collides with Next's and
    // module evaluation dies in __webpack_require__.r with 'Object.defineProperty called on
    // non-object' — while next build, which mangles names, passes. pdf.min.mjs has them mangled
    // already, so it evaluates the same way in both (2026-09-10).
    pdfLibPromise = import('pdfjs-dist/build/pdf.min.mjs').then((mod) => {
      const lib = mod as unknown as PdfLib;
      // The worker is a static file copied from node_modules by scripts/copy-pdfjs-assets.mjs
      // (prebuild/predev). Bundling it by URL worked in dev and failed the production build: the
      // minifier rejects the worker's own import.meta. The wasm decoders + standard fonts sit
      // beside it, for scans that use JPEG 2000 and PDFs that reference the base-14 fonts.
      lib.GlobalWorkerOptions.workerSrc = PDFJS_ASSETS + 'pdf.worker.min.mjs';
      return lib;
    });
  }
  return pdfLibPromise;
}

// ── Small pieces ──────────────────────────────────────────────────────────

function KindIcon({ file }: { file: ViewerFile }) {
  const kind = fileKind(file.name, file.mime);
  const Icon = kind === 'image' ? ImageIcon : kind === 'pdf' || kind === 'text' ? FileText : FileIcon;
  return <Icon size={16} aria-hidden="true" />;
}

function TagsEditor({ tags, onChange, disabled }: { tags: string[]; onChange: (tags: string[]) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const next = normalizeTags([...tags, ...draft.split(',')]);
    if (next.join('\n') !== tags.join('\n')) onChange(next);
    setDraft('');
  };
  return (
    <div className="fv-tags">
      {tags.map((t) => (
        <span key={t} className="fv-tag">
          {t}
          <button type="button" className="fv-tag__x" onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Remove tag ${t}`} disabled={disabled}>
            <X size={11} aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        className="fv-tags__input"
        placeholder={tags.length ? 'Add tag…' : 'Add tags, comma-separated…'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); } }}
        disabled={disabled}
        aria-label="Add a tag"
      />
    </div>
  );
}

// ── The viewer ────────────────────────────────────────────────────────────

export default function FileViewer({ collection, fileId, capabilities = {}, onClose, onFileChanged, onFileRemoved, onCurrentChange, extra }: FileViewerProps) {
  const [files, setFiles] = useState<ViewerFile[]>(collection.files);
  useEffect(() => { setFiles(collection.files); }, [collection.files]);
  const [currentId, setCurrentId] = useState(fileId);
  useEffect(() => { setCurrentId(fileId); }, [fileId]);
  useEffect(() => { onCurrentChange?.(currentId); }, [currentId, onCurrentChange]);
  const index = files.findIndex((f) => f.id === currentId);
  const file = files[index] ?? files[0] ?? null;
  const kind = file ? fileKind(file.name, file.mime) : 'other';

  // ── view state ──
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  const [rotation, setRotation] = useState<Rotation>(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** How much smaller a fitted image has to be to survive a quarter turn (lib/viewers/viewer-fit). */
  const [turnFit, setTurnFit] = useState(1);
  const pdfRef = useRef<PdfDocument | null>(null);
  const renderTaskRef = useRef<{ cancel(): void } | null>(null);
  const [textBody, setTextBody] = useState<string | null>(null);

  // A new file resets the view.
  useEffect(() => {
    setZoom(1); setFit(true); setRotation(0); setTurnFit(1); setPan({ x: 0, y: 0 }); setPage(1); setPageCount(null);
    setLoadError(null); setTextBody(null);
  }, [currentId]);

  // ── PDF: open the document, render the page ──
  useEffect(() => {
    if (!file || kind !== 'pdf' || !file.url) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const lib = await loadPdfLib();
        const doc = await lib.getDocument({ url: file.url!, withCredentials: file.url!.startsWith('/'), wasmUrl: PDFJS_ASSETS + 'wasm/', standardFontDataUrl: PDFJS_ASSETS + 'standard_fonts/' }).promise;
        if (cancelled) { void doc.destroy(); return; }
        pdfRef.current = doc;
        setPageCount(doc.numPages);
        setLoading(false);
      } catch (err) {
        // The message is shown; the stack goes to the console, because "defineProperty called on
        // non-object" says nothing about WHERE without it.
        console.error('[FileViewer] could not open the PDF', err);
        if (!cancelled) { setLoadError(err instanceof Error ? err.message : String(err)); setLoading(false); }
      }
    })();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      const doc = pdfRef.current;
      pdfRef.current = null;
      if (doc) void doc.destroy();
    };
  }, [file, kind]);

  const renderPdfPage = useCallback(async () => {
    const doc = pdfRef.current;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!doc || !canvas || !stage) return;
    renderTaskRef.current?.cancel();
    const pdfPage = await doc.getPage(page);
    const base = pdfPage.getViewport({ scale: 1, rotation });
    const fitScale = Math.min((stage.clientWidth - 48) / base.width, (stage.clientHeight - 48) / base.height);
    const scale = (fit ? fitScale : zoom) * (window.devicePixelRatio || 1);
    const viewport = pdfPage.getViewport({ scale, rotation });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width / (window.devicePixelRatio || 1))}px`;
    canvas.style.height = `${Math.floor(viewport.height / (window.devicePixelRatio || 1))}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const task = pdfPage.render({ canvasContext: ctx, viewport });
    renderTaskRef.current = task;
    try { await task.promise; } catch { /* cancelled by a newer render */ }
  }, [page, zoom, fit, rotation]);

  useEffect(() => { if (kind === 'pdf' && pageCount) void renderPdfPage(); }, [kind, pageCount, renderPdfPage]);
  useEffect(() => {
    if (kind !== 'pdf') return;
    const onResize = () => { if (fit) void renderPdfPage(); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [kind, fit, renderPdfPage]);

  // ── text files ──
  useEffect(() => {
    if (!file || kind !== 'text' || !file.url) return;
    let cancelled = false;
    setLoading(true);
    fetch(file.url, { credentials: 'include' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((t) => { if (!cancelled) { setTextBody(t.slice(0, 200_000)); setLoading(false); } })
      .catch((err) => { if (!cancelled) { setLoadError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [file, kind]);

  // ── navigation ──
  const goTo = useCallback((step: 1 | -1) => {
    if (!file) return;
    const j = neighbourIndex(files, file.id, step);
    if (j !== null) setCurrentId(files[j].id);
  }, [files, file]);
  const prevIndex = file ? neighbourIndex(files, file.id, -1) : null;
  const nextIndex = file ? neighbourIndex(files, file.id, 1) : null;

  const zoomBy = useCallback((dir: 1 | -1) => {
    setFit(false);
    setZoom((z) => {
      const current = z;
      const next = dir > 0 ? ZOOM_STEPS.find((s) => s > current + 0.001) ?? Math.min(MAX_ZOOM, current * 1.25)
                           : [...ZOOM_STEPS].reverse().find((s) => s < current - 0.001) ?? Math.max(MIN_ZOOM, current / 1.25);
      return clampZoom(next);
    });
  }, []);
  const fitToScreen = useCallback(() => { setFit(true); setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  // A turned image is measured as the browser laid it out (clientWidth, not the transformed box)
  // and scaled so its long side still fits the short side of the stage. PDFs are rotated by pdf.js
  // in the viewport itself, so no extra scale applies to them.
  const rotate = useCallback(() => {
    const next = nextRotation(rotation, 'cw');
    setRotation(next);
    const img = imgRef.current;
    const stage = stageRef.current;
    if (kind === 'image' && img && stage) {
      setTurnFit(rotationFit({
        containerW: stage.clientWidth, containerH: stage.clientHeight,
        laidOutW: img.clientWidth, laidOutH: img.clientHeight, rotation: next,
      }));
    } else {
      setTurnFit(1);
    }
  }, [rotation, kind]);

  const close = useCallback(() => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 160);
  }, [closing, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goTo(1); }
      else if (e.key === 'PageDown' || e.key === 'ArrowDown') { if (kind === 'pdf' && pageCount) { e.preventDefault(); setPage((p) => Math.min(pageCount, p + 1)); } }
      else if (e.key === 'PageUp' || e.key === 'ArrowUp') { if (kind === 'pdf') { e.preventDefault(); setPage((p) => Math.max(1, p - 1)); } }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(1); }
      else if (e.key === '-') { e.preventDefault(); zoomBy(-1); }
      else if (e.key === '0') { e.preventDefault(); fitToScreen(); }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); rotate(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, goTo, zoomBy, fitToScreen, rotate, kind, pageCount]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ── pan by dragging, zoom by wheel ──
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPan({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) });
  };
  const onPointerUp = () => { drag.current = null; };
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1 : -1);
  };

  // ── download ──
  const [downloading, setDownloading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const download = async () => {
    if (!file) return;
    const url = file.downloadUrl ?? file.url;
    if (!url) { setNotice('This file has no download location.'); return; }
    setDownloading(true);
    setNotice(null);
    try {
      const outcome: SaveOutcome = await downloadFile(url, file.name, file.mime);
      if (outcome === 'saved') setNotice('Saved.');
      else if (outcome === 'downloaded') setNotice('Downloaded to your browser\'s download folder.');
    } catch (err) {
      setNotice(`Could not download: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDownloading(false);
      window.setTimeout(() => setNotice(null), 4000);
    }
  };

  // ── capabilities ──
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [destinations, setDestinations] = useState<Destination[] | null>(null);
  const [destinationId, setDestinationId] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  useEffect(() => { setNotesDraft(file?.notes ?? ''); setRenaming(false); setError(null); }, [file?.id, file?.notes]);

  const patchLocal = (updated: ViewerFile) => {
    setFiles((list) => list.map((f) => (f.id === updated.id ? updated : f)));
    onFileChanged?.(updated);
  };
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setError(null);
    try { await fn(); } catch (err) { setError(`${label} failed: ${err instanceof Error ? err.message : String(err)}`); } finally { setBusy(null); }
  };
  const commitRename = () => {
    if (!file || !capabilities.rename) return;
    const next = applyRename(file.name, nameDraft);
    setRenaming(false);
    if (next === file.name) return;
    void run('Rename', async () => patchLocal(await capabilities.rename!(file, next)));
  };
  const openDestinations = async () => {
    if (!file || !capabilities.destinations || destinations) return;
    setDestinations(await capabilities.destinations(file));
  };
  useEffect(() => { setDestinations(null); setDestinationId(''); }, [file?.id]);

  const canEdit = Boolean(capabilities.rename || capabilities.updateNotes || capabilities.updateTags || capabilities.move || capabilities.copy || capabilities.delete);

  if (!file) return null;
  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${fit ? turnFit : zoom}) rotate(${kind === 'pdf' ? 0 : rotation}deg)`;

  return (
    <div className={`fv-overlay${closing ? ' fv-overlay--closing' : ''}`} role="dialog" aria-modal="true" aria-label={`Viewing ${file.name}`}>
      <div className={`fv${infoOpen ? ' fv--info' : ''}`}>
        {/* ── Header: ‹ name › centred, the position beneath (owner, 2026-09-10) ────────────
            The arrows sit directly either side of the name, in the middle of the bar — before this
            the name and ‹ hugged the left edge and › sat far to the right, so the pair read as two
            unrelated controls. The kind icon keeps the left, the actions keep the right; the middle
            column is what is centred. */}
        <header className="fv-head">
          <div className="fv-head__side"><KindIcon file={file} /></div>
          <div className="fv-head__center">
            <div className="fv-head__nav">
            <button type="button" className="fv-nav" onClick={() => goTo(-1)} disabled={prevIndex === null} aria-label="Previous file" title="Previous (←)">
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <div className="fv-head__name">
              {renaming && capabilities.rename ? (
                <input
                  className="fv-head__rename"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false); }}
                  aria-label="File name"
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  className={`fv-head__title${capabilities.rename ? ' fv-head__title--editable' : ''}`}
                  onClick={() => { if (capabilities.rename) { setNameDraft(file.name); setRenaming(true); } }}
                  title={capabilities.rename ? 'Click to rename' : file.name}
                >
                  {file.name}
                  {capabilities.rename ? <Pencil size={12} aria-hidden="true" className="fv-head__pencil" /> : null}
                </button>
              )}
            </div>
            <button type="button" className="fv-nav" onClick={() => goTo(1)} disabled={nextIndex === null} aria-label="Next file" title="Next (→)">
              <ChevronRight size={20} aria-hidden="true" />
            </button>
            </div>
            {/* Where you are: file N of M, and the page for a multi-page document. */}
            <span className="fv-head__count" aria-live="polite">
              {index + 1} / {files.length}{files.length === 1 ? ' file' : ' files'}
              {kind === 'pdf' && pageCount ? ` · Page ${page} of ${pageCount}` : ''}
            </span>
          </div>
          <div className="fv-head__actions">
            <button type="button" className="fv-btn fv-btn--primary" onClick={download} disabled={downloading} title={canChooseWhereToSave() ? 'Choose where to save this file' : 'Download this file'}>
              {downloading ? <Loader2 size={15} className="fv-spin motion-essential" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
              {canChooseWhereToSave() ? 'Save as…' : 'Download'}
            </button>
            {canEdit || (file.meta && file.meta.length > 0) || file.notes || (file.tags && file.tags.length > 0) ? (
              <button type="button" className={`fv-btn${infoOpen ? ' fv-btn--on' : ''}`} onClick={() => setInfoOpen((o) => !o)} aria-pressed={infoOpen} title="Details, notes and tags">
                <Info size={15} aria-hidden="true" /> Details
              </button>
            ) : null}
            <button type="button" className="fv-close" onClick={close} aria-label="Close" title="Close (Esc)">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* ── Toolbar ──────────────────────────────────────────────────── */}
        <div className="fv-tools">
          <div className="fv-tools__group">
            <button type="button" className="fv-tool" onClick={() => zoomBy(-1)} aria-label="Zoom out" title="Zoom out (−)"><ZoomOut size={16} aria-hidden="true" /></button>
            <span className="fv-tools__zoom">{fit ? 'Fit' : `${Math.round(zoom * 100)}%`}</span>
            <button type="button" className="fv-tool" onClick={() => zoomBy(1)} aria-label="Zoom in" title="Zoom in (+)"><ZoomIn size={16} aria-hidden="true" /></button>
            <button type="button" className={`fv-tool${fit ? ' fv-tool--on' : ''}`} onClick={fitToScreen} aria-label="Fit to screen" title="Fit to screen (0)"><Maximize2 size={16} aria-hidden="true" /></button>
            {(kind === 'image' || kind === 'pdf') ? (
              <button type="button" className="fv-tool" onClick={rotate} aria-label="Rotate" title="Rotate 90° (R)"><RotateCw size={16} aria-hidden="true" /></button>
            ) : null}
          </div>
          {kind === 'pdf' && pageCount ? (
            <div className="fv-tools__group">
              <button type="button" className="fv-tool" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Previous page" title="Previous page (PgUp)"><ChevronLeft size={16} aria-hidden="true" /></button>
              <span className="fv-tools__pages">
                Page
                <input
                  className="fv-tools__page-input"
                  type="number"
                  min={1}
                  max={pageCount}
                  value={page}
                  onChange={(e) => { const n = Number(e.target.value); if (n >= 1 && n <= pageCount) setPage(n); }}
                  aria-label="Page number"
                />
                of {pageCount}
              </span>
              <button type="button" className="fv-tool" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount} aria-label="Next page" title="Next page (PgDn)"><ChevronRight size={16} aria-hidden="true" /></button>
            </div>
          ) : null}
          <div className="fv-tools__group fv-tools__hint">
            {kind === 'image' || kind === 'pdf' ? 'Drag to pan · Ctrl + scroll to zoom' : null}
          </div>
        </div>

        {/* ── Stage ────────────────────────────────────────────────────── */}
        <div className="fv-body">
          <div
            ref={stageRef}
            className={`fv-stage${!fit ? ' fv-stage--zoomed' : ''}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            {loading ? <div className="fv-loading"><Loader2 size={22} className="fv-spin motion-essential" aria-hidden="true" /> Loading…</div> : null}
            {loadError ? <div className="fv-message" role="alert"><AlertTriangle size={18} aria-hidden="true" /> Could not open this file: {loadError}</div> : null}
            {kind === 'pdf' && file.url ? (
              <div className="fv-stage__inner" style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
                <canvas ref={canvasRef} className="fv-canvas" />
              </div>
            ) : null}
            {kind === 'image' && file.url ? (
              <div className="fv-stage__inner" style={{ transform }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img ref={imgRef} src={file.url} alt={file.name} className="fv-image" draggable={false} onLoad={() => setLoading(false)} onError={() => setLoadError('the image did not load')} />
              </div>
            ) : null}
            {kind === 'text' && textBody !== null ? (
              <pre className="fv-text" style={{ transform: `scale(${fit ? 1 : zoom})` }}>{textBody}</pre>
            ) : null}
            {kind === 'video' && file.url ? <video className="fv-media" src={file.url} controls /> : null}
            {kind === 'audio' && file.url ? <audio className="fv-media" src={file.url} controls /> : null}
            {(kind === 'other' || !file.url) && !loadError ? (
              <div className="fv-message">
                <FileIcon size={28} aria-hidden="true" />
                <p>{file.url ? 'No preview for this kind of file.' : 'This file has no preview.'} {file.url ? 'Save it to open it on your computer.' : ''}</p>
              </div>
            ) : null}
          </div>

          {/* ── Info panel ────────────────────────────────────────────── */}
          {infoOpen ? (
            <aside className="fv-info" aria-label="File details">
              <h3 className="fv-info__h">Details</h3>
              <dl className="fv-info__facts">
                <dt>Type</dt><dd>{file.mime || kind}</dd>
                <dt>Size</dt><dd>{formatBytes(file.size)}</dd>
                {pageCount ? <><dt>Pages</dt><dd>{pageCount}</dd></> : null}
                {file.createdAt ? <><dt>Added</dt><dd>{formatWhen(file.createdAt)}{file.createdBy ? ` · ${file.createdBy}` : ''}</dd></> : null}
                {file.folder ? <><dt>Folder</dt><dd>{file.folder}</dd></> : null}
                {(file.meta ?? []).map((m) => <React.Fragment key={m.label}><dt>{m.label}</dt><dd>{m.value}</dd></React.Fragment>)}
              </dl>

              <h3 className="fv-info__h"><StickyNote size={13} aria-hidden="true" /> Notes</h3>
              {capabilities.updateNotes ? (
                <textarea
                  className="fv-info__notes"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  onBlur={() => { if (notesDraft !== (file.notes ?? '')) void run('Saving notes', async () => patchLocal(await capabilities.updateNotes!(file, notesDraft))); }}
                  placeholder="What someone opening this file should know…"
                  rows={4}
                />
              ) : (
                <p className="fv-info__ro">{file.notes || 'No notes.'}</p>
              )}

              <h3 className="fv-info__h"><Tag size={13} aria-hidden="true" /> Tags</h3>
              {capabilities.updateTags ? (
                <TagsEditor tags={file.tags ?? []} onChange={(tags) => void run('Saving tags', async () => patchLocal(await capabilities.updateTags!(file, tags)))} disabled={busy !== null} />
              ) : (
                <p className="fv-info__ro">{file.tags?.length ? file.tags.join(', ') : 'No tags.'}</p>
              )}

              {(capabilities.move || capabilities.copy) && capabilities.destinations ? (
                <>
                  <h3 className="fv-info__h"><FolderInput size={13} aria-hidden="true" /> Send to</h3>
                  <div className="fv-info__send">
                    <select className="fv-info__select" value={destinationId} onFocus={() => void openDestinations()} onChange={(e) => setDestinationId(e.target.value)} aria-label="Destination">
                      <option value="">{destinations ? 'Choose a destination…' : 'Loading destinations…'}</option>
                      {(destinations ?? []).map((d) => <option key={d.id} value={d.id}>{d.label}{d.hint ? ` — ${d.hint}` : ''}</option>)}
                    </select>
                    <div className="fv-info__send-actions">
                      {capabilities.copy ? (
                        <button type="button" className="fv-btn" disabled={!destinationId || busy !== null} onClick={() => { const d = destinations?.find((x) => x.id === destinationId); if (d) void run('Copy', async () => { await capabilities.copy!(file, d); setNotice(`Copied to ${d.label}.`); window.setTimeout(() => setNotice(null), 4000); }); }}>
                          <Copy size={14} aria-hidden="true" /> Copy there
                        </button>
                      ) : null}
                      {capabilities.move ? (
                        <button type="button" className="fv-btn" disabled={!destinationId || busy !== null} onClick={() => { const d = destinations?.find((x) => x.id === destinationId); if (d) void run('Move', async () => { await capabilities.move!(file, d); onFileRemoved?.(file.id); const next = files.filter((f) => f.id !== file.id); setFiles(next); if (next.length === 0) close(); else setCurrentId(next[Math.min(index, next.length - 1)].id); }); }}>
                          <FolderInput size={14} aria-hidden="true" /> Move there
                        </button>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : null}

              {capabilities.delete ? (
                <button type="button" className="fv-btn fv-btn--danger" disabled={busy !== null} onClick={() => { if (window.confirm(`Delete "${file.name}"? This cannot be undone.`)) void run('Delete', async () => { await capabilities.delete!(file); onFileRemoved?.(file.id); const next = files.filter((f) => f.id !== file.id); setFiles(next); if (next.length === 0) close(); else setCurrentId(next[Math.min(index, next.length - 1)].id); }); }}>
                  <Trash2 size={14} aria-hidden="true" /> Delete file
                </button>
              ) : null}

              {extra ? extra(file) : null}

              {busy ? <p className="fv-info__busy"><Loader2 size={13} className="fv-spin motion-essential" aria-hidden="true" /> {busy}…</p> : null}
              {error ? <p className="fv-info__error" role="alert">{error}</p> : null}
            </aside>
          ) : null}
        </div>

        {notice ? <div className="fv-notice" role="status"><Check size={14} aria-hidden="true" /> {notice}</div> : null}
      </div>
    </div>
  );
}
