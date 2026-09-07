'use client';

// app/admin/research/components/ReviewDocumentsList.tsx — the Review stage's Documents tab
//
// The owner's rule (2026-09-07): in the research, analysis AND review stages "we can always review
// each and every file in the document/image viewer". Research had its live list, Analysis had the
// quote panel with View on every row, and Review had… the Data Points panel's "view source" links
// and the artifact gallery. A deed nobody had extracted a data point from could not be opened from
// the Review stage at all. This tab lists EVERY document the project holds — deeds, plats, captures,
// maps, PDFs — each with View (the dedicated viewer, whose ‹ › arrows walk this same ordered list)
// and Source ↗ where the page it came from is known.
//
// Fixed grid columns so the buttons line up whether or not a row has a Source link (the owner's
// screenshot of the Analysis stage, 2026-09-07 — same defect, same cure). The look lives on the
// route sheet (AdminResearch.css `.review-docs…`), not inline, so the inline-hex ratchet stays flat.

import { FileText, Eye } from 'lucide-react';
import type { ResearchDocument } from '@/types/research';
import { confidencePercentLabel } from '@/lib/research/confidence-scale';

export interface ReviewDocumentsListProps {
  docs: ResearchDocument[];
  /** Open a document in the dedicated viewer. */
  onView: (doc: ResearchDocument) => void;
}

/** A document is viewable when it has stored pages or a stored file — the same test the viewer applies. */
export function isViewable(doc: Pick<ResearchDocument, 'pages_pdf_url' | 'storage_url'>): boolean {
  return !!(doc.pages_pdf_url || doc.storage_url);
}

export default function ReviewDocumentsList({ docs, onView }: ReviewDocumentsListProps) {
  if (docs.length === 0) {
    return (
      <p className="review-docs__empty" data-testid="review-docs-empty">
        No documents were filed for this project yet.
      </p>
    );
  }
  return (
    <div className="review-docs" data-testid="review-docs">
      <div className="review-docs__head">
        <strong>Documents — every file this project holds</strong>
        <span className="review-docs__count">{docs.length} file(s) · View opens the viewer; ‹ › there walks this list</span>
      </div>
      <ul className="review-docs__rows" data-testid="review-doc-rows">
        {docs.map((doc) => {
          const label = doc.document_label || doc.original_filename || 'Untitled';
          const ocr = confidencePercentLabel(doc.ocr_confidence);
          const viewable = isViewable(doc);
          return (
            <li key={doc.id} className="review-docs__row" data-testid="review-doc-row">
              <span className="review-docs__label">
                <FileText size={14} className="review-docs__icon" aria-hidden />
                <span className="review-docs__name" title={label}>{label}</span>
                {doc.recording_info && <span className="review-docs__rec"> · {doc.recording_info}</span>}
                {doc.processing_status === 'unreadable' && (
                  <span className="review-doc-card__badge review-doc-card__badge--err" title={doc.readability_reason ?? 'The extracted text was not usable.'}>
                    Unreadable
                  </span>
                )}
                {doc.readability === 'partial' && (
                  <span className="review-doc-card__badge review-doc-card__badge--warn" title={doc.readability_reason ?? 'Less text than a recorded instrument usually contains.'}>
                    Thin text
                  </span>
                )}
                {/* The relevance check's verdict, kept beside the file instead of deleting it (2026-09-07). */}
                {doc.relevance === 'unrelated' && (
                  <span
                    className="review-doc-card__badge review-doc-card__badge--warn"
                    title={doc.relevance_classification?.reason ?? 'The relevance check found nothing tying this document to the subject tract.'}
                  >
                    Unrelated
                  </span>
                )}
                {ocr && <span className="review-docs__ocr" title="OCR confidence">OCR {ocr}</span>}
                {doc.research_round != null && doc.research_round > 1 && (
                  <span className="review-doc-card__badge review-doc-card__badge--ok" title={`Found by follow-up research round ${doc.research_round}`}>
                    Round {doc.research_round}
                  </span>
                )}
              </span>
              <span className="review-docs__pages">{doc.page_count ? `${doc.page_count} pg` : ''}</span>
              <span className="review-docs__view">
                {viewable ? (
                  <button
                    type="button"
                    className="rrv__doc-view review-docs__view-btn"
                    onClick={() => onView(doc)}
                    title="View — open this document in the viewer and page through it"
                    data-testid="review-doc-view"
                  >
                    <Eye size={12} aria-hidden style={{ verticalAlign: '-2px', marginRight: 4 }} />View
                  </button>
                ) : (
                  <span className="review-docs__pending" title="The file is still uploading, or was never stored">no file</span>
                )}
              </span>
              <span className="review-docs__source">
                {doc.source_url && (
                  <a href={doc.source_url} target="_blank" rel="noopener noreferrer" className="rrv__doc-source" title="Open the page this was retrieved from">
                    Source ↗
                  </a>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
