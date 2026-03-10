'use client';

// PipelineProgressPanel.tsx
// Animated real-time progress panel for the STARR RECON pipeline.
// Driven by `pipelineResult` from the polling interval — no fake timers.
// Stage is inferred from the "Stage N:" prefix in the `message` field.

import { useMemo, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BoundaryInfo {
  type?: string;
  callCount?: number;
  confidence?: number;
  verified?: boolean;
}

interface PipelineResultSummary {
  propertyId?: string;
  ownerName?: string;
  legalDescription?: string;
  acreage?: string | number;
  documentCount?: number;
  duration_ms?: number;
  boundary?: BoundaryInfo | null;
}

interface PipelineDocument {
  ref?: { documentType?: string; instrumentNumber?: string | null; source?: string };
  hasText?: boolean;
  hasImage?: boolean;
  hasOcr?: boolean;
  extractedData?: { type?: string; confidence?: number } | null;
}

interface PipelineLogEntry {
  layer: string;
  source: string;
  method: string;
  status: 'success' | 'fail' | 'skip' | 'partial';
  input?: string;
  details?: string;
  error?: string;
  dataPointsFound: number;
  duration_ms: number;
  steps?: string[];
}

export interface PipelineProgressProps {
  status:      string | null;         // 'starting'|'running'|'success'|'partial'|'failed'|null
  message?:    string;                // Latest "Stage N: …" message from updateStatus
  result?:     PipelineResultSummary | null;
  documents?:  PipelineDocument[];
  log?:        PipelineLogEntry[];
}

// ── Stage definitions ─────────────────────────────────────────────────────────

const STAGES = [
  { num: 0, id: 'address',   label: 'Address',    detail: 'Normalizing address & detecting county' },
  { num: 1, id: 'property',  label: 'Property',   detail: 'Searching county appraisal district' },
  { num: 2, id: 'documents', label: 'Documents',  detail: 'Retrieving deed & plat records' },
  { num: 3, id: 'ai',        label: 'AI Extract', detail: 'Extracting boundary data with Claude Vision' },
  { num: 4, id: 'validate',  label: 'Validate',   detail: 'Geometric validation & quality scoring' },
] as const;

type StageNum = 0 | 1 | 2 | 3 | 4;
type StageState = 'pending' | 'active' | 'done' | 'error';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Infer the active stage number from the latest status message. */
function inferActiveStage(message: string | undefined, status: string | null): StageNum | null {
  if (!status || status === 'not_found') return null;
  if (status === 'starting') return 0;
  if (status === 'success' || status === 'partial') return null; // all done
  if (status === 'failed') return null;

  if (!message) return 0;

  // "Stage 3.5" counts as Stage 3
  const m = message.match(/Stage\s+(\d+)/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 0 && n <= 4) return n as StageNum;
  }
  return 0;
}

/** Determine per-stage state from log entries + active stage. */
function computeStageStates(
  log: PipelineLogEntry[] | undefined,
  activeStage: StageNum | null,
  status: string | null,
): Record<StageNum, StageState> {
  const layerToStage: Record<string, StageNum> = {
    Stage0: 0, stage0: 0,
    Stage1: 1, stage1: 1,
    Stage2: 2, stage2: 2, Stage2A: 2, stage2a: 2, 'Stage2.5': 2,
    Stage3: 3, stage3: 3, 'Stage3.5': 3,
    Stage4: 4, stage4: 4,
  };

  const hasData = new Set<StageNum>();
  if (log) {
    for (const entry of log) {
      const n = layerToStage[entry.layer];
      if (n !== undefined && entry.status !== 'fail') hasData.add(n);
    }
  }

  const states = {} as Record<StageNum, StageState>;
  for (let i = 0; i <= 4; i++) {
    const n = i as StageNum;
    if (status === 'failed' && activeStage === n) {
      states[n] = 'error';
    } else if (hasData.has(n) || (status === 'success' || status === 'partial')) {
      states[n] = 'done';
    } else if (activeStage === n) {
      states[n] = 'active';
    } else {
      states[n] = 'pending';
    }
  }
  return states;
}

/** Pull the best detail message for a stage from the log. */
function getStageDetail(stageNum: StageNum, log: PipelineLogEntry[] | undefined): string | null {
  if (!log) return null;
  const prefix = ['Stage0', 'Stage1', 'Stage2', 'Stage3', 'Stage4'][stageNum];
  // Find last successful info entry for this stage
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.layer.startsWith(prefix) && e.status === 'success' && e.details) {
      return e.details;
    }
  }
  return null;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function StageIcon({ state }: { state: StageState }) {
  if (state === 'done')    return <span className="ppanel__stage-icon ppanel__stage-icon--done">✓</span>;
  if (state === 'active')  return <span className="ppanel__stage-icon ppanel__stage-icon--active"><Spinner /></span>;
  if (state === 'error')   return <span className="ppanel__stage-icon ppanel__stage-icon--error">✕</span>;
  return <span className="ppanel__stage-icon ppanel__stage-icon--pending">○</span>;
}

function Spinner() {
  return (
    <span className="ppanel__spinner" aria-label="loading">
      <span />
    </span>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function StageRow({
  stage,
  state,
  detail,
  isLast,
}: {
  stage: typeof STAGES[number];
  state: StageState;
  detail: string | null;
  isLast: boolean;
}) {
  return (
    <div className={`ppanel__stage ppanel__stage--${state}`}>
      <div className="ppanel__stage-track">
        <StageIcon state={state} />
        {!isLast && <div className={`ppanel__stage-line ppanel__stage-line--${state === 'done' ? 'done' : 'pending'}`} />}
      </div>
      <div className="ppanel__stage-body">
        <div className="ppanel__stage-label">{stage.label}</div>
        <div className="ppanel__stage-detail">
          {state === 'active'  ? stage.detail : null}
          {state === 'done'    ? (detail ?? stage.detail) : null}
          {state === 'error'   ? 'Failed — see log' : null}
          {state === 'pending' ? '' : null}
        </div>
      </div>
    </div>
  );
}

function ResultCard({ result }: { result: PipelineResultSummary }) {
  const confidence = result.boundary?.confidence;
  const confPct    = confidence != null ? Math.round(confidence * 100) : null;

  return (
    <div className="ppanel__result-card">
      {result.ownerName && (
        <div className="ppanel__result-row">
          <span className="ppanel__result-label">Owner</span>
          <span className="ppanel__result-value ppanel__result-value--owner">{result.ownerName}</span>
        </div>
      )}
      {result.propertyId && (
        <div className="ppanel__result-row">
          <span className="ppanel__result-label">Property ID</span>
          <span className="ppanel__result-value">{result.propertyId}</span>
        </div>
      )}
      {result.acreage && (
        <div className="ppanel__result-row">
          <span className="ppanel__result-label">Acreage</span>
          <span className="ppanel__result-value">{result.acreage} ac</span>
        </div>
      )}
      {result.documentCount != null && result.documentCount > 0 && (
        <div className="ppanel__result-row">
          <span className="ppanel__result-label">Documents</span>
          <span className="ppanel__result-value">{result.documentCount}</span>
        </div>
      )}
      {result.boundary && (
        <div className="ppanel__result-row">
          <span className="ppanel__result-label">Boundary</span>
          <span className="ppanel__result-value">
            {result.boundary.type}
            {result.boundary.callCount != null && ` · ${result.boundary.callCount} calls`}
            {confPct != null && (
              <span className={`ppanel__confidence ppanel__confidence--${confPct >= 80 ? 'high' : confPct >= 50 ? 'mid' : 'low'}`}>
                {confPct}%
              </span>
            )}
            {result.boundary.verified && <span className="ppanel__verified">✓</span>}
          </span>
        </div>
      )}
      {result.legalDescription && (
        <div className="ppanel__result-row ppanel__result-row--legal">
          <span className="ppanel__result-label">Legal</span>
          <span className="ppanel__result-value ppanel__result-value--legal">
            {result.legalDescription.length > 160
              ? result.legalDescription.slice(0, 160) + '…'
              : result.legalDescription}
          </span>
        </div>
      )}
      {result.duration_ms != null && (
        <div className="ppanel__result-row ppanel__result-row--meta">
          <span className="ppanel__result-label">Duration</span>
          <span className="ppanel__result-value ppanel__result-value--meta">
            {(result.duration_ms / 1000).toFixed(1)}s
          </span>
        </div>
      )}
    </div>
  );
}

function DocumentPill({ doc, idx }: { doc: PipelineDocument; idx: number }) {
  const type = doc.ref?.documentType ?? `Document ${idx + 1}`;
  const instr = doc.ref?.instrumentNumber;
  const tags: string[] = [];
  if (doc.hasText)  tags.push('text');
  if (doc.hasImage) tags.push('image');
  if (doc.hasOcr)   tags.push('ocr');

  return (
    <div className="ppanel__doc-pill">
      <span className="ppanel__doc-type">{type}</span>
      {instr && <span className="ppanel__doc-instr">#{instr}</span>}
      {tags.map(t => <span key={t} className={`ppanel__doc-tag ppanel__doc-tag--${t}`}>{t}</span>)}
      {doc.extractedData && (
        <span className="ppanel__doc-tag ppanel__doc-tag--extracted">
          {doc.extractedData.type}
          {doc.extractedData.confidence != null && ` ${Math.round(doc.extractedData.confidence * 100)}%`}
        </span>
      )}
    </div>
  );
}

function LogEntry({ entry }: { entry: PipelineLogEntry }) {
  const [open, setOpen] = useState(false);
  const hasExtra = !!(entry.details || entry.error || entry.input || (entry.steps?.length));

  return (
    <div className={`ppanel__log-entry ppanel__log-entry--${entry.status}`}>
      <div
        className="ppanel__log-row"
        onClick={() => hasExtra && setOpen(o => !o)}
        style={{ cursor: hasExtra ? 'pointer' : 'default' }}
      >
        <span className={`ppanel__log-status ppanel__log-status--${entry.status}`}>
          {entry.status === 'success' ? '✓' : entry.status === 'fail' ? '✕' : entry.status === 'skip' ? '−' : '~'}
        </span>
        <span className="ppanel__log-layer">{entry.layer}</span>
        <span className="ppanel__log-source">{entry.source}</span>
        <span className="ppanel__log-method">{entry.method}</span>
        {entry.dataPointsFound > 0 && (
          <span className="ppanel__log-points">{entry.dataPointsFound} pt{entry.dataPointsFound !== 1 ? 's' : ''}</span>
        )}
        {entry.duration_ms > 0 && (
          <span className="ppanel__log-dur">{(entry.duration_ms / 1000).toFixed(2)}s</span>
        )}
        {hasExtra && (
          <span className="ppanel__log-expand">{open ? '▲' : '▼'}</span>
        )}
      </div>
      {open && hasExtra && (
        <div className="ppanel__log-detail">
          {entry.input   && <div className="ppanel__log-detail-row"><b>Input:</b> <code>{entry.input}</code></div>}
          {entry.details && <div className="ppanel__log-detail-row"><b>Details:</b> {entry.details}</div>}
          {entry.error   && <div className="ppanel__log-detail-row ppanel__log-detail-row--error"><b>Error:</b> {entry.error}</div>}
          {entry.steps?.map((s, i) => (
            <div key={i} className="ppanel__log-detail-row ppanel__log-detail-row--step">↳ {s}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function PipelineProgressPanel({
  status,
  message,
  result,
  documents,
  log,
}: PipelineProgressProps) {
  const [showLog, setShowLog] = useState(false);

  const activeStage = useMemo(() => inferActiveStage(message, status), [message, status]);
  const stageStates = useMemo(() => computeStageStates(log, activeStage, status), [log, activeStage, status]);

  const isRunning  = status === 'running' || status === 'starting';
  const isSuccess  = status === 'success' || status === 'partial';
  const isFailed   = status === 'failed';
  const isPartial  = status === 'partial';

  // Strip "Stage N: " prefix for cleaner header display
  const cleanMessage = message?.replace(/^Stage\s*\d+(?:\.\d+)?:\s*/i, '') ?? null;

  return (
    <div className={`ppanel ppanel--${status ?? 'idle'}`}>

      {/* ── Header bar ──────────────────────────────────────────────── */}
      <div className="ppanel__header">
        <div className="ppanel__header-left">
          {isRunning && <span className="ppanel__header-spinner"><Spinner /></span>}
          {isSuccess  && <span className="ppanel__header-icon ppanel__header-icon--success">✓</span>}
          {isFailed   && <span className="ppanel__header-icon ppanel__header-icon--error">✕</span>}
          <span className="ppanel__header-title">
            {isRunning  && (cleanMessage ?? 'Research running…')}
            {isSuccess  && (isPartial ? 'Research complete — partial results' : 'Research complete')}
            {isFailed   && 'Research failed'}
            {!status    && 'Starting research…'}
          </span>
        </div>
        {result?.duration_ms && (
          <span className="ppanel__header-dur">{(result.duration_ms / 1000).toFixed(1)}s</span>
        )}
      </div>

      {/* ── Stage track ─────────────────────────────────────────────── */}
      <div className="ppanel__stages">
        {STAGES.map((stage, i) => (
          <StageRow
            key={stage.id}
            stage={stage}
            state={stageStates[stage.num]}
            detail={getStageDetail(stage.num, log)}
            isLast={i === STAGES.length - 1}
          />
        ))}
      </div>

      {/* ── Result card (visible when done) ─────────────────────────── */}
      {isSuccess && result && (
        <div className="ppanel__section">
          <ResultCard result={result} />
        </div>
      )}

      {/* ── Document pills ───────────────────────────────────────────── */}
      {documents && documents.length > 0 && (
        <div className="ppanel__section ppanel__section--docs">
          <div className="ppanel__section-title">
            Documents captured
            <span className="ppanel__section-count">{documents.length}</span>
          </div>
          <div className="ppanel__docs">
            {documents.map((doc, i) => (
              <DocumentPill key={i} doc={doc} idx={i} />
            ))}
          </div>
        </div>
      )}

      {/* ── Audit log accordion ──────────────────────────────────────── */}
      {log && log.length > 0 && (
        <div className="ppanel__section ppanel__section--log">
          <button
            className="ppanel__log-toggle"
            onClick={() => setShowLog(v => !v)}
            type="button"
          >
            <span className="ppanel__log-toggle-icon">{showLog ? '▲' : '▼'}</span>
            Audit log
            <span className="ppanel__section-count">{log.length}</span>
          </button>
          {showLog && (
            <div className="ppanel__log">
              {log.map((entry, i) => (
                <LogEntry key={i} entry={entry} />
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
// Scoped CSS-in-JS via a <style> tag so this component is self-contained
// and works without a separate CSS import.

export function PipelineProgressStyles() {
  return (
    <style>{`
/* ── Panel shell ─────────────────────────────────────────── */
.ppanel {
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
  font-size: 0.82rem;
  line-height: 1.4;
  box-shadow: 0 2px 8px rgba(0,0,0,0.07);
  margin: 0.75rem 0;
}
.ppanel--running { border-color: #3b82f6; }
.ppanel--success { border-color: #10b981; }
.ppanel--partial { border-color: #f59e0b; }
.ppanel--failed  { border-color: #ef4444; }

/* ── Header ──────────────────────────────────────────────── */
.ppanel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.9rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  gap: 0.5rem;
}
.ppanel--running .ppanel__header { background: #eff6ff; border-color: #bfdbfe; }
.ppanel--success .ppanel__header { background: #ecfdf5; border-color: #a7f3d0; }
.ppanel--partial .ppanel__header { background: #fffbeb; border-color: #fde68a; }
.ppanel--failed  .ppanel__header { background: #fef2f2; border-color: #fecaca; }

.ppanel__header-left {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex: 1;
  min-width: 0;
}
.ppanel__header-title {
  font-weight: 600;
  font-size: 0.84rem;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ppanel__header-dur {
  font-size: 0.75rem;
  color: #64748b;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ppanel__header-icon--success { color: #10b981; font-size: 1rem; font-weight: 700; }
.ppanel__header-icon--error   { color: #ef4444; font-size: 1rem; font-weight: 700; }
.ppanel__header-spinner       { display: flex; align-items: center; }

/* ── Spinner ─────────────────────────────────────────────── */
.ppanel__spinner {
  display: inline-flex;
  width: 14px;
  height: 14px;
  position: relative;
  flex-shrink: 0;
}
.ppanel__spinner span {
  position: absolute;
  inset: 0;
  border: 2px solid #dbeafe;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: ppanel-spin 0.7s linear infinite;
}
@keyframes ppanel-spin { to { transform: rotate(360deg); } }

/* ── Stage track ─────────────────────────────────────────── */
.ppanel__stages {
  padding: 0.65rem 0.9rem 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.ppanel__stage {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  min-height: 2rem;
}
.ppanel__stage-track {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 18px;
}
.ppanel__stage-line {
  width: 2px;
  flex: 1;
  min-height: 10px;
  border-radius: 1px;
  margin: 2px 0;
}
.ppanel__stage-line--done    { background: #10b981; }
.ppanel__stage-line--pending { background: #e2e8f0; }

.ppanel__stage-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 0.65rem;
  font-weight: 700;
  flex-shrink: 0;
}
.ppanel__stage-icon--done    { background: #10b981; color: #fff; }
.ppanel__stage-icon--active  { background: #3b82f6; color: #fff; }
.ppanel__stage-icon--error   { background: #ef4444; color: #fff; }
.ppanel__stage-icon--pending { background: #e2e8f0; color: #94a3b8; border: 1.5px solid #cbd5e1; font-size: 0.55rem; }
.ppanel__stage-icon--active .ppanel__spinner span { border-color: rgba(255,255,255,0.3); border-top-color: #fff; }

.ppanel__stage-body {
  padding-bottom: 0.4rem;
  flex: 1;
  min-width: 0;
}
.ppanel__stage-label {
  font-weight: 600;
  color: #334155;
  font-size: 0.8rem;
  line-height: 1.2;
}
.ppanel__stage--active .ppanel__stage-label { color: #1d4ed8; }
.ppanel__stage--done   .ppanel__stage-label { color: #065f46; }
.ppanel__stage--error  .ppanel__stage-label { color: #b91c1c; }
.ppanel__stage--pending .ppanel__stage-label { color: #94a3b8; }

.ppanel__stage-detail {
  font-size: 0.73rem;
  color: #64748b;
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ppanel__stage--active .ppanel__stage-detail { color: #3b82f6; animation: ppanel-pulse 1.8s ease-in-out infinite; }
@keyframes ppanel-pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }

/* ── Section ─────────────────────────────────────────────── */
.ppanel__section {
  padding: 0.55rem 0.9rem;
  border-top: 1px solid #f1f5f9;
}
.ppanel__section-title {
  font-weight: 600;
  font-size: 0.78rem;
  color: #475569;
  margin-bottom: 0.4rem;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.ppanel__section-count {
  background: #e2e8f0;
  color: #475569;
  border-radius: 9999px;
  padding: 0 0.4rem;
  font-size: 0.7rem;
  font-weight: 700;
}

/* ── Result card ─────────────────────────────────────────── */
.ppanel__result-card {
  background: #f8fafc;
  border-radius: 6px;
  padding: 0.5rem 0.65rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.ppanel__result-row {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  font-size: 0.79rem;
}
.ppanel__result-row--meta   { margin-top: 0.15rem; }
.ppanel__result-row--legal  { align-items: flex-start; }
.ppanel__result-label {
  color: #64748b;
  font-weight: 600;
  flex-shrink: 0;
  min-width: 5.5rem;
  font-size: 0.73rem;
}
.ppanel__result-value        { color: #1e293b; }
.ppanel__result-value--owner { font-weight: 700; color: #0f172a; }
.ppanel__result-value--legal { color: #475569; font-size: 0.73rem; line-height: 1.4; }
.ppanel__result-value--meta  { color: #94a3b8; font-size: 0.72rem; }

.ppanel__confidence {
  display: inline-block;
  margin-left: 0.35rem;
  padding: 0.05rem 0.35rem;
  border-radius: 9999px;
  font-size: 0.68rem;
  font-weight: 700;
}
.ppanel__confidence--high { background: #d1fae5; color: #065f46; }
.ppanel__confidence--mid  { background: #fef9c3; color: #713f12; }
.ppanel__confidence--low  { background: #fee2e2; color: #991b1b; }

.ppanel__verified {
  color: #10b981;
  margin-left: 0.3rem;
  font-weight: 700;
}

/* ── Documents ───────────────────────────────────────────── */
.ppanel__docs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.ppanel__doc-pill {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 0.2rem 0.45rem;
  font-size: 0.72rem;
}
.ppanel__doc-type  { color: #334155; font-weight: 600; }
.ppanel__doc-instr { color: #94a3b8; font-size: 0.68rem; }
.ppanel__doc-tag {
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.ppanel__doc-tag--text      { background: #dbeafe; color: #1e40af; }
.ppanel__doc-tag--image     { background: #dcfce7; color: #166534; }
.ppanel__doc-tag--ocr       { background: #f0fdf4; color: #166534; }
.ppanel__doc-tag--extracted { background: #fef9c3; color: #713f12; }

/* ── Audit log ───────────────────────────────────────────── */
.ppanel__log-toggle {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 600;
  color: #475569;
  width: 100%;
  text-align: left;
}
.ppanel__log-toggle:hover { color: #1e293b; }
.ppanel__log-toggle-icon { font-size: 0.65rem; color: #94a3b8; }

.ppanel__log {
  margin-top: 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #f8fafc;
}
.ppanel__log-entry {
  border-bottom: 1px solid #f1f5f9;
  font-size: 0.72rem;
}
.ppanel__log-entry:last-child { border-bottom: none; }

.ppanel__log-row {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.22rem 0.45rem;
  flex-wrap: nowrap;
  overflow: hidden;
}
.ppanel__log-entry--fail  .ppanel__log-row { background: #fff5f5; }
.ppanel__log-entry--skip  .ppanel__log-row { opacity: 0.55; }

.ppanel__log-status {
  flex-shrink: 0;
  font-weight: 700;
  font-size: 0.7rem;
  width: 12px;
  text-align: center;
}
.ppanel__log-status--success { color: #10b981; }
.ppanel__log-status--fail    { color: #ef4444; }
.ppanel__log-status--skip    { color: #94a3b8; }
.ppanel__log-status--partial { color: #f59e0b; }

.ppanel__log-layer  { color: #6366f1; font-weight: 600; flex-shrink: 0; min-width: 4rem; }
.ppanel__log-source { color: #0369a1; flex-shrink: 0; max-width: 6rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ppanel__log-method { color: #475569; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ppanel__log-points { color: #059669; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.ppanel__log-dur    { color: #94a3b8; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.ppanel__log-expand { color: #94a3b8; flex-shrink: 0; font-size: 0.6rem; margin-left: auto; }

.ppanel__log-detail {
  padding: 0.2rem 0.6rem 0.3rem 1.8rem;
  background: #f0f9ff;
  border-top: 1px solid #e0f2fe;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.ppanel__log-detail-row         { color: #334155; }
.ppanel__log-detail-row--error  { color: #b91c1c; }
.ppanel__log-detail-row--step   { color: #64748b; }
.ppanel__log-detail code {
  background: #e2e8f0;
  padding: 0.05rem 0.25rem;
  border-radius: 3px;
  font-size: 0.68rem;
  word-break: break-all;
}
    `}</style>
  );
}
