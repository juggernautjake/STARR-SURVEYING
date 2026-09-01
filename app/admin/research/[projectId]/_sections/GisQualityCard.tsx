// app/admin/research/[projectId]/_sections/GisQualityCard.tsx — B1a, fourteenth extraction.
//
// The Artifacts tab's GIS screenshot quality panel. It was 47 lines of inline JSX with an IIFE, a
// seven-key cast and five literal colours; the shaping is `gis-quality-data.ts` and the colours are
// `.gis-quality__*` in AdminResearch.css. See the data module for why both audits were blind to it.
//
// Deliberately dumb: it takes a report and renders it. `gisQualityOf` decides whether there is one,
// so "no report" and "a report with no checks" are answered in one place rather than half here.

'use client';

import { Check, AlertTriangle, X } from 'lucide-react';
import { toneForScore, type GisQualityReport, type GisTone } from './gis-quality-data';

/** Colour is never the only signal — the icon says the same thing without it. */
const TONE_ICON: Record<GisTone, typeof Check> = {
  good: Check,
  fair: AlertTriangle,
  poor: X,
};

export default function GisQualityCard({ report }: { report: GisQualityReport | null }) {
  if (!report) return null;

  return (
    <div className="gis-quality">
      <h4 className="gis-quality__title">GIS Screenshot Quality Analysis</h4>
      {report.summary && <p className="gis-quality__summary">{report.summary}</p>}

      <div className="gis-quality__checks">
        {report.checks.map((c, i) => {
          const tone = toneForScore(c.qualityScore);
          const Icon = TONE_ICON[tone];
          return (
            <div key={i} className="gis-quality__check">
              <div className="gis-quality__check-head">
                <span className={`gis-quality__score gis-quality__score--${tone}`}>
                  <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
                  {c.qualityScore}/100
                </span>
                <span className="gis-quality__label">{c.label}</span>
                {c.zoomAssessment && (
                  <span className="gis-quality__zoom">zoom: {c.zoomAssessment}</span>
                )}
              </div>
              {c.whatIsShown && <p className="gis-quality__shown">{c.whatIsShown}</p>}
              {c.recommendations.length > 0 && (
                <ul className="gis-quality__recs">
                  {c.recommendations.map((r, j) => <li key={j}>{r}</li>)}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {report.actionableAdjustments.length > 0 && (
        <div className="gis-quality__adjustments">
          <strong>Recommended adjustments:</strong>
          <ul>
            {report.actionableAdjustments.map((adj, k) => <li key={k}>{adj}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
