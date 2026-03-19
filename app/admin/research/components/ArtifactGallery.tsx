// app/admin/research/components/ArtifactGallery.tsx
// Gallery viewer for all pipeline artifacts: screenshots, deed images, plat images, etc.
// Fetches from /api/admin/research/{projectId}/artifacts and displays in a
// categorized grid with a full-screen lightbox viewer.
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

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
  'screenshots-misc': { label: 'MISC Screenshots', icon: '🗑', order: 999, defaultCollapsed: true },
};

function getCategoryConfig(cat: string) {
  return CATEGORY_CONFIG[cat] ?? { label: cat, icon: '📁', order: 50 };
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ArtifactGallery({ projectId }: ArtifactGalleryProps) {
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

  // ── Fetch artifacts ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/research/${projectId}/artifacts`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setArtifacts(data.artifacts || []);
          setGrouped(data.grouped || {});
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [projectId]);

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

  // Keyboard navigation
  useEffect(() => {
    if (!lightboxArtifact) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxArtifact, closeLightbox, goNext, goPrev]);

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
    return (
      <div className="artifact-gallery artifact-gallery--empty">
        <p>No artifacts found. Run the research pipeline to capture screenshots and documents.</p>
      </div>
    );
  }

  return (
    <div className="artifact-gallery">
      {/* ── Header & Filter ───────────────────────────────────── */}
      <div className="artifact-gallery__header">
        <h3 className="artifact-gallery__title">
          Pipeline Artifacts ({artifacts.length})
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
              <div className="artifact-gallery__grid">
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

// ── Artifact Card ─────────────────────────────────────────────────────────────

function ArtifactCard({ artifact, onView }: { artifact: Artifact; onView: () => void }) {
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
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset zoom/pan when artifact changes
  useEffect(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, [artifact.id]);

  const viewUrl = artifact.storageUrl || artifact.pagesPdfUrl || '';
  const isImage = artifact.isImage;

  // Zoom with scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isImage) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      setZoom(prev => Math.min(Math.max(prev + delta, 0.1), 10));
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

  function resetView() {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }

  return (
    <div className="artifact-lightbox" onClick={(e) => {
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
              <button onClick={() => setZoom(z => Math.max(z - 0.25, 0.1))} title="Zoom out">−</button>
              <span className="artifact-lightbox__zoom">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(z + 0.25, 10))} title="Zoom in">+</button>
              <button onClick={resetView} title="Reset view">⟲</button>
            </>
          )}
          {viewUrl && (
            <a
              href={viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="artifact-lightbox__download"
              title="Open in new tab"
            >
              ↗
            </a>
          )}
          <button onClick={onClose} className="artifact-lightbox__close" title="Close (Esc)">✕</button>
        </div>
      </div>

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
            src={viewUrl}
            alt={artifact.label}
            className="artifact-lightbox__image"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
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
