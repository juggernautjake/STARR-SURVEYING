'use client';

// app/admin/research/[projectId]/_sections/ResearchStagePanel.tsx — Phase B1a.

// Fourth extraction from `page.tsx`: Stage 2, the screen an operator watches while a run is going.
//
// ── THE SEARCH INPUTS ARE RESOLVED BY THE CALLER ────────────────────────────────────────────────
//
// The four search fields were each a three-way fallback inline in the JSX —
// `pendingSearchParams?.county ?? project.county ?? ''` — repeated four times with a different
// field. That is a decision, not markup, and it is the decision that G10 got wrong for months:
// the owner name fell back to a project column that does not exist, so the worker's owner-based
// clerk search never ran.
//
// Resolved on the page and passed in as four plain strings. This panel renders what it is given.

import React from 'react';
import { Microscope } from 'lucide-react';
import RunConsoleBar from '../../components/RunConsoleBar';
import RunDiffPanel from '../../components/RunDiffPanel';
import ReportCardPanel from '../../components/ReportCardPanel';
import ResearchRunPanel from '../../components/ResearchRunPanel';

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
}

export default function ResearchStagePanel({
  projectId, address, county, parcelId, ownerName, autoStart,
  onPipelineStart, onPipelineComplete, onBack, onContinueToReview,
}: ResearchStagePanelProps) {
  return (
    <div className="research-stage2">
      <div className="research-stage2__launch">
        <div className="research-step-header" style={{ marginBottom: '1rem' }}>
          <span className="research-step-header__icon"><Microscope size={18} strokeWidth={1.75} /></span>
          <div className="research-step-header__body">
            <h2 className="research-step-header__title">Research &amp; Analysis</h2>
          </div>
        </div>
        {/* Cost and elapsed-vs-budget, above the progress list (plan R22). The run panel showed
            neither, so an operator watching a 25-minute run could not tell what it had spent or
            whether it would finish. */}
        <RunConsoleBar projectId={projectId} />
        {/* A job that sat for three months and gained two new deeds needs to say so, and the
            approved packet needs to be told it is out of date (plan R27). */}
        <RunDiffPanel projectId={projectId} />
        <ReportCardPanel projectId={projectId} />
        <ResearchRunPanel
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
        />
  </div>
</div>
  );
}
