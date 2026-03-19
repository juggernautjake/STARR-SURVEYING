// app/admin/research/components/SourceDocumentViewer.tsx
// Document viewer modal with Page Images (default) and Extracted Text tabs.
// Features: built-in zoom/pan viewer, drawing annotations, per-image summaries.
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ResearchDocument } from '@/types/research';
import { DOCUMENT_TYPE_LABELS } from '@/types/research';

interface SourceDocumentViewerProps {
  document: ResearchDocument;
  /** Extra PDF URL from pipeline result (pagesPdfUrl) — used when DB record has no pdf url yet */
  pagesPdfUrl?: string | null;
  highlightText?: string;
  onClose: () => void;
}

type ViewTab = 'images' | 'text';

/** Returns the best available PDF URL for inline viewing */
function getPdfUrl(doc: ResearchDocument, extra?: string | null): string | null {
  if (extra) return extra;
  if (doc.pages_pdf_url) return doc.pages_pdf_url;
  const su = doc.storage_url ?? '';
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

  // Fallback: use storage_url if it's an image
  if (urls.length === 0 && doc.storage_url) {
    const su = doc.storage_url;
    if (/\.(png|jpe?g|gif|webp|tiff?)/i.test(su) || doc.file_type === 'png' || doc.file_type === 'jpg') {
      urls.push(su);
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
}: SourceDocumentViewerProps) {
  const pdfUrl = getPdfUrl(doc, pagesPdfUrl);
  const pageImageUrls = getPageImageUrls(doc);
  const hasText = !!(doc.extracted_text);
  const hasImages = pageImageUrls.length > 0 || !!pdfUrl;

  // Page Images tab is shown FIRST by default
  const defaultTab: ViewTab = hasImages ? 'images' : 'text';
  const [activeTab, setActiveTab] = useState<ViewTab>(defaultTab);
  const [pdfLoadError, setPdfLoadError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Image viewer state
  const [currentPage, setCurrentPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [drawPaths, setDrawPaths] = useState<Map<number, Array<{ x: number; y: number }[]>>>(new Map());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const typeInfo = doc.document_type ? DOCUMENT_TYPE_LABELS[doc.document_type] : null;
  const text = doc.extracted_text || '';

  // Reset zoom/pan when page changes
  useEffect(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, [currentPage]);

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

    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const path of pagePaths) {
      if (path.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x, path[i].y);
      }
      ctx.stroke();
    }
  }, [currentPage, drawPaths]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

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
      next.set(currentPage, [...existing, [{ x, y }]]);
      return next;
    });
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
      const lastPath = [...paths[paths.length - 1], { x, y }];
      next.set(currentPage, [...paths.slice(0, -1), lastPath]);
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
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      setZoom(prev => Math.min(Math.max(prev + delta, 0.1), 10));
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [activeTab, drawMode]);

  function resetView() {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
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
              <button onClick={() => setZoom(z => Math.max(z - 0.25, 0.1))} title="Zoom out">−</button>
              <span className="research-viewer__img-zoom-info">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(z + 0.25, 10))} title="Zoom in">+</button>
              <button onClick={resetView} title="Reset view">⟲</button>

              {/* Draw controls */}
              <span className="research-viewer__img-divider" />
              <button
                onClick={() => setDrawMode(!drawMode)}
                title={drawMode ? 'Stop drawing' : 'Draw on image'}
                data-active={drawMode ? 'true' : undefined}
              >
                {drawMode ? '✏ Drawing' : '✏ Draw'}
              </button>
              {drawPaths.has(currentPage) && (
                <button onClick={clearDrawings} title="Clear drawings on this page">
                  🗑 Clear
                </button>
              )}

              {/* Expand toggle */}
              <span className="research-viewer__img-divider" />
              <button onClick={() => setExpanded(!expanded)} title={expanded ? 'Shrink modal' : 'Expand modal'}>
                {expanded ? '⊟ Shrink' : '⊞ Expand'}
              </button>
            </div>
          </div>

          {/* Image caption */}
          <div className="research-viewer__img-caption">
            {summary}
          </div>

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
                transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
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
                onLoad={() => redrawCanvas()}
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
            <button
              onClick={() => setExpanded(!expanded)}
              className="research-viewer__pdf-open-btn"
              title={expanded ? 'Shrink modal' : 'Expand modal'}
            >
              {expanded ? '⊟ Shrink' : '⊞ Expand'}
            </button>
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

  // ── Keyboard ───────────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (drawMode) {
          setDrawMode(false);
        } else {
          onClose();
        }
      }
      if (activeTab === 'images' && pageImageUrls.length > 1) {
        if (e.key === 'ArrowLeft') setCurrentPage(p => Math.max(0, p - 1));
        if (e.key === 'ArrowRight') setCurrentPage(p => Math.min(pageImageUrls.length - 1, p + 1));
      }
    },
    [onClose, drawMode, activeTab, pageImageUrls.length],
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
      className="research-viewer-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={doc.document_label || doc.original_filename || 'Document Viewer'}
    >
      <div
        className={`research-viewer${expanded ? ' research-viewer--expanded' : ''}${hasImages ? ' research-viewer--with-pdf' : ''}`}
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
          <button className="research-viewer__close" onClick={onClose} aria-label="Close viewer">
            &times;
          </button>
        </div>

        {/* OCR confidence */}
        {doc.ocr_confidence != null && (
          <div className="research-viewer__confidence">
            OCR Confidence: {doc.ocr_confidence}%
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
