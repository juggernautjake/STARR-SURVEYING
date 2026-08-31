'use client';

// app/admin/research/[projectId]/_sections/ProjectStats.tsx — Phase B2 (under B1a).
//
// ── WHY THE FILE IS BEING SPLIT AT ALL ──────────────────────────────────────────────────────────
//
// `[projectId]/page.tsx` is 3,680 lines. B1's original plan was to split it into tabs; that premise
// turned out false — the tabs it proposed already exist as routes — so B1a replaces it: extract in
// place, one SECTION per slice, each separately revertable, each with a wiring test asserting the
// page still mounts it.
//
// This is the first extraction, and it was chosen because it is the smallest honest one. Four tiles,
// one object, two callbacks. A first extraction that has to reason about auto-save, CAD annotation
// state and the beforeunload handler is a first extraction that gets abandoned halfway.
//
// ── CALLBACKS, NOT THE ROUTER ───────────────────────────────────────────────────────────────────
//
// The original read `router.push` and `scrollToReview` directly. Passing `router` down would make
// this section untestable without a Next.js router and would let it navigate anywhere; passing two
// named callbacks says exactly what it is allowed to do. It is now presentational — it renders
// numbers and reports clicks, and it holds no state at all.
//
// ── WHAT MUST NOT REGRESS ───────────────────────────────────────────────────────────────────────
//
// Every tile is a real `<button>` with an `aria-label` naming both the number and the destination
// (Slice C4). Three of the four are DISABLED at zero, deliberately: a tile that scrolls to an empty
// panel is a promise the page cannot keep. Documents is not disabled, because the documents route
// is worth reaching even with nothing in it — that is where you go to add some.

import React from 'react';

/** The tab ids `scrollToReview` accepts on the parent. Kept in sync with `reviewTab` in page.tsx. */
export type ReviewTab =
  | 'summary' | 'property' | 'survey' | 'easements'
  | 'neighbours' | 'discrepancies' | 'artifacts' | 'packet';

export interface ProjectStatsCounts {
  document_count: number;
  data_point_count: number;
  discrepancy_count: number;
  resolved_count: number;
}

export interface ProjectStatsProps {
  stats: ProjectStatsCounts;
  /** The Documents tile navigates; the others scroll in place. Different verbs, different props. */
  onOpenDocuments: () => void;
  onScrollToReview: (tab: ReviewTab) => void;
}

export default function ProjectStats({ stats, onOpenDocuments, onScrollToReview }: ProjectStatsProps) {
  return (
    <div className="research-hub__stats">
      <button
        type="button"
        className="research-hub__stat research-hub__stat--button"
        onClick={onOpenDocuments}
        aria-label={`${stats.document_count} documents — open documents library`}
      >
        <div className="research-hub__stat-value">{stats.document_count}</div>
        <div className="research-hub__stat-label">Documents</div>
      </button>
      <button
        type="button"
        className="research-hub__stat research-hub__stat--button"
        onClick={() => onScrollToReview('artifacts')}
        disabled={stats.data_point_count === 0}
        aria-label={`${stats.data_point_count} data points — open artifacts tab`}
      >
        <div className="research-hub__stat-value">{stats.data_point_count}</div>
        <div className="research-hub__stat-label">Data Points</div>
      </button>
      <button
        type="button"
        className="research-hub__stat research-hub__stat--button"
        onClick={() => onScrollToReview('discrepancies')}
        disabled={stats.discrepancy_count === 0}
        aria-label={`${stats.discrepancy_count} discrepancies — open discrepancies tab`}
      >
        <div className="research-hub__stat-value">{stats.discrepancy_count}</div>
        <div className="research-hub__stat-label">Discrepancies</div>
      </button>
      <button
        type="button"
        className="research-hub__stat research-hub__stat--button"
        onClick={() => onScrollToReview('discrepancies')}
        disabled={stats.discrepancy_count === 0}
        aria-label={
          stats.discrepancy_count > 0
            ? `${stats.resolved_count} of ${stats.discrepancy_count} discrepancies resolved — open discrepancies tab`
            : 'No discrepancies to resolve yet'
        }
      >
        <div className="research-hub__stat-value">
          {stats.discrepancy_count > 0
            ? `${stats.resolved_count}/${stats.discrepancy_count}`
            : '-'}
        </div>
        <div className="research-hub__stat-label">Resolved</div>
      </button>
    </div>
  );
}
