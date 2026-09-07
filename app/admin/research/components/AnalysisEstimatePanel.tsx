'use client';

// app/admin/research/components/AnalysisEstimatePanel.tsx — the AI-analysis price quote (plan E3b).
//
// Shows the FIXED standardized quote for AI analysis (E1/E2): a full-analysis total (all gathered
// files' pages × the $/page rate) and a per-file list where each file carries its own price and an
// "Analyze this" button that analyses just that file (E3a) at its quoted price. So the operator sees
// exactly what a total or a single-file analysis costs before spending.

import { useEffect, useState, useCallback } from 'react';
import type { ResearchDocument } from '@/types/research';
import { confidencePercentLabel } from '@/lib/research/confidence-scale';

interface PerFileQuote {
  documentId: string;
  label: string;
  pages: number;
  costUsd: number;
  etaSeconds: number;
}
interface EstimateResponse {
  ratePerPageUsd: number;
  documentCount: number;
  total: { pages: number; costUsd: number; etaSeconds: number };
  perFile: PerFileQuote[];
}

/** The analyze request body for a single file (E3a) — that file, capped at its own quoted price. */
export function analyzeFileBody(documentId: string, costUsd: number): { documentId: string; maxCostUsd: number } {
  const cap = Number.isFinite(costUsd) && costUsd > 0 ? Math.min(costUsd, 100) : 0;
  return { documentId, maxCostUsd: cap };
}

function usd(n: number): string {
  return `$${(Number.isFinite(n) && n > 0 ? n : 0).toFixed(2)}`;
}
function eta(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  if (s < 60) return `~${s} sec`;
  return `~${Math.round(s / 60)} min`;
}

export interface AnalysisEstimatePanelProps {
  projectId: string;
  /** Called after a per-file analysis is accepted, so the page can refresh/poll. */
  onStarted?: () => void;
  /** The gathered documents (plan G8) — so each row can also VIEW the file and open its SOURCE,
   *  merging the old separate "Documents & Sources" list into this one. Keyed by document id. */
  docs?: ResearchDocument[];
  /** Open a document in the dedicated viewer (plan G8). */
  onView?: (doc: ResearchDocument) => void;
}

export default function AnalysisEstimatePanel({ projectId, onStarted, docs, onView }: AnalysisEstimatePanelProps) {
  const docById = new Map((docs ?? []).map((d) => [d.id, d]));
  const [est, setEst] = useState<EstimateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [startedIds, setStartedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/research/${projectId}/analysis-estimate`);
      if (!res.ok) { setError(`Could not load the analysis quote (HTTP ${res.status}).`); return; }
      setEst(await res.json() as EstimateResponse);
    } catch {
      setError('Could not reach the server for the analysis quote.');
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function analyzeOne(q: PerFileQuote) {
    if (busyId) return;
    setBusyId(q.documentId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/research/${projectId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(analyzeFileBody(q.documentId, q.costUsd)),
      });
      if (!res.ok && res.status !== 202) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? `Could not analyse "${q.label}" (HTTP ${res.status}).`);
        return;
      }
      setStartedIds((prev) => new Set(prev).add(q.documentId));
      onStarted?.();
    } catch {
      setError(`Could not reach the server to analyse "${q.label}".`);
    } finally {
      setBusyId(null);
    }
  }

  if (error && !est) {
    return <div role="alert" style={{ color: '#DC2626', fontSize: '0.85rem', margin: '0 0 1rem' }}>{error}</div>;
  }
  if (!est) {
    return <div style={{ fontSize: '0.85rem', opacity: 0.7, margin: '0 0 1rem' }}>Loading analysis quote…</div>;
  }

  return (
    <div
     
      data-testid="analysis-estimate"
      style={{ border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: '0.75rem 1rem', margin: '0 0 1.25rem', background: 'var(--surface-2, #fafafa)' }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '0.9rem' }}>Documents — analyze, view, or open source</strong>
        <span style={{ fontSize: '0.82rem', opacity: 0.8 }}>
          Full analysis: <strong>{usd(est.total.costUsd)}</strong> for {est.total.pages} page(s) across{' '}
          {est.documentCount} file(s) · {eta(est.total.etaSeconds)} · {usd(est.ratePerPageUsd)}/page
        </span>
      </div>

      {(() => {
        // EVERY document the stage holds gets a row (owner, 2026-09-07): the priced files with their
        // quote + "Analyze this", and everything else — captures, screenshots, maps, PDFs — with View
        // + Source, so nothing is hidden from the dedicated viewer. Fixed grid columns: pages · price ·
        // Analyze · View · Source, so the buttons line up whether or not a row has a Source link (a
        // row without one used to shift its buttons right — the owner's screenshot, 2026-09-07).
        const quoted = new Map(est.perFile.map((q) => [q.documentId, q]));
        const rows: Array<{ id: string; label: string; doc?: ResearchDocument; quote?: PerFileQuote }> = [];
        for (const q of est.perFile) rows.push({ id: q.documentId, label: q.label, doc: docById.get(q.documentId), quote: q });
        for (const d of docs ?? []) {
          if (!quoted.has(d.id)) rows.push({ id: d.id, label: d.document_label || d.original_filename || 'Untitled', doc: d });
        }
        if (rows.length === 0) return null;
        const GRID_COLUMNS = 'minmax(0, 1fr) 3.25rem 3.75rem 7.5rem 4.25rem 4.75rem';
        return (
          <ul data-testid="analysis-doc-rows" style={{ listStyle: 'none', margin: '0.6rem 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {rows.map(({ id, label, doc, quote }) => {
              const ocr = confidencePercentLabel(doc?.ocr_confidence);
              const viewable = !!(doc && (doc.pages_pdf_url || doc.storage_url));
              return (
                <li key={id} data-testid="analysis-doc-row" style={{ display: 'grid', gridTemplateColumns: GRID_COLUMNS, alignItems: 'center', columnGap: '0.5rem', fontSize: '0.82rem' }}>
                  <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>{label}</span>
                    {/* Readability badges — carried over from the retired ReviewDocCard (2026-09-06) so
                        "we could not read this deed" stays VISIBLE on the one list that is live. Without
                        them an unreadable document renders identically to one still waiting (plan R18).
                        The reason is the tooltip: re-scan, or go and read the page yourself. */}
                    {doc?.processing_status === 'unreadable' && (
                      <span
                        className="review-doc-card__badge review-doc-card__badge--err"
                        title={doc.readability_reason ?? 'The extracted text was not usable.'}
                      >
                        Unreadable
                      </span>
                    )}
                    {doc?.readability === 'partial' && (
                      <span
                        className="review-doc-card__badge review-doc-card__badge--warn"
                        title={doc.readability_reason ?? 'Less text than a recorded instrument usually contains.'}
                      >
                        Thin text
                      </span>
                    )}
                    {/* The relevance check's verdict (2026-09-07): the row stays, says so, and is not
                        in the whole-project quote. */}
                    {doc?.relevance === 'unrelated' && (
                      <span
                        className="review-doc-card__badge review-doc-card__badge--warn"
                        title={doc.relevance_classification?.reason ?? 'The relevance check found nothing tying this document to the subject tract.'}
                      >
                        Unrelated
                      </span>
                    )}
                    {ocr && <span style={{ opacity: 0.7, whiteSpace: 'nowrap' }} title="OCR confidence">OCR {ocr}</span>}
                    {/* Round lineage (plan 3.4): a follow-up's find is marked so the reviewer can tell it
                        from the original run's. Round 1 is the norm and carries no badge. */}
                    {doc?.research_round != null && doc.research_round > 1 && (
                      <span
                        className="review-doc-card__badge review-doc-card__badge--ok"
                        title={`Found by follow-up research round ${doc.research_round}`}
                      >
                        Round {doc.research_round}
                      </span>
                    )}
                  </span>
                  <span style={{ textAlign: 'right', whiteSpace: 'nowrap', opacity: 0.7 }}>
                    {quote ? `${quote.pages} pg` : doc?.page_count ? `${doc.page_count} pg` : ''}
                  </span>
                  <span style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{quote ? usd(quote.costUsd) : ''}</span>
                  <span style={{ textAlign: 'center' }}>
                    {quote ? (
                      <button
                        onClick={() => analyzeOne(quote)}
                        disabled={busyId !== null}
                        title={`Analyse this file for ${usd(quote.costUsd)}`}
                        style={{ width: '100%', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 6, padding: '0.3rem 0.5rem', fontSize: '0.78rem', fontWeight: 600, cursor: busyId ? 'default' : 'pointer', whiteSpace: 'nowrap', opacity: busyId && busyId !== quote.documentId ? 0.5 : 1 }}
                      >
                        {busyId === quote.documentId ? 'Starting…' : startedIds.has(quote.documentId) ? 'Analyzing' : 'Analyze this'}
                      </button>
                    ) : (
                      <span title="Not an AI-read file (an image, map or capture) — open it with View" style={{ opacity: 0.45 }}>—</span>
                    )}
                  </span>
                  <span style={{ textAlign: 'center' }}>
                    {viewable && onView && (
                      <button
                        onClick={() => onView(doc!)}
                        title="View — page through every page and zoom"
                        style={{ width: '100%', background: 'none', border: '1px solid #2563EB', color: '#2563EB', borderRadius: 6, padding: '0.3rem 0.5rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        View
                      </button>
                    )}
                  </span>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    {doc?.source_url && (
                      <a
                        href={doc.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open the page this was retrieved from"
                        style={{ fontSize: '0.78rem', whiteSpace: 'nowrap', color: '#2563EB' }}
                      >
                        Source ↗
                      </a>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        );
      })()}

      {error && <div role="alert" style={{ color: '#DC2626', fontSize: '0.8rem', marginTop: '0.5rem' }}>{error}</div>}
    </div>
  );
}
