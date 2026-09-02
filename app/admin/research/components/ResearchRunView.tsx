'use client';

// app/admin/research/components/ResearchRunView.tsx — the Research & Analysis screen, rebuilt
// (plan E1–E3).
//
// ── WHAT WAS THERE ──────────────────────────────────────────────────────────────────────────────
//
// Four stacked panels, each fetching its own endpoint and rendering its own opinion, in this order
// down the page:
//
//   RunConsoleBar     cost and elapsed-vs-budget          → "Finished in 2 minutes for $0.02."
//   RunDiffPanel      17 changes since the previous run   → a wall of 17 rows, always expanded
//   ReportCardPanel   facts, conflicts, sources           → "0 facts … 0 sources reached"
//   ResearchRunPanel  status, progress, documents, logs   → "✕ Research Failed · 13%"
//
// An operator scrolled past a completion, seventeen new documents and a scorecard of zeros before
// reaching the thing that said the run had failed. Four answers to "what is happening", none of
// them agreeing, and the most alarming one last.
//
// ── WHAT THIS IS ────────────────────────────────────────────────────────────────────────────────
//
// One view, in the order the questions are actually asked:
//
//   1. WHAT IS IT DOING?   status, phase, one honest bar, elapsed, spend — always visible
//   2. WHAT HAS IT FOUND?  documents as they arrive, live
//   3. WHAT ELSE?          activity log, what changed, the report card — one at a time, in tabs
//
// Every number in the header comes from `useRunState`, which derives them all from one object. The
// panels that used to disagree are now tab bodies: they still own their own subject, but they can
// no longer contradict the header, because the header is not theirs to describe.

import React, { useMemo, useState } from 'react';
import {
  Microscope, FileText, ListTree, GitCompare, ClipboardCheck,
  Loader2, CheckCircle2, XCircle, PauseCircle, AlertTriangle, Ban, RefreshCw, ChevronLeft,
} from 'lucide-react';
import { formatElapsed, type RunState } from '@/lib/research/run-state';
import { useRunState, type RunDocument, type StartRunInput } from './useRunState';
import RunDiffPanel from './RunDiffPanel';
import ReportCardPanel from './ReportCardPanel';
import type { PipelineLogEntry } from './PipelineProgressPanel';

export interface ResearchRunViewProps {
  projectId: string;
  address?: string;
  county?: string;
  parcelId?: string;
  ownerName?: string;
  /** Fire a run on mount — set when arriving from "Initiate Research & Analysis". */
  autoStart?: boolean;
  onPipelineStart?: () => void;
  onPipelineComplete?: (status: string) => void;
  onBack?: () => void;
  onContinueToReview?: () => void;
  /** Open the editable re-run dialog. Owned by the page, because a re-run resets project state. */
  onRerun?: () => void;
  /**
   * Everything an edited re-run was configured with, when the run being started came from the
   * re-run dialog.
   *
   * Without this the settings the operator just chose would be collected, displayed, confirmed —
   * and then dropped on the way to the POST, which is the exact shape of defect this plan is full
   * of. When absent, the four search fields are used and the run gets its defaults.
   */
  pendingRunInput?: StartRunInput | null;
}

type TabId = 'documents' | 'activity' | 'changes' | 'report';

export default function ResearchRunView({
  projectId, address, county, parcelId, ownerName, autoStart = true,
  onPipelineStart, onPipelineComplete, onBack, onContinueToReview, onRerun,
  pendingRunInput,
}: ResearchRunViewProps) {
  const run = useRunState(projectId);
  const { state } = run;
  const [tab, setTab] = useState<TabId>('documents');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // ── Auto-start, exactly once ────────────────────────────────────────────────────────────────
  const firedRef = React.useRef(false);
  React.useEffect(() => {
    if (!autoStart || firedRef.current) return;
    firedRef.current = true;
    // The dialog's choices win. Falling back to the four search fields keeps a plain "start
    // analysis" working exactly as before.
    void run.start(pendingRunInput ?? { address, county, parcelId, ownerName, trigger: 'initial' });
    onPipelineStart?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  // Report a finish upward once. `lifecycle` is derived from one source, so this can no longer fire
  // on a stale payload about the previous run.
  const reportedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (state.lifecycle === 'active' || state.lifecycle === 'idle') return;
    const key = `${state.runId ?? 'norun'}:${state.lifecycle}`;
    if (reportedRef.current === key) return;
    reportedRef.current = key;
    onPipelineComplete?.(state.lifecycle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lifecycle, state.runId]);

  const liveDocs = useMemo(
    () => run.documents.filter((d) => !d.superseded_at && !d.duplicate_of),
    [run.documents],
  );
  const priorDocs = useMemo(
    () => run.documents.filter((d) => d.superseded_at && !d.duplicate_of),
    [run.documents],
  );

  return (
    <div className="rrv">
      <RunViewStyles />

      <header className="rrv__head">
        <span className="rrv__head-icon"><Microscope size={18} strokeWidth={1.75} aria-hidden /></span>
        <div className="rrv__head-body">
          <h2 className="rrv__title">Research &amp; Analysis</h2>
          {state.runNumber != null && (
            <p className="rrv__subtitle">Run {state.runNumber}</p>
          )}
        </div>
        <div className="rrv__head-actions">
          {onBack && (
            <button type="button" className="rrv__btn rrv__btn--quiet" onClick={onBack}>
              <ChevronLeft size={14} aria-hidden /> Property Information
            </button>
          )}
          {onRerun && state.lifecycle !== 'active' && (
            <button type="button" className="rrv__btn" onClick={onRerun}>
              <RefreshCw size={14} aria-hidden /> Re-run…
            </button>
          )}
        </div>
      </header>

      {/* ── 1. WHAT IS IT DOING ─────────────────────────────────────────────────────────────── */}
      <StatusCard
        state={state}
        cancelling={run.cancelling}
        onCancelRequest={() => setShowCancelConfirm(true)}
      />

      {run.startError && (
        // A start that never happened is not a run that failed. Rendering the two the same way put
        // a red "Research Failed" over projects where nothing had been attempted.
        <p className="rrv__note rrv__note--bad" role="alert">
          <XCircle size={14} aria-hidden /> {run.startError}
        </p>
      )}

      {run.liteFallback && (
        <p className="rrv__note rrv__note--warn">
          <AlertTriangle size={14} aria-hidden />
          <span>
            <strong>Running the reduced pipeline.</strong> The full research worker is not
            answering ({run.liteFallback}) — this run does no county portal scraping and no document
            purchase. Re-run when the worker is back for the deeper result.
          </span>
        </p>
      )}

      {state.looksStalled && state.lifecycle === 'active' && (
        <p className="rrv__note rrv__note--warn">
          <AlertTriangle size={14} aria-hidden />
          Nothing has been heard from this run for over ten minutes. Its process has probably
          stopped — the documents it already retrieved are kept either way.
        </p>
      )}

      {state.skipped.length > 0 && (
        <div className="rrv__note rrv__note--warn">
          <AlertTriangle size={14} aria-hidden />
          <div>
            <strong>{state.skipped.length} piece(s) of work were skipped to stay inside the
            budget.</strong> A run that finished having skipped the deed chain is not a run that
            finished.
            <ul className="rrv__skipped">
              {state.skipped.map((s, i) => (
                <li key={i}><strong>{s.what}</strong> — {s.reason}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── 2. WHAT HAS IT FOUND ────────────────────────────────────────────────────────────── */}
      <div className="rrv__counters">
        <Counter label="Documents" value={liveDocs.length} live={state.lifecycle === 'active'} />
        <Counter
          label="Pages"
          value={liveDocs.reduce((n, d) => n + (d.page_count ?? 0), 0)}
          live={state.lifecycle === 'active'}
        />
        <Counter
          label="Spent"
          value={state.spendUnrecorded ? '—' : `$${(state.spendUsd ?? 0).toFixed(2)}`}
          // $0.00 and "nothing was recorded" are different facts, and conflating them is how a
          // broken spend writer looked like a free run for months.
          hint={state.spendUnrecorded
            ? 'No usage events were recorded for this run. That is NOT the same as it having cost nothing.'
            : undefined}
        />
        <Counter label="Elapsed" value={formatElapsed(state.elapsedMs)} />
      </div>

      {/* ── 3. WHAT ELSE ────────────────────────────────────────────────────────────────────── */}
      <div className="rrv__tabs" role="tablist" aria-label="Run detail">
        <Tab id="documents" current={tab} onSelect={setTab} icon={<FileText size={14} aria-hidden />}
             count={liveDocs.length}>Documents</Tab>
        <Tab id="activity" current={tab} onSelect={setTab} icon={<ListTree size={14} aria-hidden />}
             count={run.logs.length}>Activity</Tab>
        <Tab id="changes" current={tab} onSelect={setTab} icon={<GitCompare size={14} aria-hidden />}>
          What changed</Tab>
        <Tab id="report" current={tab} onSelect={setTab} icon={<ClipboardCheck size={14} aria-hidden />}>
          Report card</Tab>
      </div>

      <div className="rrv__panel" role="tabpanel" id={`rrv-panel-${tab}`} aria-labelledby={`rrv-tab-${tab}`}>
        {tab === 'documents' && (
          <DocumentList
            docs={liveDocs}
            prior={priorDocs}
            loading={run.documentsLoading}
            active={state.lifecycle === 'active'}
          />
        )}
        {tab === 'activity' && <ActivityLog logs={run.logs} active={state.lifecycle === 'active'} />}
        {tab === 'changes' && <RunDiffPanel projectId={projectId} />}
        {tab === 'report' && <ReportCardPanel projectId={projectId} />}
      </div>

      {onContinueToReview && state.lifecycle !== 'active' && state.lifecycle !== 'idle' && (
        <div className="rrv__footer">
          <button type="button" className="rrv__btn rrv__btn--primary" onClick={onContinueToReview}>
            Continue to Review
          </button>
        </div>
      )}

      {showCancelConfirm && (
        <div className="rrv__modal" role="dialog" aria-modal="true" aria-labelledby="rrv-cancel-title">
          <div className="rrv__modal-card">
            <h3 id="rrv-cancel-title" className="rrv__modal-title">Stop this run?</h3>
            <p className="rrv__modal-text">
              Everything already retrieved is <strong>kept</strong> — stopping does not delete
              documents and does not refund anything already bought. You can re-run from here, and
              the next run will not re-buy what this one already paid for.
            </p>
            <div className="rrv__modal-actions">
              <button type="button" className="rrv__btn rrv__btn--quiet"
                      onClick={() => setShowCancelConfirm(false)}>
                Keep running
              </button>
              <button type="button" className="rrv__btn rrv__btn--danger"
                      onClick={() => { setShowCancelConfirm(false); void run.cancel(); }}>
                <Ban size={14} aria-hidden /> Stop the run
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── The status card ─────────────────────────────────────────────────────────────────────────────

function StatusCard({
  state, cancelling, onCancelRequest,
}: { state: RunState; cancelling: boolean; onCancelRequest: () => void }) {
  const { lifecycle, outcome } = state;
  // `isProblem` is the ONLY thing that turns this card red. Not "is it finished", not "did it
  // stop" — a budget wind-down, a cancellation and a worker restart are all normal outcomes, and
  // rendering them as failures is the defect this whole view exists to remove.
  const tone = outcome.isProblem ? 'bad' : lifecycle === 'active' ? 'busy' : lifecycle === 'idle' ? 'idle' : 'good';

  return (
    <section className={`rrv__status rrv__status--${tone}`} aria-live="polite">
      <div className="rrv__status-top">
        <span className="rrv__status-icon">
          {lifecycle === 'active'      ? <Loader2 size={18} className="rrv__spin" aria-hidden />
           : outcome.isProblem         ? <XCircle size={18} aria-hidden />
           : lifecycle === 'cancelled' ? <Ban size={18} aria-hidden />
           : lifecycle === 'interrupted' ? <PauseCircle size={18} aria-hidden />
           : lifecycle === 'idle'      ? <Microscope size={18} aria-hidden />
           : <CheckCircle2 size={18} aria-hidden />}
        </span>
        <div className="rrv__status-body">
          <p className="rrv__status-headline">{outcome.headline}</p>
          {state.phaseLabel && lifecycle === 'active' && (
            <p className="rrv__status-phase">{state.phaseLabel}</p>
          )}
          {state.activity && (
            <p className="rrv__status-activity" title={state.activity}>{state.activity}</p>
          )}
        </div>
        <span className={`rrv__badge rrv__badge--${tone}`}>{outcome.label}</span>
      </div>

      {lifecycle !== 'idle' && (
        <div className="rrv__bar" role="progressbar" aria-valuenow={state.percent}
             aria-valuemin={0} aria-valuemax={100}
             aria-label={`Research progress: ${state.percent}%`}>
          <div className={`rrv__bar-fill rrv__bar-fill--${tone}`} style={{ width: `${state.percent}%` }} />
          <span className="rrv__bar-pct">{state.percent}%</span>
        </div>
      )}

      {outcome.detail && <p className="rrv__status-detail">{outcome.detail}</p>}

      {state.budgetMs != null && lifecycle === 'active' && (
        <p className="rrv__status-budget">
          {Math.round(state.elapsedMs / 60_000)} of {Math.round(state.budgetMs / 60_000)} minutes used.
        </p>
      )}

      {state.canCancel && (
        <button type="button" className="rrv__btn rrv__btn--danger rrv__status-cancel"
                onClick={onCancelRequest} disabled={cancelling}>
          <Ban size={14} aria-hidden /> {cancelling ? 'Stopping…' : 'Stop the run'}
        </button>
      )}
    </section>
  );
}

function Counter({ label, value, live, hint }: {
  label: string; value: number | string; live?: boolean; hint?: string;
}) {
  return (
    <div className="rrv__counter" title={hint}>
      <span className="rrv__counter-value">
        {value}
        {live && <span className="rrv__counter-live" aria-label="updating" />}
      </span>
      <span className="rrv__counter-label">{label}</span>
    </div>
  );
}

function Tab({ id, current, onSelect, icon, count, children }: {
  id: TabId; current: TabId; onSelect: (t: TabId) => void;
  icon: React.ReactNode; count?: number; children: React.ReactNode;
}) {
  const selected = current === id;
  return (
    <button
      type="button"
      role="tab"
      id={`rrv-tab-${id}`}
      aria-selected={selected}
      aria-controls={`rrv-panel-${id}`}
      tabIndex={selected ? 0 : -1}
      className={`rrv__tab${selected ? ' rrv__tab--on' : ''}`}
      onClick={() => onSelect(id)}
      onKeyDown={(e) => {
        // Home/End included, because seventeen tablists in this codebase shipped without them.
        const order: TabId[] = ['documents', 'activity', 'changes', 'report'];
        const i = order.indexOf(id);
        if (e.key === 'ArrowRight') onSelect(order[(i + 1) % order.length]);
        if (e.key === 'ArrowLeft') onSelect(order[(i - 1 + order.length) % order.length]);
        if (e.key === 'Home') onSelect(order[0]);
        if (e.key === 'End') onSelect(order[order.length - 1]);
      }}
    >
      {icon} {children}
      {count != null && count > 0 && <span className="rrv__tab-count">{count}</span>}
    </button>
  );
}

// ── Documents ───────────────────────────────────────────────────────────────────────────────────

function DocumentList({ docs, prior, loading, active }: {
  docs: RunDocument[]; prior: RunDocument[]; loading: boolean; active: boolean;
}) {
  const [showPrior, setShowPrior] = useState(false);

  if (docs.length === 0) {
    return (
      <p className="rrv__empty">
        {active
          ? 'No documents retrieved yet. They appear here as they arrive.'
          : loading
            ? 'Loading documents…'
            : 'This run retrieved no documents.'}
      </p>
    );
  }

  return (
    <>
      <ul className="rrv__docs">
        {docs.map((d) => (
          <li key={d.id} className="rrv__doc">
            <FileText size={14} className="rrv__doc-icon" aria-hidden />
            <span className="rrv__doc-label">
              {d.document_label || d.document_type || 'Untitled document'}
              {d.recording_info && <span className="rrv__doc-rec"> · {d.recording_info}</span>}
            </span>
            <span className="rrv__doc-meta">
              {d.page_count ? `${d.page_count} pp` : ''}
              {/* A document run 2 found again is an OBSERVATION, not a new document — the row is
                  the same one, with its counter moved on. Saying so is what stops "17 new
                  documents" being read as 17 things nobody had seen. */}
              {(d.run_seen_count ?? 1) > 1 && (
                <span className="rrv__doc-seen" title={`Found again by ${d.run_seen_count} runs — not re-filed`}>
                  seen ×{d.run_seen_count}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {prior.length > 0 && (
        <div className="rrv__prior">
          <button type="button" className="rrv__btn rrv__btn--quiet"
                  onClick={() => setShowPrior((v) => !v)} aria-expanded={showPrior}>
            {showPrior ? 'Hide' : 'Show'} {prior.length} document(s) from earlier runs
          </button>
          {/* Kept, not deleted. A re-run supersedes; the previous run's files stay downloadable,
              because a run cut short has usually already BOUGHT some of them. */}
          {showPrior && (
            <ul className="rrv__docs rrv__docs--prior">
              {prior.map((d) => (
                <li key={d.id} className="rrv__doc">
                  <FileText size={14} className="rrv__doc-icon" aria-hidden />
                  <span className="rrv__doc-label">{d.document_label || d.document_type || 'Untitled'}</span>
                  <span className="rrv__doc-meta">from an earlier run</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

// ── Activity ────────────────────────────────────────────────────────────────────────────────────

function ActivityLog({ logs, active }: { logs: PipelineLogEntry[]; active: boolean }) {
  if (logs.length === 0) {
    return <p className="rrv__empty">{active ? 'Waiting for the first activity…' : 'No activity was recorded.'}</p>;
  }
  return (
    <ul className="rrv__log">
      {logs.map((e, i) => (
        <li key={i} className={`rrv__log-row rrv__log-row--${e.status}`}>
          <span className="rrv__log-status" aria-hidden>
            {e.status === 'success' ? '✓' : e.status === 'fail' ? '✕' : e.status === 'warn' ? '⚠' : e.status === 'partial' ? '~' : '−'}
          </span>
          <span className="rrv__log-layer">{e.layer}</span>
          <span className="rrv__log-text">
            {e.details || e.error || e.method || e.source}
          </span>
          {e.dataPointsFound > 0 && <span className="rrv__log-count">{e.dataPointsFound}</span>}
        </li>
      ))}
    </ul>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────────────────────────
//
// Theme tokens throughout, with a literal fallback in the `var()` so a missing token degrades to a
// readable colour rather than to `inherit`. Sixteen tokens read by 159 rules were once defined
// nowhere in this repo, which is why the fallbacks are not optional decoration.
//
// Local to the component rather than in AdminResearch.css: that stylesheet loads LAST on this
// route, so a shared-class rule written there wins over anything a component sets, and a fix aimed
// at this screen can silently miss it.

function RunViewStyles() {
  return (
    <style>{`
.rrv { display: flex; flex-direction: column; gap: 0.85rem; }

.rrv__head { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
.rrv__head-icon { display: inline-flex; color: var(--theme-fg-secondary, #374151); }
.rrv__head-body { flex: 1 1 12rem; min-width: 0; }
.rrv__title { margin: 0; font-size: 1.05rem; font-weight: 650; color: var(--theme-fg-primary, #111827); }
.rrv__subtitle { margin: 0.1rem 0 0; font-size: 0.78rem; color: var(--theme-fg-muted, #6B7280); }
.rrv__head-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }

.rrv__btn {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.42rem 0.8rem; border-radius: 7px; cursor: pointer;
  font-size: 0.82rem; font-weight: 600; line-height: 1.2;
  border: 1px solid var(--theme-border, #D1D5DB);
  background: var(--theme-bg-elevated, #fff);
  color: var(--theme-fg-primary, #111827);
}
.rrv__btn:hover { filter: brightness(0.97); }
.rrv__btn:focus-visible { outline: 2px solid #2563EB; outline-offset: 2px; }
.rrv__btn:disabled { opacity: 0.6; cursor: not-allowed; }
.rrv__btn--quiet { font-weight: 500; color: var(--theme-fg-secondary, #374151); }
.rrv__btn--primary { background: #2563EB; border-color: #2563EB; color: #fff; }
.rrv__btn--danger { background: #fff; border-color: #DC2626; color: #DC2626; }

/* ── Status card ─────────────────────────────────────────────────────────────────────────── */
.rrv__status {
  border: 1px solid var(--theme-border, #E5E7EB); border-radius: 10px;
  padding: 0.85rem 1rem; display: flex; flex-direction: column; gap: 0.6rem;
  background: var(--theme-bg-elevated, #fff);
}
.rrv__status--busy { border-color: #93C5FD; background: color-mix(in srgb, #EFF6FF 60%, var(--theme-bg-elevated, #fff)); }
.rrv__status--good { border-color: #86EFAC; background: color-mix(in srgb, #F0FDF4 60%, var(--theme-bg-elevated, #fff)); }
.rrv__status--bad  { border-color: #FCA5A5; background: color-mix(in srgb, #FEF2F2 60%, var(--theme-bg-elevated, #fff)); }

.rrv__status-top { display: flex; align-items: flex-start; gap: 0.6rem; }
.rrv__status-icon { display: inline-flex; padding-top: 0.1rem; }
.rrv__status--busy .rrv__status-icon { color: #2563EB; }
.rrv__status--good .rrv__status-icon { color: #16A34A; }
.rrv__status--bad  .rrv__status-icon { color: #DC2626; }
.rrv__status-body { flex: 1 1 auto; min-width: 0; }
.rrv__status-headline { margin: 0; font-size: 0.95rem; font-weight: 650; color: var(--theme-fg-primary, #111827); }
.rrv__status-phase { margin: 0.15rem 0 0; font-size: 0.85rem; font-weight: 550; color: var(--theme-fg-secondary, #374151); }
.rrv__status-activity {
  margin: 0.15rem 0 0; font-size: 0.78rem; color: var(--theme-fg-muted, #6B7280);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.rrv__status-detail { margin: 0; font-size: 0.82rem; line-height: 1.5; color: var(--theme-fg-secondary, #374151); }
.rrv__status-budget { margin: 0; font-size: 0.78rem; color: var(--theme-fg-muted, #6B7280); }
.rrv__status-cancel { align-self: flex-start; }

.rrv__badge {
  flex: 0 0 auto; padding: 0.2rem 0.55rem; border-radius: 999px;
  font-size: 0.72rem; font-weight: 650; white-space: nowrap;
  border: 1px solid var(--theme-border, #D1D5DB); color: var(--theme-fg-secondary, #374151);
}
.rrv__badge--busy { border-color: #93C5FD; color: #1D4ED8; }
.rrv__badge--good { border-color: #86EFAC; color: #15803D; }
.rrv__badge--bad  { border-color: #FCA5A5; color: #B91C1C; }

.rrv__bar {
  position: relative; height: 1.35rem; border-radius: 999px; overflow: hidden;
  background: color-mix(in srgb, var(--theme-fg-muted, #6B7280) 15%, transparent);
}
.rrv__bar-fill { height: 100%; transition: width 0.5s ease; background: #9CA3AF; }
.rrv__bar-fill--busy { background: linear-gradient(90deg, #60A5FA, #2563EB); }
.rrv__bar-fill--good { background: linear-gradient(90deg, #4ADE80, #16A34A); }
.rrv__bar-fill--bad  { background: linear-gradient(90deg, #F87171, #DC2626); }
.rrv__bar-pct {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 0.72rem; font-weight: 700; color: var(--theme-fg-primary, #111827);
}

/* ── Notes ───────────────────────────────────────────────────────────────────────────────── */
.rrv__note {
  display: flex; gap: 0.5rem; align-items: flex-start; margin: 0;
  padding: 0.6rem 0.75rem; border-radius: 8px; font-size: 0.82rem; line-height: 1.5;
  border: 1px solid var(--theme-border, #E5E7EB); color: var(--theme-fg-secondary, #374151);
}
.rrv__note--warn { border-color: #FCD34D; background: var(--color-warning-surface, #FFFBEB); color: var(--color-warning-text, #92400E); }
.rrv__note--bad  { border-color: #FCA5A5; background: #FEF2F2; color: #B91C1C; }
.rrv__skipped { margin: 0.35rem 0 0; padding-left: 1.1rem; }

/* ── Counters ────────────────────────────────────────────────────────────────────────────── */
.rrv__counters { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.5rem; }
.rrv__counter {
  border: 1px solid var(--theme-border, #E5E7EB); border-radius: 9px; padding: 0.55rem 0.7rem;
  background: var(--theme-bg-elevated, #fff); display: flex; flex-direction: column; gap: 0.1rem;
}
.rrv__counter-value {
  font-size: 1.15rem; font-weight: 700; color: var(--theme-fg-primary, #111827);
  display: inline-flex; align-items: center; gap: 0.35rem;
}
.rrv__counter-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--theme-fg-muted, #6B7280); }
.rrv__counter-live {
  width: 6px; height: 6px; border-radius: 50%; background: #2563EB;
  animation: rrv-pulse 1.4s ease-in-out infinite;
}
@keyframes rrv-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
.rrv__spin { animation: rrv-rotate 1s linear infinite; }
@keyframes rrv-rotate { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .rrv__spin, .rrv__counter-live { animation: none; }
  .rrv__bar-fill { transition: none; }
}

/* ── Tabs ────────────────────────────────────────────────────────────────────────────────── */
.rrv__tabs {
  display: flex; gap: 0.25rem; flex-wrap: wrap;
  border-bottom: 1px solid var(--theme-border, #E5E7EB); padding-bottom: 0.35rem;
}
.rrv__tab {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.4rem 0.7rem; border-radius: 7px 7px 0 0; cursor: pointer;
  font-size: 0.82rem; font-weight: 550; border: 1px solid transparent; background: none;
  color: var(--theme-fg-secondary, #374151);
}
.rrv__tab:hover { background: color-mix(in srgb, var(--theme-fg-muted, #6B7280) 8%, transparent); }
.rrv__tab:focus-visible { outline: 2px solid #2563EB; outline-offset: -2px; }
.rrv__tab--on {
  background: var(--theme-bg-elevated, #fff); border-color: var(--theme-border, #E5E7EB);
  border-bottom-color: transparent; color: var(--theme-fg-primary, #111827); font-weight: 650;
}
.rrv__tab-count {
  font-size: 0.7rem; font-weight: 700; padding: 0.05rem 0.35rem; border-radius: 999px;
  background: color-mix(in srgb, var(--theme-fg-muted, #6B7280) 15%, transparent);
}
.rrv__panel { min-height: 6rem; }
.rrv__empty { margin: 0; padding: 1.2rem 0.5rem; font-size: 0.85rem; color: var(--theme-fg-muted, #6B7280); text-align: center; }

/* ── Documents ───────────────────────────────────────────────────────────────────────────── */
.rrv__docs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.2rem; }
.rrv__doc {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.42rem 0.5rem; border-radius: 6px;
  font-size: 0.83rem; color: var(--theme-fg-primary, #111827);
}
.rrv__doc:nth-child(odd) { background: color-mix(in srgb, var(--theme-fg-muted, #6B7280) 5%, transparent); }
.rrv__doc-icon { flex: 0 0 auto; color: var(--theme-fg-muted, #6B7280); }
.rrv__doc-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rrv__doc-rec { color: var(--theme-fg-muted, #6B7280); }
.rrv__doc-meta { flex: 0 0 auto; display: inline-flex; gap: 0.4rem; font-size: 0.74rem; color: var(--theme-fg-muted, #6B7280); }
.rrv__doc-seen { border: 1px solid var(--theme-border, #D1D5DB); border-radius: 999px; padding: 0 0.35rem; }
.rrv__docs--prior { opacity: 0.75; margin-top: 0.4rem; }
.rrv__prior { margin-top: 0.6rem; }

/* ── Log ─────────────────────────────────────────────────────────────────────────────────── */
.rrv__log {
  list-style: none; margin: 0; padding: 0; max-height: 22rem; overflow-y: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.75rem;
}
.rrv__log-row { display: flex; gap: 0.5rem; padding: 0.25rem 0.4rem; align-items: baseline; }
.rrv__log-row--fail { color: #B91C1C; }
.rrv__log-row--warn { color: #92400E; }
.rrv__log-status { flex: 0 0 1rem; }
.rrv__log-layer { flex: 0 0 7rem; font-weight: 650; overflow: hidden; text-overflow: ellipsis; }
.rrv__log-text { flex: 1 1 auto; min-width: 0; word-break: break-word; }
.rrv__log-count { flex: 0 0 auto; opacity: 0.7; }

/* ── Modal ───────────────────────────────────────────────────────────────────────────────── */
.rrv__modal {
  position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.5); padding: 1rem;
}
.rrv__modal-card {
  background: var(--theme-bg-elevated, #fff); border-radius: 12px; padding: 1.25rem 1.5rem;
  max-width: 30rem; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}
.rrv__modal-title { margin: 0 0 0.6rem; font-size: 1rem; color: var(--theme-fg-primary, #111827); }
.rrv__modal-text { margin: 0 0 1rem; font-size: 0.85rem; line-height: 1.55; color: var(--theme-fg-secondary, #374151); }
.rrv__modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; flex-wrap: wrap; }

.rrv__footer { display: flex; justify-content: flex-end; }

/* ── 390px ───────────────────────────────────────────────────────────────────────────────── */
@media (max-width: 640px) {
  .rrv__counters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .rrv__log-layer { flex-basis: 4.5rem; }
  .rrv__head-actions { width: 100%; }
}
`}</style>
  );
}
