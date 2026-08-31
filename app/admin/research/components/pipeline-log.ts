// app/admin/research/components/pipeline-log.ts — D2.
//
// The pure parts of `PipelineProgressPanel` (1,521 lines): when a run is finished, and how its log
// renders as text for the clipboard.
//
// ── "DONE" WAS DEFINED TWICE, DIFFERENTLY ───────────────────────────────────────────────────────
//
// `PipelineProgressPanel` had an allowlist:
//
//     status === 'success' || status === 'partial' || status === 'failed' || status === 'complete'
//
// and `ResearchRunPanel`, polling the same endpoint, had a denylist:
//
//     normalizedStatus !== 'running' && normalizedStatus !== 'starting'
//
// Today they agree, because the worker only ever returns `running`, `complete`, `partial` or
// `failed` (`worker/src/index.ts:1837`) and the app maps `complete` → `success`. They agree by
// **coincidence**, and they fail in opposite directions the moment that set changes:
//
//   · a new non-terminal status — `queued`, `retrying` — is DONE to the denylist and running to the
//     allowlist, so one panel declares a run finished while it is still waiting to start;
//   · a new terminal status — `cancelled`, `timeout` — is done to the denylist and STILL RUNNING to
//     the allowlist, so the progress panel spins forever on a run that has stopped.
//
// One definition, in one place, listing both sets explicitly. A status in neither is treated as
// still running — the safe direction, because claiming a run is finished when it is not is the
// error that loses work.

/** Statuses that mean the run has stopped, whatever the outcome. */
export const TERMINAL_STATUSES = ['success', 'complete', 'partial', 'failed', 'cancelled'] as const;

/** Statuses that mean the run has not stopped. Listed so a NEW status is visible as neither. */
export const ACTIVE_STATUSES = ['running', 'starting', 'queued', 'retrying'] as const;

export function isDoneStatus(status: string | null | undefined): boolean {
  return status != null && (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function statusIcon(status: string | null | undefined): string {
  switch (status) {
    case 'success': return '✓';
    case 'fail':    return '✕';
    case 'warn':    return '⚠';
    case 'partial': return '~';
    default:        return '−';
  }
}

/** A timestamp as HH:MM:SS, or '' when it is absent or unparseable. */
export function formatTimestamp(ts: string | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  // `toLocaleTimeString` on an Invalid Date returns "Invalid Date" rather than throwing, so the
  // try/catch this replaced never fired and the string went straight into the log.
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour12: false });
}

export interface LogEntryLike {
  layer: string;
  source: string;
  method: string;
  status: string;
  details?: string | null;
  error?: string | null;
  input?: string | null;
  steps?: string[] | null;
  dataPointsFound: number;
  duration_ms: number;
  timestamp?: string;
}

/** `info`/`warn`/`error` entries carry a message rather than a layer→method call. */
export function isMessageEntry(e: LogEntryLike): boolean {
  return e.source === 'info' || e.source === 'warn' || e.source === 'error';
}

/** Every basic log entry as plain text, for the clipboard. */
export function formatLogAsText(log: LogEntryLike[]): string {
  return log.map((e) => {
    const icon = statusIcon(e.status);
    const pts = e.dataPointsFound > 0 ? ` [${e.dataPointsFound} pts]` : '';
    const dur = e.duration_ms > 0 ? ` (${(e.duration_ms / 1000).toFixed(2)}s)` : '';
    const ts = e.timestamp ? `[${formatTimestamp(e.timestamp)}] ` : '';
    const isMsg = isMessageEntry(e);
    const line = isMsg
      ? `${icon} ${ts}${e.layer}: ${e.details ?? e.error ?? e.method}${pts}`
      : `${icon} ${ts}${e.layer} | ${e.source} | ${e.method}${pts}${dur}`;
    const extras: string[] = [];
    if (!isMsg && e.details) extras.push(`Details: ${e.details}`);
    if (e.error && !isMsg) extras.push(`Error: ${e.error}`);
    return extras.length ? `${line}\n    ${extras.join('\n    ')}` : line;
  }).join('\n');
}

/** Every log entry with its steps and inputs — the diagnostic copy. */
export function formatDetailedLogAsText(log: LogEntryLike[]): string {
  return log.map((e, idx) => {
    const icon = statusIcon(e.status);
    const pts = e.dataPointsFound > 0 ? ` [${e.dataPointsFound} pts]` : '';
    const dur = e.duration_ms > 0 ? ` (${(e.duration_ms / 1000).toFixed(2)}s)` : '';
    const ts = e.timestamp ? ` @ ${e.timestamp}` : '';
    const isMsg = isMessageEntry(e);
    let out = `--- Entry ${idx + 1} ---\n`;
    out += `${icon} [${e.layer}] ${e.source} → ${e.method}${pts}${dur}${ts}\n`;
    if (e.input) out += `  Input:   ${e.input}\n`;
    if (isMsg) out += `  Message: ${e.details ?? e.error ?? ''}\n`;
    else if (e.details) out += `  Details: ${e.details}\n`;
    if (e.error && !isMsg) out += `  Error:   ${e.error}\n`;
    if (e.steps?.length) {
      out += `  Steps (${e.steps.length}):\n`;
      out += e.steps.map((s) => `    ↳ ${s}`).join('\n') + '\n';
    }
    return out;
  }).join('\n');
}
