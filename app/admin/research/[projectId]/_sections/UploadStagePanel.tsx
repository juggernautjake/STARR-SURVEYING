'use client';

// app/admin/research/[projectId]/_sections/UploadStagePanel.tsx — Phase B1a.

// Fifth extraction from `page.tsx`: Stage 1, where documents go in and the property is described.
//
// ── THE NOTE IN THE MIDDLE IS THE POINT OF THIS SCREEN ──────────────────────────────────────────
//
// `research-pipeline-note` says, in the operator's words, that this button starts the IN-APP
// analysis: it cannot buy a document and the per-run spend limit does not apply to it. That note
// exists because the owner started a run from here expecting a $10 limit and a TexasFile purchase
// and got neither — `research_document_purchases` has 0 rows after every run started from this
// screen, and nothing on it said why.
//
// It is content, not decoration. `__tests__/research/pipeline-note-is-present.test.ts` guards it,
// and that guard now points here.
//
// ── THE SEARCH DEFAULTS ARE RESOLVED BY THE CALLER ──────────────────────────────────────────────
//
// Same reasoning as `ResearchStagePanel`: `defaultOwnerName` used to read a project column that
// does not exist (G10), and four near-identical fallbacks in the markup are what hid it. The page
// resolves them; this renders what it is given.

import React from 'react';
import { Upload } from 'lucide-react';
import DocumentUploadPanel from '../../components/DocumentUploadPanel';
import PropertySearchPanel from '../../components/PropertySearchPanel';
import type { ResearchDocument } from '@/types/research';

export interface UploadStagePanelProps {
  projectId: string;
  documents: ResearchDocument[];
  address: string;
  county: string;
  parcelId: string;
  ownerName: string;
  /** Both panels reload the same two things, so they share one callback. */
  onDocumentsChanged: () => void;
  onNavigateAway: (params: { address: string; county: string; parcelId: string; ownerName: string }) => void;
  onUseBatchJob: () => void;
}

export default function UploadStagePanel({
  projectId, documents, address, county, parcelId, ownerName,
  onDocumentsChanged, onNavigateAway, onUseBatchJob,
}: UploadStagePanelProps) {
  return (
    <>
          <div className="research-step-header">
            <span className="research-step-header__icon"><Upload size={18} strokeWidth={1.75} /></span>
            <div className="research-step-header__body">
              <h2 className="research-step-header__title">Property Information</h2>
              <p className="research-step-header__desc">
                Give the property details below, then click <strong>Start AI analysis</strong>. STARR RECON
                searches the public records, captures the county CAD and deed sites, extracts the data with
                AI, and logs any discrepancies. You can also add your own deeds, plats and field notes in
                the panel underneath.
              </p>
            </div>
          </div>

          {/* ── WHICH ENGINE THIS BUTTON STARTS ─────────────────────────────────────────────
              There are two research pipelines and, until now, nothing on screen said which one
              this is. Measured: zero references to WORKER_URL in the analyze route or
              analysis.service.ts — this path runs IN THE APP and never contacts the research
              worker. So it does not use run-budget.ts and cannot buy a document, which is why
              `research_document_purchases` has 0 rows after every run started from here.

              The owner started a run from this screen expecting the $10 spend limit to apply and
              a TexasFile purchase to happen, and got neither, because this engine has neither.
              That is a CONTENT problem, not a styling one: no amount of layout work fixes a
              screen that is quietly the wrong engine. Saying so costs four lines. */}
          <div className="research-pipeline-note" role="note">
            <strong>This runs the in-app analysis.</strong> It reads the documents you upload and
            searches free public sources. It does <strong>not</strong> purchase paid documents and
            the per-run spend limit does not apply — so nothing here can cost money.
            {' '}
            <button
              type="button"
              className="research-pipeline-note__link"
              onClick={onUseBatchJob}
            >
              Use a batch job
            </button>
            {' '}for a worker run that can buy documents, with a spend limit.
          </div>
          {/* ── THE FORM COMES FIRST (U3-C) ──────────────────────────────────────────────────
              It used to come after the document panel, which on a project with seventeen
              retrieved documents put the property details — the thing you must fill in FIRST,
              and the thing the run button lives on — roughly 2,400px down the page, below a
              list you did not come here to read.

              The owner's description of this flow is four steps: *"input information, hit the
              research button, wait for it to finish, review results."* Step one was last. */}
          <PropertySearchPanel
            projectId={projectId}
            defaultAddress={address}
            defaultCounty={county}
            defaultParcelId={parcelId}
            defaultOwnerName={ownerName}
            hideResultsAndProgress
            onNavigateAway={onNavigateAway}
            onImported={onDocumentsChanged}
          />
          <DocumentUploadPanel
            projectId={projectId}
            documents={documents}
            onDocumentsChanged={onDocumentsChanged}
          />
    </>
  );
}
