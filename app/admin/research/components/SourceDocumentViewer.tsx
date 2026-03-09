// app/admin/research/components/SourceDocumentViewer.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ResearchDocument } from '@/types/research';
import { DOCUMENT_TYPE_LABELS } from '@/types/research';

interface SourceDocumentViewerProps {
  document: ResearchDocument;
  /** Extra PDF URL from pipeline result (pagesPdfUrl) — used when DB record has no pdf url yet */
  pagesPdfUrl?: string | null;
  highlightText?: string;
  onClose: () => void;
}

type ViewTab = 'text' | 'pdf';

/** Returns the best available PDF URL for inline viewing */
function getPdfUrl(doc: ResearchDocument, extra?: string | null): string | null {
  if (extra) return extra;
  if (doc.pages_pdf_url) return doc.pages_pdf_url;
  const su = doc.storage_url ?? '';
  if (su && (su.endsWith('.pdf') || su.includes('/pdf') || doc.file_type === 'pdf')) return su;
  return null;
}

export default function SourceDocumentViewer({
  document: doc,
  pagesPdfUrl,
  highlightText,
  onClose,
}: SourceDocumentViewerProps) {
  const pdfUrl = getPdfUrl(doc, pagesPdfUrl);
  const hasText = !!(doc.extracted_text);
  const hasPdf  = !!pdfUrl;

  const defaultTab: ViewTab = hasPdf && !hasText ? 'pdf' : 'text';
  const [activeTab, setActiveTab] = useState<ViewTab>(defaultTab);
  const [pdfLoadError, setPdfLoadError] = useState(false);

  const typeInfo = doc.document_type ? DOCUMENT_TYPE_LABELS[doc.document_type] : null;
  const text = doc.extracted_text || '';

  // ── Highlight logic ──────────────────────────────────────────────────────

  function renderHighlightedText() {
    if (!text) {
      return (
        <div className="research-viewer__empty">
          No text content available.
          {hasPdf && (
            <p style={{ marginTop: '0.5rem' }}>
              <button
                className="research-viewer__tab-btn"
                onClick={() => setActiveTab('pdf')}
              >
                View Page Images →
              </button>
            </p>
          )}
        </div>
      );
    }

    if (!highlightText || highlightText.length < 5) {
      return <pre className="research-viewer__text">{text}</pre>;
    }

    const lowerText      = text.toLowerCase();
    const lowerHighlight = highlightText.toLowerCase().trim();
    const idx            = lowerText.indexOf(lowerHighlight);
    const startIdx       = idx !== -1 ? idx : lowerText.indexOf(lowerHighlight.substring(0, 50));

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

  // ── PDF viewer ───────────────────────────────────────────────────────────

  function renderPdfViewer() {
    if (!pdfUrl) return null;

    if (pdfLoadError) {
      return (
        <div className="research-viewer__pdf-error">
          <p>⚠️ Could not load PDF in the browser viewer.</p>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="research-viewer__pdf-link"
          >
            Open PDF in new tab ↗
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
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="research-viewer__pdf-open-btn"
            title="Open full screen"
          >
            ↗ Open full screen
          </a>
        </div>
        <iframe
          src={`${pdfUrl}#toolbar=1&navpanes=0&scrollbar=1&zoom=page-fit`}
          title={doc.document_label || doc.original_filename || 'Document Pages'}
          className="research-viewer__pdf-iframe"
          onError={(e) => { console.error('[PDF Viewer] iframe load error:', e); setPdfLoadError(true); }}
        />
      </div>
    );
  }

  // ── Keyboard + scroll effects ────────────────────────────────────────────

  useEffect(() => {
    if (activeTab !== 'text') return;
    const el = document.querySelector('.research-viewer__highlight');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeTab, text, highlightText]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); },
    [onClose],
  );
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="research-viewer-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={doc.document_label || doc.original_filename || 'Document Viewer'}
    >
      <div
        className={`research-viewer${hasPdf ? ' research-viewer--with-pdf' : ''}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="research-viewer__header">
          <div className="research-viewer__header-info">
            <span className="research-viewer__header-icon">
              {typeInfo?.icon || (hasPdf ? '🖼️' : doc.source_type === 'manual_entry' ? '📝' : '📄')}
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
                {doc.extracted_text_method && <span>via {doc.extracted_text_method}</span>}
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

        {/* Tab bar — only shown when BOTH text and PDF are available */}
        {hasText && hasPdf && (
          <div className="research-viewer__tabs" role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === 'text'}
              className={`research-viewer__tab${activeTab === 'text' ? ' research-viewer__tab--active' : ''}`}
              onClick={() => setActiveTab('text')}
            >
              📝 Extracted Text
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'pdf'}
              className={`research-viewer__tab${activeTab === 'pdf' ? ' research-viewer__tab--active' : ''}`}
              onClick={() => { setActiveTab('pdf'); setPdfLoadError(false); }}
            >
              🖼️ Page Images
            </button>
          </div>
        )}

        {/* Body */}
        <div
          className={`research-viewer__body${activeTab === 'pdf' ? ' research-viewer__body--pdf' : ''}`}
          role="tabpanel"
        >
          {activeTab === 'text' && renderHighlightedText()}
          {activeTab === 'pdf'  && renderPdfViewer()}
        </div>
      </div>
    </div>
  );
}
