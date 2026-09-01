// app/admin/research/components/ArtifactGallery.tsx
// Gallery viewer for all pipeline artifacts: screenshots, deed images, plat images, etc.
// Fetches from /api/admin/research/{projectId}/artifacts and displays in a
// categorized grid with a full-screen lightbox viewer.
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ── ONE SET OF VIEWER RULES, TWO VIEWERS ────────────────────────────────────────────────────────
//
// The lightbox and `SourceDocumentViewer` are different components for good reasons — one browses a
// run's artifacts, the other reads one document with markup on it — but "what does R do" must have
// the same answer in both, and so must the clamp, the wheel step and the rotation arithmetic.
//
// Measured before this: the two disagreed about everything except Escape. The gallery's ↗ button
// OPENED the file in a tab and was the only thing resembling a download; it had no rotation and no
// full screen at all.
import {
  clampZoom, nextRotation, rotationFit, viewerIntent, isTypingTarget,
  VIEWER_SHORTCUTS, ZOOM_STEP, WHEEL_STEP, type Rotation,
} from '@/lib/viewers/viewer-fit';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Artifact {
  id: string;
  filename: string;
  fileType: string;
  fileSize: number | null;
  storageUrl: string | null;
  pagesPdfUrl: string | null;
  sourceUrl: string | null;
  documentType: string | null;
  label: string;
  status: string;
  extractedText: string | null;
  ocrConfidence: number | null;
  pageCount: number | null;
  recordedDate: string | null;
  recordingInfo: string | null;
  createdAt: string;
  isImage: boolean;
  isPdf: boolean;
  category: string;
}

interface ArtifactGalleryProps {
  projectId: string;
  /**
   * When set, the gallery re-fetches artifacts at this interval (ms).
   * Use during the research stage so new captures appear in real-time.
   * Set to 0 or omit to disable polling (review stage).
   */
  refreshInterval?: number;
}

// ── Category Display Config ───────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { label: string; icon: string; order: number; defaultCollapsed?: boolean }> = {
  screenshots: { label: 'Screenshots', icon: '📸', order: 1 },
  deeds: { label: 'Deed Documents', icon: '📜', order: 2 },
  plats: { label: 'Plat Images', icon: '🗺', order: 3 },
  easements: { label: 'Easement Documents', icon: '⚖', order: 4 },
  fema: { label: 'FEMA Flood Maps', icon: '🌊', order: 5 },
  txdot: { label: 'TxDOT ROW Maps', icon: '🛣', order: 6 },
  aerial: { label: 'Aerial Photos', icon: '🛰', order: 7 },
  topo: { label: 'Topographic Maps', icon: '🏔', order: 8 },
  surveys: { label: 'Surveys', icon: '📐', order: 9 },
  tax: { label: 'Tax/Appraisal Records', icon: '🏛', order: 10 },
  other: { label: 'Other Documents', icon: '📄', order: 99 },
  // screenshots-misc are now filtered out at the API level — never shown
};

function getCategoryConfig(cat: string) {
  return CATEGORY_CONFIG[cat] ?? { label: cat, icon: '📁', order: 50 };
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ArtifactGallery({ projectId, refreshInterval }: ArtifactGalleryProps) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [grouped, setGrouped] = useState<Record<string, Artifact[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxArtifact, setLightboxArtifact] = useState<Artifact | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => {
    // Start with default-collapsed categories collapsed
    const defaults = new Set<string>();
    for (const [cat, config] of Object.entries(CATEGORY_CONFIG)) {
      if (config.defaultCollapsed) defaults.add(cat);
    }
    return defaults;
  });
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  // ── Fetch artifacts (with optional polling) ────────────────────────
  const fetchArtifacts = useCallback(async (isInitial: boolean) => {
    if (isInitial) { setLoading(true); setError(null); }
    try {
      const res = await fetch(`/api/admin/research/${projectId}/artifacts`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setArtifacts(data.artifacts || []);
      setGrouped(data.grouped || {});
    } catch (err) {
      if (isInitial) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    fetchArtifacts(true);
    // Poll for new artifacts during research stage
    let timer: ReturnType<typeof setInterval> | null = null;
    if (refreshInterval && refreshInterval > 0) {
      timer = setInterval(() => {
        if (!cancelled) fetchArtifacts(false);
      }, refreshInterval);
    }
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [fetchArtifacts, refreshInterval]);

  // ── Lightbox navigation ─────────────────────────────────────────────
  const viewableArtifacts = artifacts.filter(a => a.storageUrl && (a.isImage || a.isPdf));

  const openLightbox = useCallback((artifact: Artifact) => {
    const idx = viewableArtifacts.findIndex(a => a.id === artifact.id);
    setLightboxIndex(idx >= 0 ? idx : 0);
    setLightboxArtifact(artifact);
  }, [viewableArtifacts]);

  const closeLightbox = useCallback(() => {
    setLightboxArtifact(null);
  }, []);

  const goNext = useCallback(() => {
    if (viewableArtifacts.length === 0) return;
    const next = (lightboxIndex + 1) % viewableArtifacts.length;
    setLightboxIndex(next);
    setLightboxArtifact(viewableArtifacts[next]);
  }, [lightboxIndex, viewableArtifacts]);

  const goPrev = useCallback(() => {
    if (viewableArtifacts.length === 0) return;
    const prev = (lightboxIndex - 1 + viewableArtifacts.length) % viewableArtifacts.length;
    setLightboxIndex(prev);
    setLightboxArtifact(viewableArtifacts[prev]);
  }, [lightboxIndex, viewableArtifacts]);

  // The keyboard used to live here and handled three keys. It now lives inside `Lightbox`, because
  // the rest of the shortcuts act on state that only the lightbox has — zoom, rotation, full
  // screen. Leaving a second handler up here would fire the arrows twice and skip a page.

  // ── Category toggle ─────────────────────────────────────────────────
  function toggleCategory(cat: string) {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  // ── Sort categories ─────────────────────────────────────────────────
  const sortedCategories = Object.keys(grouped)
    .filter(cat => !filterCategory || cat === filterCategory)
    .sort((a, b) => getCategoryConfig(a).order - getCategoryConfig(b).order);

  // ── Render ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="artifact-gallery artifact-gallery--loading">
        <div className="artifact-gallery__spinner" />
        <p>Loading artifacts...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="artifact-gallery artifact-gallery--error">
        <p>Failed to load artifacts: {error}</p>
        <button onClick={() => setError(null)} className="artifact-gallery__retry-btn">
          Retry
        </button>
      </div>
    );
  }

  if (artifacts.length === 0) {
    // During polling (refreshInterval is set), show a subtle loading state
    // instead of a "no artifacts" message — documents may appear soon.
    if (refreshInterval && refreshInterval > 0) {
      return (
        <div className="artifact-gallery artifact-gallery--empty">
          <p style={{ color: 'var(--theme-fg-secondary, #6B7280)', fontSize: '0.85rem' }}>
            Waiting for documents &amp; screenshots to be captured...
          </p>
        </div>
      );
    }
    return (
      <div className="artifact-gallery artifact-gallery--empty">
        <p>No documents found. Run the research pipeline to capture screenshots and documents.</p>
      </div>
    );
  }

  return (
    <div className="artifact-gallery">
      {/* ── Header & Filter ───────────────────────────────────── */}
      <div className="artifact-gallery__header">
        <h3 className="artifact-gallery__title">
          Documents &amp; Sources ({artifacts.length})
        </h3>
        <div className="artifact-gallery__filters">
          <button
            className={`artifact-gallery__filter-btn ${!filterCategory ? 'artifact-gallery__filter-btn--active' : ''}`}
            onClick={() => setFilterCategory(null)}
          >
            All
          </button>
          {Object.keys(grouped)
            .sort((a, b) => getCategoryConfig(a).order - getCategoryConfig(b).order)
            .map(cat => (
              <button
                key={cat}
                className={`artifact-gallery__filter-btn ${filterCategory === cat ? 'artifact-gallery__filter-btn--active' : ''}`}
                onClick={() => setFilterCategory(filterCategory === cat ? null : cat)}
              >
                {getCategoryConfig(cat).icon} {getCategoryConfig(cat).label} ({grouped[cat].length})
              </button>
            ))}
        </div>
      </div>

      {/* ── Category Sections ──────────────────────────────────── */}
      {sortedCategories.map(cat => {
        const config = getCategoryConfig(cat);
        const items = grouped[cat] || [];
        const collapsed = collapsedCategories.has(cat);

        const isMisc = cat === 'screenshots-misc';

        return (
          <div key={cat} className={`artifact-gallery__section ${isMisc ? 'artifact-gallery__section--misc' : ''}`}>
            <div
              className={`artifact-gallery__section-header ${isMisc ? 'artifact-gallery__section-header--misc' : ''}`}
              onClick={() => toggleCategory(cat)}
            >
              <span className="artifact-gallery__section-icon">{config.icon}</span>
              <span className="artifact-gallery__section-label">{config.label}</span>
              <span className="artifact-gallery__section-count">({items.length})</span>
              {isMisc && (
                <span className="artifact-gallery__section-desc" style={{ fontSize: '0.75rem', opacity: 0.6, marginLeft: '0.5rem' }}>
                  Error pages, empty results, auth walls
                </span>
              )}
              <span className="artifact-gallery__section-chevron">
                {collapsed ? '▶' : '▼'}
              </span>
            </div>

            {!collapsed && (
              <div className="artifact-gallery__list">
                {items.map(artifact => (
                  <ArtifactCard
                    key={artifact.id}
                    artifact={artifact}
                    onView={() => openLightbox(artifact)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Lightbox ───────────────────────────────────────────── */}
      {lightboxArtifact && (
        <Lightbox
          artifact={lightboxArtifact}
          index={lightboxIndex}
          total={viewableArtifacts.length}
          onClose={closeLightbox}
          onNext={goNext}
          onPrev={goPrev}
        />
      )}
    </div>
  );
}

// ── Document type icons (same as review page) ──────────────────────────────────

const DOC_TYPE_ICONS: Record<string, string> = {
  deed: '\uD83D\uDCDC', plat: '\uD83D\uDDFA\uFE0F', survey: '\uD83D\uDCD0',
  legal_description: '\u2696\uFE0F', title_commitment: '\uD83D\uDCCB',
  easement: '\uD83D\uDEE4\uFE0F', restrictive_covenant: '\uD83D\uDCC4',
  field_notes: '\uD83D\uDCD3', subdivision_plat: '\uD83C\uDFD8\uFE0F',
  metes_and_bounds: '\uD83D\uDCCF', county_record: '\uD83C\uDFDB\uFE0F',
  appraisal_record: '\uD83D\uDCB0', aerial_photo: '\uD83D\uDEF0\uFE0F',
  topo_map: '\uD83C\uDFBB', utility_map: '\uD83D\uDD0C',
  gis_map: '\uD83D\uDDFA\uFE0F', flood_map: '\uD83C\uDF0A', property_report: '\uD83C\uDFE0',
  road_map: '\uD83D\uDEE3\uFE0F', deed_screenshot: '\uD83D\uDCDC',
  plat_screenshot: '\uD83D\uDDFA\uFE0F', map_screenshot: '\uD83D\uDDFA\uFE0F',
};

function getDocTypeIcon(docType: string | null): string {
  return (docType && DOC_TYPE_ICONS[docType]) || '\uD83D\uDCCE';
}

function formatDocType(docType: string | null): string {
  if (!docType) return 'Document';
  return docType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Artifact Card (expandable list item — reuses review-doc-card CSS) ────────
// Uses the exact same CSS classes as the review page's ReviewDocCard component
// so the documents look identical in both research and review stages.

function ArtifactCard({ artifact, onView }: { artifact: Artifact; onView: () => void }) {
  const [open, setOpen] = useState(false);
  const viewUrl = artifact.storageUrl || artifact.pagesPdfUrl;
  const canView = !!viewUrl;
  const isImage = artifact.isImage && !!artifact.storageUrl;
  const typeIcon = getDocTypeIcon(artifact.documentType);
  const typeName = formatDocType(artifact.documentType);
  const excerpt = artifact.extractedText
    ? artifact.extractedText.slice(0, 280) + (artifact.extractedText.length > 280 ? '\u2026' : '')
    : null;

  return (
    <div className={`review-doc-card${open ? ' review-doc-card--open' : ''}`}>
      {/* Header row — always visible */}
      <div className="review-doc-card__header" onClick={() => setOpen(o => !o)}>
        <span className="review-doc-card__icon">{typeIcon}</span>
        <span className="review-doc-card__title" title={artifact.label}>
          {artifact.label}
        </span>
        <span className="review-doc-card__type">{typeName}</span>
        {artifact.status === 'analyzed' && (
          <span className="review-doc-card__badge review-doc-card__badge--ok">Analyzed</span>
        )}
        {artifact.status === 'error' && (
          <span className="review-doc-card__badge review-doc-card__badge--err">Error</span>
        )}
        {artifact.pageCount != null && artifact.pageCount > 1 && (
          <span className="review-doc-card__badge review-doc-card__badge--pages">{artifact.pageCount} pg</span>
        )}
        {canView && (
          <button
            onClick={(e) => { e.stopPropagation(); onView(); }}
            className="review-doc-card__view-btn"
            title="Open in viewer"
          >
            View
          </button>
        )}
        <span className="review-doc-card__chevron">{open ? '\u25B2' : '\u25BC'}</span>
      </div>

      {/* Expanded body */}
      {open && (
        <div className="review-doc-card__body">
          <div className="review-doc-card__content-row">
            {/* Thumbnail preview */}
            {isImage && (
              <div className="review-doc-card__thumbnail" onClick={canView ? onView : undefined} role="button" tabIndex={0}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={artifact.storageUrl!} alt={artifact.label} loading="lazy" />
                {artifact.pageCount != null && artifact.pageCount > 1 && (
                  <span className="review-doc-card__thumb-pages">+{artifact.pageCount - 1}</span>
                )}
              </div>
            )}
            <div className="review-doc-card__details">
              {excerpt && (
                <div className="review-doc-card__excerpt">{excerpt}</div>
              )}
              <div className="review-doc-card__meta">
                {artifact.pageCount != null && <span>{artifact.pageCount} page{artifact.pageCount !== 1 ? 's' : ''}</span>}
                {artifact.fileType && <span>{artifact.fileType.toUpperCase()}</span>}
                {artifact.fileSize != null && <span>{formatFileSize(artifact.fileSize)}</span>}
                {artifact.ocrConfidence != null && <span>OCR {Math.round(artifact.ocrConfidence * 100)}%</span>}
                {artifact.createdAt && <span title={artifact.createdAt}>Added {new Date(artifact.createdAt).toLocaleDateString()}</span>}
              </div>
              <div className="review-doc-card__actions">
                {canView && (
                  <button onClick={onView} className="review-doc-card__action review-doc-card__action--view">
                    Open in Viewer
                  </button>
                )}
                {artifact.sourceUrl && (
                  <a
                    href={artifact.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="review-doc-card__action review-doc-card__action--link"
                  >
                    Open Source
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Keep old grid-based ArtifactCard as ArtifactCardGrid for potential future use
function ArtifactCardGrid({ artifact, onView }: { artifact: Artifact; onView: () => void }) {
  const viewUrl = artifact.storageUrl || artifact.pagesPdfUrl;
  const canView = !!viewUrl;

  return (
    <div className="artifact-card" onClick={canView ? onView : undefined}>
      <div className="artifact-card__preview">
        {artifact.isImage && artifact.storageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={artifact.storageUrl}
            alt={artifact.label}
            className="artifact-card__thumb"
            loading="lazy"
          />
        ) : artifact.isPdf ? (
          <div className="artifact-card__pdf-icon">PDF</div>
        ) : (
          <div className="artifact-card__file-icon">{artifact.fileType?.toUpperCase() || '?'}</div>
        )}
      </div>
      <div className="artifact-card__info">
        <span className="artifact-card__label" title={artifact.label}>
          {artifact.label}
        </span>
        {artifact.fileSize && (
          <span className="artifact-card__size">
            {formatFileSize(artifact.fileSize)}
          </span>
        )}
      </div>
      {canView && (
        <div className="artifact-card__view-badge">View</div>
      )}
    </div>
  );
}

// ── Lightbox Viewer ───────────────────────────────────────────────────────────

function Lightbox({
  artifact,
  index,
  total,
  onClose,
  onNext,
  onPrev,
}: {
  artifact: Artifact;
  index: number;
  total: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  // ── ZOOM 1 IS THE RIGHT DEFAULT *HERE*, AND THAT WAS WORTH CHECKING ─────────────────────────
  //
  // `SourceDocumentViewer` had a real bug in exactly this line — `setZoom(1)` meant 100% of the
  // scan's own pixels, and a portrait page showed its top third. The obvious move was to copy the
  // fix over. Measured instead: `.artifact-lightbox__image` is `max-width: 90vw; max-height: 80vh;
  // object-fit: contain`, so this image is constrained on BOTH axes and already fits the window at
  // scale 1. That CSS is why the owner's complaint was about the document viewer and not this one.
  //
  // What both-constrained layout still gets wrong is rotation — see `rotationFit`.
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState<Rotation>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const downloadRef = useRef<HTMLAnchorElement>(null);

  // Reset zoom, pan AND rotation when the artifact changes. Rotation resets here where it does not
  // in the document viewer, and the difference is the unit of work: pages of one deed share an
  // orientation, two unrelated artifacts do not.
  useEffect(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  }, [artifact.id]);

  const viewUrl = artifact.storageUrl || artifact.pagesPdfUrl || '';
  const isImage = artifact.isImage;

  /** The scale that keeps a quarter-turned page inside the window. 1 when upright. */
  const fitForRotation = useCallback((next: Rotation) => {
    const el = containerRef.current;
    const img = imgRef.current;
    if (!el || !img) return 1;
    // `clientWidth/Height` is the LAID OUT size and is unaffected by the transform — reading
    // `getBoundingClientRect` here would measure the box after the rotation and scale already
    // applied, and feed the result back into itself.
    return rotationFit({
      containerW: el.clientWidth,
      containerH: el.clientHeight,
      laidOutW: img.clientWidth,
      laidOutH: img.clientHeight,
      rotation: next,
    });
  }, []);

  const rotateBy = useCallback((direction: 'cw' | 'ccw') => {
    const next = nextRotation(rotation, direction);
    setRotation(next);
    setZoom(fitForRotation(next));
    setPosition({ x: 0, y: 0 });
  }, [rotation, fitForRotation]);

  // The browser is the authority on full screen: Escape leaves it without calling anything of ours.
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else if (el.requestFullscreen) void el.requestFullscreen().catch(() => {});
  }, []);

  // Zoom with scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isImage) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -WHEEL_STEP : WHEEL_STEP;
      setZoom(prev => {
        const next = clampZoom(prev + delta);
        console.log(`[ArtifactGallery] Scroll zoom: ${(prev * 100).toFixed(0)}% → ${(next * 100).toFixed(0)}%`, {
          deltaY: e.deltaY,
        });
        return next;
      });
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [isImage]);

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isImage) return;
    e.preventDefault();
    setDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  }, [isImage, position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [dragging, dragStart]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  /** Back to the whole page — which here means the CSS-fitted size, adjusted for any rotation. */
  const resetView = useCallback(() => {
    setZoom(fitForRotation(rotation));
    setPosition({ x: 0, y: 0 });
  }, [fitForRotation, rotation]);

  /** A filename somebody can find again, rather than `download` on a storage URL. */
  const downloadName = (() => {
    const fromFile = (artifact.filename || artifact.label || 'artifact')
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100);
    return fromFile || 'artifact';
  })();

  // ── The keyboard, on the same map the document viewer uses ──────────────────────────────────
  //
  // It used to live in the parent and handled Escape and the two arrows. Everything else here acts
  // on state only this component has.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      const intent = viewerIntent(e);
      if (intent === null) return;

      if (intent === 'close') {
        // The browser handles Escape out of full screen itself; closing as well would shut the
        // lightbox on the way back to the page.
        if (!document.fullscreenElement) onClose();
        return;
      }
      if (intent === 'prev-page') { onPrev(); e.preventDefault(); return; }
      if (intent === 'next-page') { onNext(); e.preventDefault(); return; }
      if (intent === 'fullscreen') { toggleFullscreen(); e.preventDefault(); return; }
      if (intent === 'download') { downloadRef.current?.click(); e.preventDefault(); return; }

      // The rest only mean something for an image. On a PDF the iframe has its own controls, and
      // on an unsupported type there is nothing to zoom.
      if (!isImage) return;
      switch (intent) {
        case 'zoom-in':     setZoom(z => clampZoom(z + ZOOM_STEP)); break;
        case 'zoom-out':    setZoom(z => clampZoom(z - ZOOM_STEP)); break;
        case 'fit':         resetView(); break;
        case 'actual-size': setZoom(1); setPosition({ x: 0, y: 0 }); break;
        case 'rotate-cw':   rotateBy('cw'); break;
        case 'rotate-ccw':  rotateBy('ccw'); break;
        // first-page / last-page have no meaning in a gallery of unrelated artifacts.
        default: return;
      }
      e.preventDefault();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, onPrev, onNext, isImage, resetView, rotateBy, toggleFullscreen]);

  return (
    <div ref={rootRef} className="artifact-lightbox" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      {/* Header */}
      <div className="artifact-lightbox__header">
        <div className="artifact-lightbox__title">
          <span>{artifact.label}</span>
          <span className="artifact-lightbox__counter">
            {index + 1} / {total}
          </span>
        </div>
        <div className="artifact-lightbox__controls">
          {isImage && (
            <>
              <button onClick={() => setZoom(z => clampZoom(z - ZOOM_STEP))} title="Zoom out (−)">−</button>
              <span className="artifact-lightbox__zoom">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => clampZoom(z + ZOOM_STEP))} title="Zoom in (+)">+</button>
              <button onClick={resetView} title="Fit the whole image in view (0)">⟲</button>
              <button onClick={() => rotateBy('ccw')} title="Rotate left (⇧R)">⤺</button>
              <button onClick={() => rotateBy('cw')} title="Rotate right (R)">⤼</button>
              {rotation !== 0 && (
                <span className="artifact-lightbox__zoom" aria-live="polite">{rotation}°</span>
              )}
            </>
          )}
          <button onClick={toggleFullscreen}
                  title={isFullscreen ? 'Leave full screen (F)' : 'Full screen (F)'}>
            {isFullscreen ? '⤡' : '⤢'}
          </button>
          <button onClick={() => setShowKeys(v => !v)} aria-expanded={showKeys}
                  title="Keyboard shortcuts">⌨</button>
          {viewUrl && (
            <>
              {/* Two links, because they are two different acts and one button cannot be both.
                  ⇓ SAVES the file; ↗ OPENS it, which is what you want for a PDF you are about to
                  read in the browser's own viewer. Before this only the second existed and it was
                  labelled with a download-shaped tooltip. */}
              <a
                ref={downloadRef}
                href={viewUrl}
                download={downloadName}
                target="_blank"
                rel="noopener noreferrer"
                className="artifact-lightbox__download"
                title={`Download (D) — ${downloadName}`}
              >
                ⇓
              </a>
              <a
                href={viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="artifact-lightbox__download"
                title="Open in a new tab"
              >
                ↗
              </a>
            </>
          )}
          <button onClick={onClose} className="artifact-lightbox__close" title="Close (Esc)">✕</button>
        </div>
      </div>

      {/* The shortcut list, derived from the same `VIEWER_SHORTCUTS` the handler above reads and
          the document viewer renders. `paged` entries are the ones about moving through a
          document; here they move between artifacts, so the labels are re-stated rather than
          reused — the only place the two viewers legitimately differ, and the filter says so.
          `first-page`/`last-page` are dropped: a gallery of unrelated artifacts has no first. */}
      {showKeys && (
        <div className="artifact-lightbox__keys" role="group" aria-label="Keyboard shortcuts">
          {VIEWER_SHORTCUTS
            .filter((s) => s.intent !== 'first-page' && s.intent !== 'last-page')
            .filter((s) => isImage || !['zoom-in', 'zoom-out', 'fit', 'actual-size', 'rotate-cw', 'rotate-ccw'].includes(s.intent))
            .map((s) => (
              <span className="artifact-lightbox__keys-item" key={s.intent}>
                <kbd>{s.shown}</kbd>{' '}
                {s.intent === 'prev-page' ? 'Previous artifact'
                  : s.intent === 'next-page' ? 'Next artifact'
                  : s.label}
              </span>
            ))}
        </div>
      )}

      {/* Navigation arrows */}
      {total > 1 && (
        <>
          <button className="artifact-lightbox__nav artifact-lightbox__nav--prev" onClick={onPrev}>
            ‹
          </button>
          <button className="artifact-lightbox__nav artifact-lightbox__nav--next" onClick={onNext}>
            ›
          </button>
        </>
      )}

      {/* Content */}
      <div
        className="artifact-lightbox__content"
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isImage ? (dragging ? 'grabbing' : 'grab') : 'default' }}
      >
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={viewUrl}
            alt={artifact.label}
            className="artifact-lightbox__image"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) rotate(${rotation}deg) scale(${zoom})`,
              transition: dragging ? 'none' : 'transform 0.15s ease',
            }}
            draggable={false}
          />
        ) : artifact.isPdf ? (
          <iframe
            src={viewUrl}
            className="artifact-lightbox__pdf"
            title={artifact.label}
          />
        ) : (
          <div className="artifact-lightbox__unsupported">
            <p>Preview not available for this file type.</p>
            {viewUrl && (
              <a href={viewUrl} target="_blank" rel="noopener noreferrer">
                Open in new tab
              </a>
            )}
          </div>
        )}
      </div>

      {/* Info bar */}
      <div className="artifact-lightbox__footer">
        {artifact.recordingInfo && <span>{artifact.recordingInfo}</span>}
        {artifact.sourceUrl && (
          <a href={artifact.sourceUrl} target="_blank" rel="noopener noreferrer">
            Source
          </a>
        )}
        {artifact.fileSize && <span>{formatFileSize(artifact.fileSize)}</span>}
        {artifact.ocrConfidence != null && (
          <span>OCR: {artifact.ocrConfidence}%</span>
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
