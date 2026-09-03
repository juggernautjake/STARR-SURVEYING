// app/admin/research/components/SourceDocumentViewer.tsx
// Document viewer modal with Page Images (default) and Extracted Text tabs.
// Features: built-in zoom/pan viewer, drawing annotations, per-image summaries.
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ResearchDocument } from '@/types/research';
import { DOCUMENT_TYPE_LABELS } from '@/types/research';
import {
  fitScale, isAtFit, clampZoom, nextRotation, viewerIntent, isTypingTarget,
  VIEWER_SHORTCUTS, ZOOM_STEP, WHEEL_STEP, type Rotation,
} from '@/lib/viewers/viewer-fit';
// A `storage_url` is a string built by `getPublicUrl`, never a check that the file exists.
import { storedFileUrl } from '@/lib/research/stored-file';
import { confidencePercentLabel } from '@/lib/research/confidence-scale';
// Markup that survives closing the viewer, kept apart from the original (research plan R24).
import {
  normaliseWidth,
  toNormalised,
  toPixels,
  widthInPixels,
  type AnnotationLayer,
  type Stroke,
} from '@/lib/research/document-annotations';

interface SourceDocumentViewerProps {
  document: ResearchDocument;
  /** Extra PDF URL from pipeline result (pagesPdfUrl) — used when DB record has no pdf url yet */
  pagesPdfUrl?: string | null;
  highlightText?: string;
  onClose: () => void;
  /** Needed to address the annotations route (plan R24). Without it the viewer still draws but
   *  cannot save — so the toolbar says so rather than pretending. */
  projectId?: string;
}

type ViewTab = 'images' | 'text';

/** Returns the best available PDF URL for inline viewing */
function getPdfUrl(doc: ResearchDocument, extra?: string | null): string | null {
  if (extra) return extra;
  if (doc.pages_pdf_url) return doc.pages_pdf_url;
  // Same rule as the images below: only a file that was actually stored.
  const su = storedFileUrl(doc) ?? '';
  if (su && (su.endsWith('.pdf') || su.includes('/pdf') || doc.file_type === 'pdf')) return su;
  return null;
}

/** Extract individual page image URLs from ocr_regions JSON or storage_url */
function getPageImageUrls(doc: ResearchDocument): string[] {
  const urls: string[] = [];

  // Try to get page URLs from ocr_regions (stored as JSON by artifact uploader)
  if (doc.ocr_regions) {
    try {
      const parsed = typeof doc.ocr_regions === 'string'
        ? JSON.parse(doc.ocr_regions)
        : doc.ocr_regions;
      if (parsed?.pageUrls && Array.isArray(parsed.pageUrls)) {
        urls.push(...parsed.pageUrls.filter(Boolean));
      }
    } catch { /* not valid JSON */ }
  }

  // Fallback: use the stored file if it's an image.
  //
  // `storedFileUrl`, not `doc.storage_url`. 22 live rows carry a `storage_url` beside a NULL
  // `storage_path` — a URL built by `getPublicUrl` for an upload that never landed. Pushing one
  // here makes the viewer report "1 page" and render a broken box, which is a worse answer than
  // "no page images", because it looks like the image failed to load THIS time.
  const stored = storedFileUrl(doc);
  if (urls.length === 0 && stored) {
    if (/\.(png|jpe?g|gif|webp|tiff?)/i.test(stored) || doc.file_type === 'png' || doc.file_type === 'jpg') {
      urls.push(stored);
    }
  }

  return urls;
}

/** Generate a short summary for each image based on document info */
function getImageSummary(doc: ResearchDocument, pageIndex: number, totalPages: number): string {
  const docType = doc.document_type ? (DOCUMENT_TYPE_LABELS[doc.document_type]?.label ?? doc.document_type) : 'Document';
  const label = doc.document_label || doc.original_filename || 'Untitled';

  if (totalPages === 1) {
    return `${docType}: ${label}`;
  }
  return `${docType}: ${label} — Page ${pageIndex + 1} of ${totalPages}`;
}

export default function SourceDocumentViewer({
  document: doc,
  pagesPdfUrl,
  highlightText,
  onClose,
  projectId,
}: SourceDocumentViewerProps) {
  const pdfUrl = getPdfUrl(doc, pagesPdfUrl);
  const pageImageUrls = getPageImageUrls(doc);
  const hasText = !!(doc.extracted_text);
  const hasImages = pageImageUrls.length > 0 || !!pdfUrl;

  // Page Images tab is shown FIRST by default
  const defaultTab: ViewTab = hasImages ? 'images' : 'text';
  const [activeTab, setActiveTab] = useState<ViewTab>(defaultTab);
  const [pdfLoadError, setPdfLoadError] = useState(false);
  const [expanded, setExpanded] = useState(true);

  // Image viewer state
  const [currentPage, setCurrentPage] = useState(0);
  // 1 is a bad default and was the bug: it means 100% of the image's NATURAL size, not "fits the
  // window". A 2550×3300 scan in a 900px-tall panel at zoom 1 shows the top third of the page, and
  // clicking to the next page put you back there every time. `fitZoom` is computed from the real
  // dimensions once the image loads — see `fitToContainer`.
  const [zoom, setZoom] = useState(1);
  /** The scale at which the whole page is visible. The default, and what Reset returns to. */
  const [fitZoom, setFitZoom] = useState(1);
  /** Set when the page changes, cleared once the new image has been measured and fitted. */
  const needsFit = useRef(true);
  // ── ROTATION ────────────────────────────────────────────────────────────────────────────────
  //
  // A county scan arriving sideways is not the exception; on plats it is close to the rule. Before
  // this there was no way to turn one at all — the only viewer in the product that could rotate was
  // the JOBS file viewer, which nobody had complained about.
  //
  // Deliberately NOT persisted per document. A rotation is a way of looking at the page for the
  // next thirty seconds, not a fact about the file, and storing it means the next person opens a
  // document already turned with no clue why.
  const [rotation, setRotation] = useState<Rotation>(0);
  /** Whether the viewer is currently the browser's full-screen element. */
  const [isFullscreen, setIsFullscreen] = useState(false);
  /** The shortcut list, off by default. See the comment at its render site. */
  const [showKeys, setShowKeys] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [drawColor, setDrawColor] = useState('#ff3333');
  const [drawWidth, setDrawWidth] = useState(3);
  const [drawPaths, setDrawPaths] = useState<Map<number, Array<{ points: { x: number; y: number }[]; color: string; width: number }>>>(new Map());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Markup persistence (plan R24).
  const [savingMarkup, setSavingMarkup] = useState(false);
  const [annotationError, setAnnotationError] = useState<string | null>(null);
  /** Unsaved strokes exist. Drives the warning on close — losing markup silently is the failure
   *  this whole slice exists to end. */
  const [dirty, setDirty] = useState(false);

  const typeInfo = doc.document_type ? DOCUMENT_TYPE_LABELS[doc.document_type] : null;
  const text = doc.extracted_text || '';
  const overlayRef = useRef<HTMLDivElement>(null);
  /** The modal panel. Full screen is requested on this, not on the overlay: the overlay is a
   *  translucent backdrop, and full-screening it fills the screen with the backdrop. */
  const panelRef = useRef<HTMLDivElement>(null);
  /** The download anchor in the toolbar. The `d` shortcut clicks the real link rather than
   *  building a second download path — one implementation, so the key and the button cannot end up
   *  saving different things. */
  const downloadRef = useRef<HTMLAnchorElement>(null);

  // Auto-focus the modal on mount so arrow keys work immediately
  useEffect(() => {
    overlayRef.current?.focus();
  }, []);

  // ── FIT THE WHOLE PAGE, EVERY TIME ──────────────────────────────────────────────────────────
  //
  // Owner: *"the default view should show the full image/page each time the user opens a image/file
  // or clicks between pages. once they are viewing the page, they can zoom in and out and pan."*
  //
  // The image is laid out at `maxWidth: 100%`, so its width already fits the container — but a
  // portrait scan constrained to the container's WIDTH is far taller than the container, and the
  // wrapper's `scale(1)` left it that way. Only the top of the page was ever on screen.
  //
  // So the fit is the smaller of the two ratios, and it is capped at 1: a small image is shown at
  // its own size rather than blown up into a blur.
  const fitToContainer = useCallback((forRotation?: Rotation) => {
    const el = containerRef.current;
    const img = imgRef.current;
    if (!el || !img || !img.naturalWidth || !img.naturalHeight) return;

    // The arithmetic — and its five edge cases — is `lib/viewers/viewer-fit.ts`, where it can be
    // tested against numbers instead of against a browser. `null` means not measurable yet.
    //
    // `forRotation` exists because `setRotation` is asynchronous: the rotate handler needs the fit
    // for the turn it is APPLYING, not the one still in state. Reading `rotation` here would fit
    // the previous orientation and leave a turned portrait scan running off both sides — a bug
    // that looks exactly like the one this module was written to fix.
    const scale = fitScale({
      containerW: el.clientWidth,
      containerH: el.clientHeight,
      naturalW: img.naturalWidth,
      naturalH: img.naturalHeight,
      rotation: forRotation ?? rotation,
    });
    if (scale === null) return;

    setFitZoom(scale);
    setZoom(scale);
    setPosition({ x: 0, y: 0 });
    needsFit.current = false;
  }, [rotation]);

  /** Turn a quarter, and re-fit to the box the page now occupies. */
  const rotateBy = useCallback((direction: 'cw' | 'ccw') => {
    const next = nextRotation(rotation, direction);
    setRotation(next);
    fitToContainer(next);
  }, [rotation, fitToContainer]);

  // A page change asks for a re-fit. It does not set a zoom itself: the new image's dimensions are
  // not known yet, and guessing produces exactly the flash of wrong scale this is meant to remove.
  // `onLoad` fires for every `src` change, cached or not, and does the measuring.
  //
  // The ROTATION deliberately survives a page change. A deed scanned sideways is scanned sideways
  // on all fourteen pages, and re-turning it fourteen times is the thing somebody would complain
  // about next. It resets when the viewer closes, because the component unmounts.
  useEffect(() => {
    needsFit.current = true;
    setPosition({ x: 0, y: 0 });
  }, [currentPage]);

  // ── FULL SCREEN ─────────────────────────────────────────────────────────────────────────────
  //
  // A survey plat in a 900px panel inside a modal is a picture of a plat, not a plat you can read.
  //
  // The state is driven by the `fullscreenchange` EVENT rather than set optimistically next to the
  // request, because the browser is the authority: Escape leaves full screen without calling
  // anything of ours, a request can be refused outright, and an optimistic flag would then label
  // the button "Exit full screen" on a window that is not. `requestFullscreen` also rejects rather
  // than throwing synchronously, so the promise is caught.
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = panelRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => { /* already out */ });
    } else if (el.requestFullscreen) {
      void el.requestFullscreen().catch(() => { /* refused; the button simply does nothing */ });
    }
  }, []);

  // Full screen changes the container's size, so what "the whole page" means changes with it.
  // Same rule as the resize observer: only re-fit somebody who had not zoomed away.
  useEffect(() => {
    if (isAtFit(zoom, fitZoom)) fitToContainer();
    // `fitToContainer` is intentionally out of the deps: including it re-runs this on every
    // rotation, which would snap a zoomed reader back to fit for a reason unrelated to full screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen]);

  // ── DOWNLOAD ────────────────────────────────────────────────────────────────────────────────
  //
  // `SourceDocumentViewer` had ZERO occurrences of the word `download`. The scan was on screen and
  // there was no way to keep it.
  //
  // A plain `<a download>` is the honest implementation and it comes with a caveat worth stating:
  // the `download` attribute is ignored cross-origin, and these files are served from Supabase
  // storage. So the anchor also carries `target="_blank"` — same-origin it saves, cross-origin it
  // opens in a tab the person can save from. Both outcomes end with the file in their hands; a
  // fetch-and-blob dance would force the whole scan through the browser's memory to guarantee the
  // nicer one, and silently fail on a CORS header nobody controls.
  const downloadName = useCallback((pageIndex: number, total: number) => {
    const base = (doc.document_label || doc.original_filename || 'document')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'document';
    return total > 1 ? `${base}-p${pageIndex + 1}.png` : `${base}.png`;
  }, [doc.document_label, doc.original_filename]);

  // Re-fit when the panel resizes — opening the drawing sidebar, rotating a tablet, or dragging the
  // window narrower all change what "the whole page" means.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      // Only re-fit somebody who has not zoomed away from it. Snapping a person back to fit while
      // they are reading a detail at 400% would be worse than the bug being fixed.
      if (isAtFit(zoom, fitZoom)) fitToContainer();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [zoom, fitZoom, fitToContainer, activeTab]);

  // ── Drawing logic ──────────────────────────────────────────────────────

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    canvas.width = img.naturalWidth || img.width || 800;
    canvas.height = img.naturalHeight || img.height || 600;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pagePaths = drawPaths.get(currentPage);
    if (!pagePaths || pagePaths.length === 0) return;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const path of pagePaths) {
      if (path.points.length < 2) continue;
      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.width;
      ctx.beginPath();
      ctx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y);
      }
      ctx.stroke();
    }
  }, [currentPage, drawPaths]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // ── Persisting the markup (plan R24) ──────────────────────────────────────
  //
  // The canvas above has existed since this component was written, and `drawPaths` was React state
  // and nothing else — close the viewer and every mark a surveyor made was gone. A feature that
  // looks complete and keeps nothing is worse than one that is missing.
  //
  // Strokes are stored as FRACTIONS of the page, not the canvas pixels used here: the canvas is
  // sized to `img.naturalWidth`, so pixel coordinates pin the markup to one rendering of one scan,
  // and a page re-uploaded at another resolution moves it silently.

  const loadAnnotations = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/admin/research/${projectId}/documents/${doc.id}/annotations`);
      if (!res.ok) { setAnnotationError('Saved markup could not be loaded — it has not been lost, this view failed to fetch it.'); return; }
      const { layers } = await res.json() as { layers: AnnotationLayer[] };
      const canvas = canvasRef.current;
      const w = canvas?.width || imgRef.current?.naturalWidth || 0;
      const h = canvas?.height || imgRef.current?.naturalHeight || 0;
      if (!w || !h) return;

      const byPage = new Map<number, Array<{ points: { x: number; y: number }[]; color: string; width: number }>>();
      for (const layer of layers.filter(l => l.visible)) {
        const existing = byPage.get(layer.page) ?? [];
        byPage.set(layer.page, [
          ...existing,
          ...layer.strokes.map(s => ({
            points: toPixels(s.points, w, h),
            color: s.color,
            width: widthInPixels(s.width, w),
          })),
        ]);
      }
      setDrawPaths(byPage);
      setAnnotationError(null);
      setDirty(false);
    } catch {
      setAnnotationError('Saved markup could not be loaded — it has not been lost, this view failed to fetch it.');
    }
  }, [projectId, doc.id]);

  const saveAnnotations = useCallback(async () => {
    if (!projectId) return;
    const canvas = canvasRef.current;
    const w = canvas?.width || 0;
    const h = canvas?.height || 0;
    if (!w || !h) return;

    setSavingMarkup(true);
    try {
      const paths = drawPaths.get(currentPage) ?? [];
      const strokes: Stroke[] = paths.map(p => ({
        kind: 'freehand' as const,
        points: toNormalised(p.points, w, h),
        color: p.color,
        width: normaliseWidth(p.width, w),
      }));
      const res = await fetch(`/api/admin/research/${projectId}/documents/${doc.id}/annotations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: currentPage, layerName: 'Markup', strokes, visible: true }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        setAnnotationError(err.error ?? 'The markup could not be saved.');
        return;
      }
      setAnnotationError(null);
      setDirty(false);
    } catch {
      setAnnotationError('The markup could not be saved — check your connection.');
    } finally {
      setSavingMarkup(false);
    }
  }, [projectId, doc.id, drawPaths, currentPage]);

  useEffect(() => { void loadAnnotations(); }, [loadAnnotations]);

  function handleCanvasMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawMode) return;
    setIsDrawing(true);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !canvasRef.current) return;
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    setDrawPaths(prev => {
      const next = new Map(prev);
      const existing = next.get(currentPage) || [];
      next.set(currentPage, [...existing, { points: [{ x, y }], color: drawColor, width: drawWidth }]);
      return next;
    });
    setDirty(true);
  }

  function handleCanvasMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing || !drawMode) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !canvasRef.current) return;
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    setDrawPaths(prev => {
      const next = new Map(prev);
      const paths = next.get(currentPage) || [];
      if (paths.length === 0) return next;
      const last = paths[paths.length - 1];
      const updatedLast = { ...last, points: [...last.points, { x, y }] };
      next.set(currentPage, [...paths.slice(0, -1), updatedLast]);
      return next;
    });
    redrawCanvas();
  }

  function handleCanvasMouseUp() {
    setIsDrawing(false);
    redrawCanvas();
  }

  function clearDrawings() {
    setDrawPaths(prev => {
      const next = new Map(prev);
      next.delete(currentPage);
      return next;
    });
  }

  // ── Image viewer drag (pan) ────────────────────────────────────────────

  function handleImgMouseDown(e: React.MouseEvent) {
    if (drawMode) return;
    e.preventDefault();
    setDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  }

  function handleImgMouseMove(e: React.MouseEvent) {
    if (!dragging || drawMode) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }

  function handleImgMouseUp() {
    setDragging(false);
  }

  // Zoom with scroll wheel
  useEffect(() => {
    const el = containerRef.current;
    if (!el || activeTab !== 'images') return;
    function onWheel(e: WheelEvent) {
      if (drawMode) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -WHEEL_STEP : WHEEL_STEP;
      setZoom(prev => {
        const next = clampZoom(prev + delta);
        console.log(`[SourceDocumentViewer] Scroll zoom: ${(prev * 100).toFixed(0)}% → ${(next * 100).toFixed(0)}%`, {
          deltaY: e.deltaY,
        });
        return next;
      });
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [activeTab, drawMode]);

  /** Back to the whole page. Reset used to mean 100% of natural size, which on most scans was the
   *  zoomed-in state somebody was pressing it to escape. */
  function resetView() {
    fitToContainer();
  }

  // ── Extracted text with summary ────────────────────────────────────────

  function renderExtractedText() {
    if (!text) {
      return (
        <div className="research-viewer__empty">
          No extracted text available for this document.
          {hasImages && (
            <p style={{ marginTop: '0.5rem' }}>
              <button
                className="research-viewer__tab-btn"
                onClick={() => setActiveTab('images')}
              >
                View Page Images →
              </button>
            </p>
          )}
        </div>
      );
    }

    // Build a summary of the document
    const docType = typeInfo?.label ?? doc.document_type ?? 'Document';
    const pageCount = doc.page_count ?? pageImageUrls.length;
    const summaryParts: string[] = [];
    summaryParts.push(`Document type: ${docType}`);
    if (pageCount > 0) summaryParts.push(`Pages: ${pageCount}`);
    if (doc.recording_info) summaryParts.push(`Recording: ${doc.recording_info}`);
    if (doc.source_url) summaryParts.push(`Source: ${doc.source_url}`);

    return (
      <div className="research-viewer__text-wrap">
        {/* Document summary */}
        <div className="research-viewer__text-summary">
          <strong>Document Summary</strong>
          <ul>
            {summaryParts.map((part, i) => (
              <li key={i}>{part}</li>
            ))}
          </ul>
          {/* Per-image summaries */}
          {pageImageUrls.length > 0 && (
            <div className="research-viewer__text-summary-pages">
              <strong>Page Images:</strong>
              <ul>
                {pageImageUrls.map((_, i) => (
                  <li key={i}>{getImageSummary(doc, i, pageImageUrls.length)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Extracted text content */}
        <div className="research-viewer__text-separator">
          {renderHighlightedText()}
        </div>
      </div>
    );
  }

  function renderHighlightedText() {
    if (!highlightText || highlightText.length < 5) {
      return <pre className="research-viewer__text">{text}</pre>;
    }

    const lowerText = text.toLowerCase();
    const lowerHighlight = highlightText.toLowerCase().trim();
    const idx = lowerText.indexOf(lowerHighlight);
    const startIdx = idx !== -1 ? idx : lowerText.indexOf(lowerHighlight.substring(0, 50));

    if (startIdx === -1) {
      return <pre className="research-viewer__text">{text}</pre>;
    }

    const endIdx = startIdx + (idx !== -1 ? highlightText.length : 50);
    return (
      <pre className="research-viewer__text">
        {text.substring(0, startIdx)}
        <mark className="research-viewer__highlight">
          {text.substring(startIdx, endIdx)}
        </mark>
        {text.substring(endIdx)}
      </pre>
    );
  }

  // ── Image viewer ───────────────────────────────────────────────────────

  function renderImageViewer() {
    // If we have individual page images, show them with zoom/pan/draw
    if (pageImageUrls.length > 0) {
      const imgUrl = pageImageUrls[currentPage];
      const summary = getImageSummary(doc, currentPage, pageImageUrls.length);

      return (
        <div className="research-viewer__img-viewer">
          {/* Toolbar */}
          <div className="research-viewer__img-toolbar">
            <div className="research-viewer__img-toolbar-left">
              {/* Page navigation */}
              {pageImageUrls.length > 1 && (
                <>
                  <button
                    onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                    title="Previous page"
                  >
                    ‹ Prev
                  </button>
                  <span className="research-viewer__img-page-info">
                    {currentPage + 1} / {pageImageUrls.length}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(pageImageUrls.length - 1, p + 1))}
                    disabled={currentPage === pageImageUrls.length - 1}
                    title="Next page"
                  >
                    Next ›
                  </button>
                </>
              )}
            </div>
            <div className="research-viewer__img-toolbar-right">
              {/* Zoom controls */}
              <button onClick={() => setZoom(z => { const next = clampZoom(z - 0.25); console.log(`[SourceDocumentViewer] Zoom OUT button: ${(z * 100).toFixed(0)}% → ${(next * 100).toFixed(0)}%`); return next; })} title="Zoom out">−</button>
              <span className="research-viewer__img-zoom-info">
                {Math.round(zoom * 100)}%{isAtFit(zoom, fitZoom) ? ' · fit' : ''}
              </span>
              <button onClick={() => setZoom(z => { const next = clampZoom(z + ZOOM_STEP); console.log(`[SourceDocumentViewer] Zoom IN button: ${(z * 100).toFixed(0)}% → ${(next * 100).toFixed(0)}%`); return next; })} title="Zoom in (+)">+</button>
              <button onClick={resetView} title="Fit the whole page in view (0)">⟲ Fit</button>
              <button onClick={() => { setZoom(1); setPosition({ x: 0, y: 0 }); }}
                      title="Actual size — 100% of the scan's own pixels (1)"
                      data-active={isAtFit(zoom, 1) && !isAtFit(fitZoom, 1) ? 'true' : undefined}>
                1:1
              </button>

              {/* ── Rotate ──────────────────────────────────────────────────────────────────
                  A sideways scan is the normal case for a plat, and until now this viewer could
                  not turn one. The angle is shown when it is not zero, so somebody who turned the
                  page and scrolled away can still tell why it looks like that. */}
              <span className="research-viewer__img-divider" />
              <button onClick={() => rotateBy('ccw')} title="Rotate left (⇧R)">⤺</button>
              <button onClick={() => rotateBy('cw')} title="Rotate right (R)">⤼</button>
              {rotation !== 0 && (
                <span className="research-viewer__img-zoom-info" aria-live="polite">{rotation}°</span>
              )}

              {/* ── Save the file you are looking at ────────────────────────────────────────
                  Cross-origin the `download` attribute is ignored and this opens a tab instead;
                  both endings put the file in somebody's hands. See `downloadName`. */}
              <a
                ref={downloadRef}
                href={imgUrl}
                download={downloadName(currentPage, pageImageUrls.length)}
                target="_blank"
                rel="noopener noreferrer"
                className="research-viewer__img-download"
                title={`Download this page (D) — ${downloadName(currentPage, pageImageUrls.length)}`}
                onClick={(e) => e.stopPropagation()}
              >
                ⇓
              </a>

              {/* Draw controls */}
              <span className="research-viewer__img-divider" />
              <button
                onClick={() => setDrawMode(!drawMode)}
                title={drawMode ? 'Stop drawing' : 'Draw on image'}
                data-active={drawMode ? 'true' : undefined}
              >
                {drawMode ? '✏ Drawing' : '✏ Draw'}
              </button>
              {drawMode && (
                <>
                  {/* Color picker */}
                  {['#ff3333', '#3366ff', '#33cc33', '#ff9900', '#9933ff', '#000000'].map(c => (
                    <button
                      key={c}
                      onClick={() => setDrawColor(c)}
                      title={`Draw color: ${c}`}
                      className="research-viewer__color-swatch"
                      style={{
                        background: c,
                        outline: drawColor === c ? '2px solid #fff' : 'none',
                        boxShadow: drawColor === c ? `0 0 0 3px ${c}` : 'none',
                      }}
                    />
                  ))}
                  {/* Line width */}
                  <select
                    value={drawWidth}
                    onChange={e => setDrawWidth(Number(e.target.value))}
                    className="research-viewer__line-width-select"
                    title="Line width"
                  >
                    <option value={2}>Thin</option>
                    <option value={3}>Medium</option>
                    <option value={5}>Thick</option>
                    <option value={8}>Extra Thick</option>
                  </select>
                </>
              )}
              {drawPaths.has(currentPage) && (
                <button onClick={clearDrawings} title="Clear drawings on this page">
                  🗑 Clear
                </button>
              )}

              {/* Saving the markup (plan R24). Without this the canvas draws and keeps nothing —
                  which is how somebody marks up a plat, closes the tab, and finds out too late. */}
              {projectId ? (
                <button
                  onClick={() => void saveAnnotations()}
                  disabled={savingMarkup || !dirty}
                  title={dirty
                    ? 'Save this markup. The original document is not modified.'
                    : 'Nothing new to save — the markup on this page is already stored.'}
                  data-active={dirty ? 'true' : undefined}
                >
                  {savingMarkup ? '⏳ Saving…' : dirty ? '💾 Save markup' : '✓ Markup saved'}
                </button>
              ) : (
                // Honest about the limitation rather than offering a button that cannot work.
                <span className="research-viewer__markup-note" title="This viewer was opened without a project, so markup cannot be saved.">
                  markup not saveable here
                </span>
              )}

              {/* A save or load failure has to be visible: silence here reads as "it saved", which
                  is the assumption that loses the work. */}
              {annotationError && (
                <span className="research-viewer__markup-error" role="alert">{annotationError}</span>
              )}

              {/* Expand toggle, and true full screen.
                  Two different things, and the labels now say which is which: Expand grows the
                  modal inside the page, Full screen hands the panel to the browser. */}
              <span className="research-viewer__img-divider" />
              <button onClick={() => setExpanded(!expanded)} title={expanded ? 'Shrink the modal' : 'Grow the modal within the page'}>
                {expanded ? '⊟ Shrink' : '⊞ Expand'}
              </button>
              <button onClick={toggleFullscreen}
                      title={isFullscreen ? 'Leave full screen (F, or Esc)' : 'Full screen (F)'}
                      data-active={isFullscreen ? 'true' : undefined}>
                {isFullscreen ? '⤡ Exit full screen' : '⤢ Full screen'}
              </button>
            </div>
          </div>

          {/* Image caption + keyboard hint */}
          {/* ── The shortcut hint, DERIVED ──────────────────────────────────────────────────
              Rendered from `VIEWER_SHORTCUTS`, the same list `viewerIntent` reads. The previous
              version was hand-typed and named two of the three keys that worked; a hand-typed
              list of thirteen would be wrong within a week. Adding a shortcut to the module now
              adds it here, and removing one removes it from both.

              Behind a toggle rather than inline: thirteen "← Previous page" pairs across a caption
              bar is thirteen things competing with the caption, which is the one line saying WHICH
              page of WHICH document you are looking at. */}
          <div className="research-viewer__img-caption">
            <span className="research-viewer__img-caption-text">{summary}</span>
            <button
              type="button"
              className="research-viewer__key-toggle"
              aria-expanded={showKeys}
              onClick={() => setShowKeys((v) => !v)}
              title="Keyboard shortcuts for this viewer"
            >
              ⌨ Shortcuts
            </button>
          </div>

          {showKeys && (
            <div className="research-viewer__key-hint" role="group" aria-label="Keyboard shortcuts">
              {VIEWER_SHORTCUTS
                .filter((s) => !s.paged || pageImageUrls.length > 1)
                .map((s) => (
                  <span className="research-viewer__key-hint-item" key={s.intent}>
                    <kbd>{s.shown}</kbd> {s.label}
                  </span>
                ))}
            </div>
          )}

          {/* Image display area with zoom/pan/draw */}
          <div
            className={`research-viewer__img-container${drawMode ? ' research-viewer__img-container--draw' : dragging ? ' research-viewer__img-container--dragging' : ''}`}
            ref={containerRef}
            onMouseDown={drawMode ? undefined : handleImgMouseDown}
            onMouseMove={drawMode ? undefined : handleImgMouseMove}
            onMouseUp={drawMode ? undefined : handleImgMouseUp}
            onMouseLeave={drawMode ? undefined : handleImgMouseUp}
          >
            <div
              style={{
                // Order matters only in that the translate is applied in SCREEN space and must
                // come first — pan then stays "one pixel of drag is one pixel of movement"
                // whatever the page is turned to. `rotate` and `scale` commute for a uniform
                // scale, so their order between themselves is not load-bearing.
                transform: `translate(${position.x}px, ${position.y}px) rotate(${rotation}deg) scale(${zoom})`,
                transition: dragging ? 'none' : 'transform 0.15s ease',
                transformOrigin: 'center center',
                position: 'relative',
                display: 'inline-block',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={imgUrl}
                alt={summary}
                style={{ maxWidth: '100%', display: 'block', userSelect: 'none' }}
                draggable={false}
                onLoad={() => {
                  // Fires on every src change, so this is the one place that reliably knows the
                  // new page's real dimensions.
                  if (needsFit.current) fitToContainer();
                  redrawCanvas();
                }}
              />
              {/* Drawing canvas overlay */}
              <canvas
                ref={canvasRef}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: drawMode ? 'auto' : 'none',
                }}
              />
            </div>
          </div>
        </div>
      );
    }

    // Fallback: show PDF in iframe (no individual images available)
    if (pdfUrl) {
      if (pdfLoadError) {
        return (
          <div className="research-viewer__pdf-error">
            <p>Could not load document in the browser viewer.</p>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="research-viewer__pdf-link"
              onClick={(e) => e.stopPropagation()}
            >
              Open document in new tab
            </a>
          </div>
        );
      }

      return (
        <div className="research-viewer__pdf-wrap">
          <div className="research-viewer__pdf-toolbar">
            <span className="research-viewer__pdf-label">
              {doc.page_count
                ? `${doc.page_count} page${doc.page_count !== 1 ? 's' : ''}`
                : 'Document Pages'}
            </span>
            {/* ── PDF CONTROLS ──────────────────────────────────────────────────────────────
                Deliberately only two, and this is the reason: `#toolbar=1` keeps the BROWSER's own
                PDF toolbar, which already has zoom, rotate, page navigation and download, and it
                does all four better than a re-implementation over an iframe could — the page
                content is not reachable from here to zoom it.
                What the browser's toolbar cannot do is resize the modal around itself, so those
                are the two added. `zoom=page-fit` already gives the PDF path the whole-page
                default the image path was missing. */}
            {/* Grouped, because the toolbar is `justify-content: space-between` — three loose
                children would spread themselves across the bar rather than sitting together
                opposite the label. */}
            <div className="research-viewer__pdf-acts">
              <button
                onClick={() => setExpanded(!expanded)}
                className="research-viewer__pdf-open-btn"
                title={expanded ? 'Shrink the modal' : 'Grow the modal within the page'}
              >
                {expanded ? '⊟ Shrink' : '⊞ Expand'}
              </button>
              <button
                onClick={toggleFullscreen}
                className="research-viewer__pdf-open-btn"
                title={isFullscreen ? 'Leave full screen' : 'Full screen'}
              >
                {isFullscreen ? '⤡ Exit full screen' : '⤢ Full screen'}
              </button>
              <a
                href={pdfUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="research-viewer__pdf-open-btn"
                title="Download this document"
                onClick={(e) => e.stopPropagation()}
              >
                ⇓ Download
              </a>
            </div>
          </div>
          <iframe
            src={`${pdfUrl}#toolbar=1&navpanes=0&scrollbar=1&zoom=page-fit`}
            title={doc.document_label || doc.original_filename || 'Document Pages'}
            className="research-viewer__pdf-iframe"
            onError={() => setPdfLoadError(true)}
          />
        </div>
      );
    }

    return (
      <div className="research-viewer__empty">
        No page images available for this document.
      </div>
    );
  }

  /** Closing with unsaved strokes is the precise loss this slice exists to end, so it asks once
   *  rather than discarding silently. */
  const requestClose = useCallback(() => {
    if (dirty && !window.confirm('This page has unsaved markup. Close without saving it?')) return;
    onClose();
  }, [dirty, onClose]);

  // ── Keyboard ───────────────────────────────────────────────────────────

  // Every shortcut resolves through `viewerIntent`, which reads the same `VIEWER_SHORTCUTS` list
  // the on-screen hint renders. Before this the viewer handled three keys and printed a hint for
  // two of them; every other control was mouse-only.
  //
  // The switch is exhaustive over the intents this viewer can serve. `download` and `fullscreen`
  // fall through to their handlers; `actual-size` is 100% of natural pixels, which is what the old
  // Reset button did and is still occasionally what you want — it is now a separate key rather than
  // the default nobody chose.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // A `d` typed into the caption field must write a `d`.
      if (isTypingTarget(e.target)) return;

      const intent = viewerIntent(e);
      if (intent === null) return;

      if (intent === 'close') {
        // Escape backs out of drawing first, then out of full screen (the browser does that one
        // itself), then closes. Closing straight from draw mode would discard a stroke somebody was
        // mid-way through.
        if (drawMode) setDrawMode(false);
        else if (!document.fullscreenElement) requestClose();
        return;
      }

      // Everything below acts on the image viewer. On the text tab they mean nothing, and
      // swallowing them there would break find-in-page and text selection.
      if (activeTab !== 'images' || pageImageUrls.length === 0) return;

      const lastPage = pageImageUrls.length - 1;
      switch (intent) {
        case 'prev-page':   setCurrentPage(p => Math.max(0, p - 1)); break;
        case 'next-page':   setCurrentPage(p => Math.min(lastPage, p + 1)); break;
        case 'first-page':  setCurrentPage(0); break;
        case 'last-page':   setCurrentPage(lastPage); break;
        case 'zoom-in':     setZoom(z => clampZoom(z + ZOOM_STEP)); break;
        case 'zoom-out':    setZoom(z => clampZoom(z - ZOOM_STEP)); break;
        case 'fit':         fitToContainer(); break;
        case 'actual-size': setZoom(1); setPosition({ x: 0, y: 0 }); break;
        case 'rotate-cw':   rotateBy('cw'); break;
        case 'rotate-ccw':  rotateBy('ccw'); break;
        case 'fullscreen':  toggleFullscreen(); break;
        case 'download':    downloadRef.current?.click(); break;
        default: break;
      }
      // Only prevented for keys that were actually handled — `preventDefault` on the whole handler
      // would eat Tab and the browser's own find.
      e.preventDefault();
    },
    [requestClose, drawMode, activeTab, pageImageUrls.length, fitToContainer, rotateBy, toggleFullscreen],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Scroll highlight into view when switching to text tab
  useEffect(() => {
    if (activeTab !== 'text') return;
    const el = document.querySelector('.research-viewer__highlight');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeTab, text, highlightText]);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div
      ref={overlayRef}
      className="research-viewer-overlay"
      onClick={requestClose}
      role="dialog"
      aria-modal="true"
      aria-label={doc.document_label || doc.original_filename || 'Document Viewer'}
      tabIndex={-1}
      style={{ outline: 'none' }}
    >
      <div
        ref={panelRef}
        className={`research-viewer${expanded ? ' research-viewer--expanded' : ''}${hasImages ? ' research-viewer--with-pdf' : ''}${isFullscreen ? ' research-viewer--fullscreen' : ''}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="research-viewer__header">
          <div className="research-viewer__header-info">
            <span className="research-viewer__header-icon">
              {typeInfo?.icon || (hasImages ? '🖼️' : doc.source_type === 'manual_entry' ? '📝' : '📄')}
            </span>
            <div>
              <div className="research-viewer__header-name">
                {doc.document_label || doc.original_filename || 'Untitled'}
              </div>
              <div className="research-viewer__header-meta">
                {typeInfo && <span>{typeInfo.label}</span>}
                {doc.recording_info && <span>{doc.recording_info}</span>}
                {doc.page_count && (
                  <span>{doc.page_count} page{doc.page_count !== 1 ? 's' : ''}</span>
                )}
                {doc.source_url && (
                  <a
                    href={doc.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Source ↗
                  </a>
                )}
              </div>
            </div>
          </div>
          <button className="research-viewer__close" onClick={requestClose} aria-label="Close viewer">
            &times;
          </button>
        </div>

        {/* OCR confidence — see lib/research/confidence-scale.ts. This read the column raw and
            appended "%", which is right for an app-written row (0–100) and turns a worker-written
            row into "0.92%". ReviewDocCard made the opposite assumption about the same column and
            rendered an app row as "9000%". */}
        {confidencePercentLabel(doc.ocr_confidence) && (
          <div className="research-viewer__confidence">
            OCR Confidence: {confidencePercentLabel(doc.ocr_confidence)}
          </div>
        )}

        {/* Tab bar — Page Images first, Extracted Text second */}
        {(hasText || hasImages) && (hasText && hasImages) && (
          <div className="research-viewer__tabs" role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === 'images'}
              className={`research-viewer__tab${activeTab === 'images' ? ' research-viewer__tab--active' : ''}`}
              onClick={() => { setActiveTab('images'); setPdfLoadError(false); }}
            >
              🖼️ Page Images
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'text'}
              className={`research-viewer__tab${activeTab === 'text' ? ' research-viewer__tab--active' : ''}`}
              onClick={() => setActiveTab('text')}
            >
              📝 Extracted Text
            </button>
          </div>
        )}

        {/* Body */}
        <div
          className={`research-viewer__body${activeTab === 'images' ? ' research-viewer__body--pdf' : ''}`}
          role="tabpanel"
        >
          {activeTab === 'images' && renderImageViewer()}
          {activeTab === 'text' && renderExtractedText()}
        </div>
      </div>
    </div>
  );
}
