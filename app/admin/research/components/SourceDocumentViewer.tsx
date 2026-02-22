// app/admin/research/components/SourceDocumentViewer.tsx
'use client';

import { useState, useEffect } from 'react';
import type { ResearchDocument } from '@/types/research';
import { DOCUMENT_TYPE_LABELS } from '@/types/research';

interface SourceDocumentViewerProps {
  document: ResearchDocument;
  highlightText?: string;
  onClose: () => void;
}

export default function SourceDocumentViewer({ document: doc, highlightText, onClose }: SourceDocumentViewerProps) {
  const [text, setText] = useState<string>(doc.extracted_text || '');
  const typeInfo = doc.document_type ? DOCUMENT_TYPE_LABELS[doc.document_type] : null;

  // Highlight matching text in the document
  function renderHighlightedText() {
    if (!text) return <div className="research-viewer__empty">No text content available.</div>;

    if (!highlightText || highlightText.length < 5) {
      return <pre className="research-viewer__text">{text}</pre>;
    }

    // Find the highlight position
    const lowerText = text.toLowerCase();
    const lowerHighlight = highlightText.toLowerCase().trim();
    const idx = lowerText.indexOf(lowerHighlight);

    if (idx === -1) {
      // Try partial match (first 50 chars)
      const partial = lowerHighlight.substring(0, 50);
      const partialIdx = lowerText.indexOf(partial);

      if (partialIdx === -1) {
        return <pre className="research-viewer__text">{text}</pre>;
      }

      return (
        <pre className="research-viewer__text">
          {text.substring(0, partialIdx)}
          <mark className="research-viewer__highlight">
            {text.substring(partialIdx, partialIdx + highlightText.length)}
          </mark>
          {text.substring(partialIdx + highlightText.length)}
        </pre>
      );
    }

    return (
      <pre className="research-viewer__text">
        {text.substring(0, idx)}
        <mark className="research-viewer__highlight">
          {text.substring(idx, idx + highlightText.length)}
        </mark>
        {text.substring(idx + highlightText.length)}
      </pre>
    );
  }

  // Scroll to the highlight on mount
  useEffect(() => {
    const el = document.querySelector('.research-viewer__highlight');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [text, highlightText]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="research-viewer-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={doc.document_label || doc.original_filename || 'Document Viewer'}
    >
      <div className="research-viewer" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="research-viewer__header">
          <div className="research-viewer__header-info">
            <span className="research-viewer__header-icon">
              {typeInfo?.icon || (doc.source_type === 'manual_entry' ? '📝' : '📄')}
            </span>
            <div>
              <div className="research-viewer__header-name">
                {doc.document_label || doc.original_filename || 'Untitled'}
              </div>
              <div className="research-viewer__header-meta">
                {typeInfo && <span>{typeInfo.label}</span>}
                {doc.recording_info && <span>{doc.recording_info}</span>}
                {doc.page_count && <span>{doc.page_count} page{doc.page_count !== 1 ? 's' : ''}</span>}
                {doc.extracted_text_method && <span>via {doc.extracted_text_method}</span>}
              </div>
            </div>
          </div>
          <button className="research-viewer__close" onClick={onClose}>&times;</button>
        </div>

        {/* OCR confidence */}
        {doc.ocr_confidence != null && (
          <div className="research-viewer__confidence">
            OCR Confidence: {doc.ocr_confidence}%
          </div>
        )}

        {/* Body */}
        <div className="research-viewer__body">
          {renderHighlightedText()}
        </div>
      </div>
    </div>
  );
}
