'use client';
// app/admin/research/components/EncumbrancePanel.tsx — what encumbers this property (plan R34).
//
// An easement is usually recorded against ONE of the two tracts it crosses. A utility easement
// granted by the neighbour to the north, running along the common line, sits in the neighbour's deed
// and appears nowhere in this property's chain — and it still matters. So the rollup includes
// neighbour-recorded encumbrances, marks them clearly as such, and does NOT decide whether they
// burden this tract: that depends on the grant's wording and on where the line really falls.

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Route as RouteIcon } from 'lucide-react';
import type { Encumbrance, EncumbranceSummary } from '@/lib/research/encumbrance-rollup';

interface Payload {
  encumbrances: Encumbrance[];
  summary: EncumbranceSummary;
  neighboursResearched: number;
  neighboursNotResearched: number;
}

const KIND_LABEL: Record<string, string> = {
  easement: 'Easement',
  right_of_way: 'Right of way',
  setback: 'Setback',
  restriction: 'Restriction',
  unknown: 'Encumbrance',
};

export default function EncumbrancePanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/research/${projectId}/encumbrances`);
      if (!res.ok) { setFailed(true); return; }
      setData((await res.json()) as Payload);
      setFailed(false);
    } catch { setFailed(true); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  if (failed) {
    return (
      <div className="encumbrances encumbrances--bad">
        The encumbrances could not be read. This is <strong>not</strong> the same as there being none.
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="encumbrances">
      <p className="encumbrances__headline">{data.summary.headline}</p>

      {/* The gap this rollup cannot close by itself, sized. Researching more neighbours is the
          action that closes it, so the number is stated rather than implied. */}
      {data.neighboursNotResearched > 0 && (
        <p className="encumbrances__gap">
          <AlertTriangle size={13} aria-hidden /> {data.neighboursNotResearched} neighbour(s) have not
          been researched in full. Anything recorded only against them is missing from this list —
          see the Neighbours tab.
        </p>
      )}

      {data.encumbrances.length > 0 && (
        <ul className="encumbrances__list">
          {data.encumbrances.map((e) => (
            <li key={e.id} className={`encumbrance encumbrance--${e.origin}`}>
              <div className="encumbrance__head">
                <RouteIcon size={13} aria-hidden />
                <span className="encumbrance__kind">{KIND_LABEL[e.kind]}</span>
                {e.purpose && <span className="encumbrance__purpose">{e.purpose}</span>}
                {/* A stated width is what turns "there is an easement" into something a crew can
                    stake, so its absence is shown rather than left blank. */}
                <span className={`encumbrance__width${e.widthFt == null ? ' encumbrance__width--none' : ''}`}>
                  {e.widthFt != null ? `${e.widthFt}' wide` : 'no width stated'}
                </span>
                {e.unverified && <span className="encumbrance__unverified">unchecked</span>}
              </div>

              <p className="encumbrance__text">{e.text}</p>

              <p className={`encumbrance__source${e.origin === 'adjoiner' ? ' encumbrance__source--adjoiner' : ''}`}>
                {e.source}
              </p>
              {/* Surfaced, never decided — the same treatment R20 gives a conflict. */}
              {e.origin === 'adjoiner' && <p className="encumbrance__bearing">{e.bearing}</p>}
            </li>
          ))}
        </ul>
      )}

      <ul className="encumbrances__caveats">
        {data.summary.caveats.map((c, i) => <li key={i}>{c}</li>)}
      </ul>
    </div>
  );
}
