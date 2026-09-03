'use client';
// app/admin/research/[projectId]/ReviewDocCard.tsx — one document card in the Review stage.
//
// Lifted out of page.tsx for platform audit item 18 (3,770 lines — the largest file in the admin
// app). Verbatim. This is the part of that page that was ALREADY separable: a presentational card
// that takes its document as a prop and calls back to view it.
//
// The four stage sections below it in page.tsx are not separable the same way — each reads dozens
// of pieces of the page's own state, and threading forty props through would be a rewrite wearing a
// refactor's clothes. Noted in the audit rather than half-done here.
import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { ResearchDocument } from '@/types/research';
import { confidencePercentLabel } from '@/lib/research/confidence-scale';

export const RESEARCH_SOURCES = [
  'County Appraisal District',
  'County Clerk / Deed Records',
  'FEMA Flood Maps',
  'TxDOT ROW',
  'USGS National Map',
  'Texas GLO',
  'TX Railroad Commission',
  'TNRIS',
  'County GIS Portal',
  'City Records',
] as const;

export const JOB_NOTES_PLACEHOLDER =
  'Add job preparation notes, field instructions, equipment needed, special considerations…\n\n' +
  'Examples:\n' +
  '• Equipment needed: total station, GPS rover, rebar/caps, lath\n' +
  '• Site access: gate code is ___, call owner before arrival\n' +
  '• Special instructions: check for creek encroachment on east boundary\n' +
  '• Adjacent owner contact: ___\n' +
  '• Estimated field time: 4–6 hours';

// ── ReviewDocCard — collapsible document card for Stage 3 ────────────────────

export interface ReviewDocCardProps {
  typeIcon: LucideIcon;
  title: string;
  typeName: string;
  doc: {
    id: string;
    processing_status?: string | null;
    extracted_text?: string | null;
    recorded_date?: string | null;
    recording_info?: string | null;
    page_count?: number | null;
    ocr_confidence?: number | null;
    file_size_bytes?: number | null;
    file_type?: string | null;
    created_at?: string | null;
    source_url?: string | null;
    storage_url?: string | null;
    pages_pdf_url?: string | null;
    document_type?: string | null;
    original_filename?: string | null;
    ocr_regions?: unknown;
    /** Whether the extraction is usable, and why (plan R18). */
    readability?: 'good' | 'partial' | 'unreadable' | null;
    readability_reason?: string | null;
  };
  excerpt: string | null;
  hasViewable: boolean;
  onView: () => void;
}

/** Parse page image URLs from ocr_regions JSON (stored by artifact uploader) */
export function getCardPageUrls(ocrRegions: unknown): string[] {
  if (!ocrRegions) return [];
  try {
    const parsed = typeof ocrRegions === 'string' ? JSON.parse(ocrRegions) : ocrRegions;
    if (parsed?.pageUrls && Array.isArray(parsed.pageUrls)) {
      return parsed.pageUrls.filter(Boolean) as string[];
    }
  } catch { /* ignore */ }
  return [];
}

export function ReviewDocCard({ typeIcon: TypeIcon, title, typeName, doc, excerpt, hasViewable, onView }: ReviewDocCardProps) {
  const [open, setOpen] = useState(false);
  const pageUrls = getCardPageUrls(doc.ocr_regions);
  const thumbnailUrl = doc.storage_url || (pageUrls.length > 0 ? pageUrls[0] : null);
  const isImage = !!(thumbnailUrl && /\.(png|jpe?g|gif|webp|tiff?)/i.test(thumbnailUrl));

  return (
    <div className={`review-doc-card${open ? ' review-doc-card--open' : ''}`}>
      <div className="review-doc-card__header" onClick={() => setOpen((o: boolean) => !o)}>
        <span className="review-doc-card__icon"><TypeIcon size={16} strokeWidth={1.75} /></span>
        <span className="review-doc-card__title">{title}</span>
        <span className="review-doc-card__type">{typeName}</span>
        {doc.processing_status === 'analyzed' && (
          <span className="review-doc-card__badge review-doc-card__badge--ok">Analyzed</span>
        )}
        {doc.processing_status === 'error' && (
          <span className="review-doc-card__badge review-doc-card__badge--err">Error</span>
        )}
        {/* Without this an unreadable document renders with NO badge — identical to one still
            waiting to be processed — which is how "we could not read this deed" became invisible
            (plan R18). The reason is the tooltip: a reviewer needs to know whether to re-scan or to
            go and read the page themselves. */}
        {doc.processing_status === 'unreadable' && (
          <span
            className="review-doc-card__badge review-doc-card__badge--err"
            title={doc.readability_reason ?? 'The extracted text was not usable.'}
          >
            Unreadable
          </span>
        )}
        {doc.readability === 'partial' && (
          <span
            className="review-doc-card__badge review-doc-card__badge--warn"
            title={doc.readability_reason ?? 'Less text than a recorded instrument usually contains.'}
          >
            Thin text
          </span>
        )}
        {doc.page_count != null && doc.page_count > 1 && (
          <span className="review-doc-card__badge review-doc-card__badge--pages">{doc.page_count} pg</span>
        )}
        {hasViewable && (
          <button
            onClick={(e) => { e.stopPropagation(); onView(); }}
            className="review-doc-card__view-btn"
            title="Open in document viewer"
          >
            View
          </button>
        )}
        <span className="review-doc-card__chevron">{open ? '\u25B2' : '\u25BC'}</span>
      </div>
      {open && (
        <div className="review-doc-card__body">
          <div className="review-doc-card__content-row">
            {/* Thumbnail preview for images */}
            {isImage && thumbnailUrl && (
              <div className="review-doc-card__thumbnail" onClick={onView} role="button" tabIndex={0}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbnailUrl} alt={title} loading="lazy" />
                {pageUrls.length > 1 && (
                  <span className="review-doc-card__thumb-pages">+{pageUrls.length - 1}</span>
                )}
              </div>
            )}
            <div className="review-doc-card__details">
              {excerpt && (
                <div className="review-doc-card__excerpt">{excerpt}</div>
              )}
              <div className="review-doc-card__meta">
                {doc.recorded_date && <span>Recorded: {doc.recorded_date}</span>}
                {doc.recording_info && <span>{doc.recording_info}</span>}
                {doc.page_count != null && <span>{doc.page_count} page{doc.page_count !== 1 ? 's' : ''}</span>}
                {doc.file_type && <span>{doc.file_type.toUpperCase()}</span>}
                {doc.file_size_bytes != null && (
                  <span>{doc.file_size_bytes >= 1024 * 1024
                    ? `${(doc.file_size_bytes / (1024 * 1024)).toFixed(1)} MB`
                    : `${(doc.file_size_bytes / 1024).toFixed(0)} KB`
                  }</span>
                )}
                {/* Multiplying by 100 is right for a worker-written row (0–1) and renders an
                    app-written row (0–100) as "9000%". One helper now, for both readers. */}
                {confidencePercentLabel(doc.ocr_confidence) && <span>OCR {confidencePercentLabel(doc.ocr_confidence)}</span>}
                {doc.created_at && <span title={doc.created_at}>Added {new Date(doc.created_at).toLocaleDateString()}</span>}
              </div>
              <div className="review-doc-card__actions">
                {hasViewable && (
                  <button
                    onClick={onView}
                    className="review-doc-card__action review-doc-card__action--view"
                  >
                    Open in Viewer
                  </button>
                )}
                {doc.source_url && (
                  <a
                    href={doc.source_url}
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

// ────────────────────────────────────────────────────────────────────────────
