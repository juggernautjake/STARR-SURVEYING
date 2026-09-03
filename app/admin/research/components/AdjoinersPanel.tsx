'use client';
// app/admin/research/components/AdjoinersPanel.tsx — the neighbours, and going deeper (R32/R33).
//
// The owner's ask: a list of nearby properties with brief descriptions and how recently each was
// surveyed, and a clear, easy, surfaced path to giving the go-ahead to fully research any of them —
// **after** the reviewer has looked at everything, and optional rather than automatic.
//
// Ordering is by what is ON FILE, not by geometry: the question a reviewer is answering is "where
// should I spend a 25-minute run", and a neighbour with a 2023 survey outranks a bigger one with
// nothing.

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, MapPin, Search, X } from 'lucide-react';
import type { AdjoinerSummary, RankedAdjoiner } from '@/lib/research/adjoiner-register';
import { IDENTIFIED_BY_MEANING } from '@/lib/research/adjoiner-register';

interface Payload {
  adjoiners: RankedAdjoiner[];
  summary: AdjoinerSummary;
}

const BAND_TONE: Record<string, string> = {
  recent: 'adjoiner__recency--recent',
  dated: 'adjoiner__recency--dated',
  old: 'adjoiner__recency--old',
  unknown: 'adjoiner__recency--unknown',
};

export default function AdjoinersPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/research/${projectId}/adjoiners`);
      if (!res.ok) { setFailed(true); return; }
      setData((await res.json()) as Payload);
      setFailed(false);
    } catch { setFailed(true); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const act = useCallback(async (adjoinerId: string, action: 'deepen' | 'decline') => {
    setBusy(adjoinerId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/research/${projectId}/adjoiners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, adjoinerId }),
      });
      if (!res.ok) {
        setError(((await res.json()) as { error?: string }).error ?? 'That could not be saved.');
        return;
      }
      await load();
    } catch {
      setError('That could not be saved — check your connection.');
    } finally {
      setBusy(null);
    }
  }, [projectId, load]);

  if (failed) {
    return (
      <div className="adjoiners adjoiners--bad">
        The neighbour register could not be read. This is <strong>not</strong> the same as there being
        no neighbours.
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="adjoiners">
      <p className="adjoiners__headline">{data.summary.headline}</p>
      {error && <p className="adjoiners__error">{error}</p>}

      {data.adjoiners.length === 0 ? (
        <p className="adjoiners__note">
          {/* An empty register is a gap in the research, not a finding about the property. */}
          No neighbouring properties have been recorded for this project yet.
        </p>
      ) : (
        <ul className="adjoiners__list">
          {data.adjoiners.map(({ row, recency, description, worthDeepening }) => (
            <li key={row.id} className={`adjoiner adjoiner--${row.depth}`}>
              <div className="adjoiner__head">
                <MapPin size={13} aria-hidden />
                <span className="adjoiner__desc">{description}</span>
                <span className={`adjoiner__recency ${BAND_TONE[recency.band]}`} title={recency.detail}>
                  {recency.label}
                </span>
              </div>

              {/* How a neighbour was identified is part of the fact — a deed call and a GIS polygon
                  are two different claims with two different failure modes. */}
              <p className="adjoiner__basis" title={IDENTIFIED_BY_MEANING[row.identified_by]}>
                {row.identified_by.replace(/_/g, ' ')} — {IDENTIFIED_BY_MEANING[row.identified_by]}
              </p>

              {/* The facts the owner asked for, and the page they came from (plan E4, seed 630):
                  a reviewer can open the neighbour at the appraisal district and check them. */}
              {(row.situs_address || row.source_url) && (
                <p className="adjoiner__facts">
                  {row.situs_address && <span>{row.situs_address}</span>}
                  {row.source_url && (
                    <a href={row.source_url} target="_blank" rel="noopener noreferrer" className="adjoiner__source">
                      Open at the appraisal district
                    </a>
                  )}
                </p>
              )}

              <p className="adjoiner__worth">{worthDeepening}</p>

              {row.depth === 'shallow' && (
                <div className="adjoiner__actions">
                  <button
                    className="adjoiner__deepen"
                    disabled={busy === row.id}
                    onClick={() => void act(row.id, 'deepen')}
                  >
                    <Search size={12} aria-hidden /> Research this property fully
                  </button>
                  <button
                    className="adjoiner__decline"
                    disabled={busy === row.id}
                    onClick={() => void act(row.id, 'decline')}
                    title="Records that somebody looked and decided not to — different from never having considered it."
                  >
                    <X size={12} aria-hidden /> Not worth it
                  </button>
                </div>
              )}

              {row.depth === 'requested' && (
                <p className="adjoiner__status">
                  <AlertTriangle size={12} aria-hidden /> Full research requested
                  {row.requested_by ? ` by ${row.requested_by}` : ''}
                  {row.requested_at ? ` on ${row.requested_at.slice(0, 10)}` : ''} — queued.
                </p>
              )}
              {row.depth === 'researched' && row.deep_project_id && (
                <a className="adjoiner__status adjoiner__status--link" href={`/admin/research/${row.deep_project_id}`}>
                  Researched in full — open its project
                </a>
              )}
              {row.depth === 'declined' && (
                <p className="adjoiner__status adjoiner__status--muted">
                  Passed over{row.requested_by ? ` by ${row.requested_by}` : ''}.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
