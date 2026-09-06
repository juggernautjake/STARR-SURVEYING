'use client';

// app/admin/research/components/AnalysisEstimatePanel.tsx — the AI-analysis price quote (plan E3b).
//
// Shows the FIXED standardized quote for AI analysis (E1/E2): a full-analysis total (all gathered
// files' pages × the $/page rate) and a per-file list where each file carries its own price and an
// "Analyze this" button that analyses just that file (E3a) at its quoted price. So the operator sees
// exactly what a total or a single-file analysis costs before spending.

import { useEffect, useState, useCallback } from 'react';
import type { ResearchDocument } from '@/types/research';

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

      {est.perFile.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '0.6rem 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {est.perFile.map((q) => (
            <li key={q.documentId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={q.label}>{q.label}</span>
              <span style={{ opacity: 0.7 }}>{q.pages} pg</span>
              <span style={{ fontWeight: 600, minWidth: 52, textAlign: 'right' }}>{usd(q.costUsd)}</span>
              <button
                onClick={() => analyzeOne(q)}
                disabled={busyId !== null}
                title={`Analyse this file for ${usd(q.costUsd)}`}
                style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 6, padding: '0.3rem 0.7rem', fontSize: '0.78rem', fontWeight: 600, cursor: busyId ? 'default' : 'pointer', whiteSpace: 'nowrap', opacity: busyId && busyId !== q.documentId ? 0.5 : 1 }}
              >
                {busyId === q.documentId ? 'Starting…' : startedIds.has(q.documentId) ? 'Analyzing' : 'Analyze this'}
              </button>
              {/* Plan G8 — View + Source on the SAME row, merging the old "Documents & Sources" list. */}
              {(() => {
                const doc = docById.get(q.documentId);
                const viewable = !!(doc && (doc.pages_pdf_url || doc.storage_url));
                return (
                  <>
                    {viewable && onView && (
                      <button
                        onClick={() => onView(doc!)}
                        title="View — page through every page and zoom"
                        style={{ background: 'none', border: '1px solid #2563EB', color: '#2563EB', borderRadius: 6, padding: '0.3rem 0.65rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        View
                      </button>
                    )}
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
                  </>
                );
              })()}
            </li>
          ))}
        </ul>
      )}

      {error && <div role="alert" style={{ color: '#DC2626', fontSize: '0.8rem', marginTop: '0.5rem' }}>{error}</div>}
    </div>
  );
}
