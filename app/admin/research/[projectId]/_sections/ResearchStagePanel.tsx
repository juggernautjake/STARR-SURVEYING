'use client';

// app/admin/research/[projectId]/_sections/ResearchStagePanel.tsx — Phase B1a, rebuilt for plan E2.
//
// ── WHAT THIS PANEL USED TO DO ──────────────────────────────────────────────────────────────────
//
// Stack four independent components and hope they agreed:
//
//     <RunConsoleBar    projectId={projectId} />   // its own fetch, its own status
//     <RunDiffPanel     projectId={projectId} />   // its own fetch
//     <ReportCardPanel  projectId={projectId} />   // its own fetch
//     <ResearchRunPanel … />                        // its own fetch, its own status, 1,774 lines
//
// They did not agree. On 2026-09-01 this exact stack rendered "AI analysis is running", "Finished
// in 2 minutes for $0.02" and "✕ Research Failed" simultaneously, about one run — with the
// completion and seventeen retrieved documents ABOVE the panel claiming failure, so an operator
// scrolled past the good news to reach the wrong news.
//
// ── WHAT IT DOES NOW ────────────────────────────────────────────────────────────────────────────
//
// Renders one view. `ResearchRunView` owns the whole screen and takes its numbers from
// `useRunState`, which polls once and derives everything from one object. The diff and the report
// card are still their own components with their own subjects — they are tab bodies inside that
// view now, so they can no longer sit beside a status they are not describing.
//
// The search inputs are still resolved by the CALLER and passed as four plain strings. They were
// once four three-way fallbacks inline in the JSX, and that is the decision G10 got wrong for
// months: the owner name fell back to a project column that does not exist, so the worker's
// owner-based clerk search never ran.

import React from 'react';
import ResearchRunView from '../../components/ResearchRunView';
import type { StartRunInput } from '../../components/useRunState';

export interface ResearchStagePanelProps {
  projectId: string;
  address: string;
  county: string;
  parcelId: string;
  ownerName: string;
  autoStart: boolean;
  onPipelineStart: () => void;
  onPipelineComplete: (status: string) => void;
  onBack: () => void;
  onContinueToReview: () => void;
  /** Opens the editable re-run dialog. The page owns it — a re-run resets project-level state. */
  onRerun?: () => void;
  /** What an edited re-run was configured with, passed through to the run that is started. */
  pendingRunInput?: StartRunInput | null;
}

export default function ResearchStagePanel({
  projectId, address, county, parcelId, ownerName, autoStart,
  onPipelineStart, onPipelineComplete, onBack, onContinueToReview, onRerun, pendingRunInput,
}: ResearchStagePanelProps) {
  return (
    <div className="research-stage2">
      <div className="research-stage2__launch">
        <ResearchRunView
          projectId={projectId}
          address={address}
          county={county}
          parcelId={parcelId}
          ownerName={ownerName}
          autoStart={autoStart}
          onPipelineStart={onPipelineStart}
          onPipelineComplete={onPipelineComplete}
          onBack={onBack}
          onContinueToReview={onContinueToReview}
          onRerun={onRerun}
          pendingRunInput={pendingRunInput}
        />
      </div>
    </div>
  );
}
