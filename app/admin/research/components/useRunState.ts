'use client';

// app/admin/research/components/useRunState.ts — the ONE poller (plan D1–D4).
//
// ── WHAT THIS REPLACES ──────────────────────────────────────────────────────────────────────────
//
// Four components on the Research & Analysis screen each fetched their own endpoint on their own
// interval and derived their own answer:
//
//   ResearchRunPanel   → GET  …/pipeline        every 3s   → status, stage, its own percentage
//   RunConsoleBar      → GET  …/run-console     every 10s  → status, cost, elapsed-vs-budget
//   RunDiffPanel       → GET  …/run-diff        once       → what changed since last run
//   ReportCardPanel    → GET  …/report-card     once       → facts, conflicts, sources
//
// They contradicted each other on screen, at the same instant, about the same run. See the header
// of `lib/research/run-state.ts` for the capture.
//
// Now one hook owns the polling and `buildRunState` derives one object from it. Components render;
// they do not decide.
//
// ── THE THREE BUGS THIS FIXES BY CONSTRUCTION ───────────────────────────────────────────────────
//
//   D3  The POST already returned `runId`, and `ResearchRunPanel` threw it away — the response was
//       read only to consume the body (`await res.json().catch(() => ({}))`, result discarded)
//       while the route's own comment claimed "the panel keeps it and ignores any status payload
//       naming a different run". It never did. Now it does, and a payload about run 1 can no longer
//       stop run 2's poll.
//
//   D2  The percentage comes off the wire. The regex inference stays reachable ONLY as a fallback
//       for a worker that has not been redeployed.
//
//   D4  The clock reads the run's real `startedAt`, so reopening the page mid-run shows the true
//       elapsed time instead of restarting from 00:00.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildRunState, isPayloadForRun, isActive, isStopped, lifecycleOf,
  type RunState, type RunLifecycle, type PollPayload, type ConsolePayload,
} from '@/lib/research/run-state';
import { inferMicroStage, progressPercent } from './run-progress';
import type { PipelineLogEntry } from './PipelineProgressPanel';

/** How often to ask while a run is going. */
const POLL_MS = 3_000;
/** The console changes far more slowly than the poll; asking every 3s is load nobody needs. */
const CONSOLE_EVERY_N_POLLS = 4;
/** Documents arrive in bursts; 8s is frequent enough to feel live without hammering Supabase. */
const DOC_POLL_MS = 8_000;

export interface RunDocument {
  id: string;
  document_label?: string | null;
  document_type?: string | null;
  recording_info?: string | null;
  page_count?: number | null;
  processing_status?: string | null;
  storage_path?: string | null;
  public_url?: string | null;
  source_type?: string | null;
  created_at?: string | null;
  superseded_at?: string | null;
  duplicate_of?: string | null;
  /** Why it was merged. Rendered next to the row — a merge with no stated reason cannot be
   *  argued with, and a reader who cannot argue with it must trust the whole library blindly. */
  duplicate_reason?: string | null;
  research_run_id?: string | null;
  run_seen_count?: number | null;
}

/** What a run can be given when it is started. Mirrors `worker/src/research/run-settings.ts`. */
export interface RunSettingsInput {
  allowPaidDocuments?: boolean;
  maxResearchTimeMinutes?: number;
  maxCostUsd?: number;
  mode?: 'free' | 'paid';
  refreshImagery?: boolean;
}

export interface StartRunInput {
  address?: string;
  county?: string;
  parcelId?: string;
  ownerName?: string;
  operatorNotes?: string;
  userFiles?: unknown[];
  settings?: RunSettingsInput;
  trigger?: 'initial' | 'rerun_same' | 'rerun_edited';
}

export interface UseRunStateResult {
  state: RunState;
  logs: PipelineLogEntry[];
  documents: RunDocument[];
  documentsLoading: boolean;
  /** Set when the worker was unreachable and the weaker in-app pipeline took over. */
  liteFallback: string | null;
  /** A start that never got off the ground — distinct from a run that started and failed. */
  startError: string | null;
  starting: boolean;
  cancelling: boolean;
  start: (input: StartRunInput) => Promise<void>;
  cancel: () => Promise<void>;
  /** Force an immediate refresh of everything. */
  refresh: () => void;
}

export function useRunState(projectId: string): UseRunStateResult {
  const [poll, setPoll] = useState<PollPayload | null>(null);
  const [cons, setCons] = useState<ConsolePayload | null>(null);
  const [logs, setLogs] = useState<PipelineLogEntry[]>([]);
  const [documents, setDocuments] = useState<RunDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [liteFallback, setLiteFallback] = useState<string | null>(null);
  /**
   * Why this run could not buy documents. Its own slot because it comes from the analyze status
   * route, which nothing else here polls — and which, until this was restored, nothing called at
   * all. See the fetcher below.
   */
  const [paidNotice, setPaidNotice] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  /** Ticks once a second so the elapsed clock advances between polls. */
  const [, setTick] = useState(0);

  /**
   * The run this hook is watching.
   *
   * A ref and not state on purpose: `pollStatus` must see the value the instant the POST returns,
   * and a state update would not be visible until the next render — which is at least one poll
   * later, i.e. exactly the window the guard exists to cover.
   */
  const expectedRunIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const docTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const consecutive404Ref = useRef(0);
  const docCountRef = useRef(0);

  const stopTimers = useCallback(() => {
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
    if (docTimerRef.current) { clearInterval(docTimerRef.current); docTimerRef.current = null; }
  }, []);

  // ── Fetchers ──────────────────────────────────────────────────────────────────────────────────

  const fetchConsole = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/research/${projectId}/run-console`);
      if (!res.ok) return;
      const data = await res.json() as { run?: ConsolePayload | null; usageFailed?: boolean };
      // `run: null` means no run has ever been recorded. Keeping the previous console would leave
      // run 1's cost on screen beside run 2, which is half of the contradiction this replaces.
      //
      // `usageFailed` rides beside `run` on the wire; folding it in here is what lets the view say
      // "this total is short" instead of showing a confident number it cannot stand behind.
      setCons(data.run ? { ...data.run, usageFailed: !!data.usageFailed } : null);
    } catch { /* the console is an enhancement; its absence must not blank the status */ }
  }, [projectId]);

  /**
   * Why paid documents were or were not bought.
   *
   * Deliberately NOT on the 3s poll: it changes only when the project's settings change or a
   * purchase is attempted, so it is fetched on mount and on refresh. Failure is silent because a
   * missing caveat must never be rendered as "nothing was skipped" — see the view, which treats
   * null as "no answer" rather than as an all-clear.
   */
  const fetchPaidNotice = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/research/${projectId}/analyze`);
      if (!res.ok) return;
      const data = await res.json() as { paidDocumentsNotice?: string | null };
      setPaidNotice(data.paidDocumentsNotice ?? null);
    } catch { /* a caveat we could not fetch is not an all-clear; leave it unset */ }
  }, [projectId]);

  const fetchDocuments = useCallback(async () => {
    setDocumentsLoading(true);
    try {
      const res = await fetch(`/api/admin/research/${projectId}/documents`);
      if (res.ok) {
        const data = await res.json() as { documents?: RunDocument[] };
        const docs = data.documents ?? [];
        setDocuments(docs);
        docCountRef.current = docs.length;
      }
    } catch { /* non-fatal */ }
    setDocumentsLoading(false);
  }, [projectId]);

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/research/${projectId}/pipeline`, {
        signal: AbortSignal.timeout(30_000),
      });

      if (res.status === 404) {
        consecutive404Ref.current++;
        if (consecutive404Ref.current >= 5) stopTimers();
        return;
      }
      consecutive404Ref.current = 0;
      if (!res.ok) return;

      const data = await res.json() as PollPayload & { log?: PipelineLogEntry[] };

      // ── D3: THE STALE-RUN GUARD ───────────────────────────────────────────────────────────────
      //
      // Dropped whole, not merged carefully. A terminal payload for the previous run is not stale
      // data about our run; it is an answer to a question nobody asked, and letting any part of it
      // through is what latched "Research Failed" over a working run.
      if (!isPayloadForRun(data.runId, expectedRunIdRef.current)) {
        console.debug(
          `[useRunState] ${projectId}: ignoring payload for run ${data.runId} — watching ${expectedRunIdRef.current}`,
        );
        return;
      }

      // Adopt the run id when the poll names one and we did not start the run ourselves — a page
      // reopened mid-run has no POST to learn it from, and without this the guard would never arm.
      if (data.runId && !expectedRunIdRef.current) expectedRunIdRef.current = data.runId;

      setPoll(data);
      if (data.log) setLogs(data.log);

      // The console carries cost and ceiling, which change slowly. Fetched on a slower cadence
      // rather than on its own timer, so the two can never be read from different moments.
      pollCountRef.current++;
      if (pollCountRef.current % CONSOLE_EVERY_N_POLLS === 1) void fetchConsole();

      if (isStopped(lifecycleFromPayload(data))) {
        stopTimers();
        // One last pass so the finished screen shows the final documents and the final cost.
        void fetchDocuments();
        void fetchConsole();
      }
    } catch { /* a dropped poll is not a failed run; the next one will answer */ }
  }, [projectId, stopTimers, fetchConsole, fetchDocuments]);

  const startTimers = useCallback(() => {
    stopTimers();
    pollTimerRef.current = setInterval(() => void pollStatus(), POLL_MS);
    docTimerRef.current = setInterval(() => void fetchDocuments(), DOC_POLL_MS);
    void pollStatus();
    void fetchDocuments();
  }, [stopTimers, pollStatus, fetchDocuments]);

  // ── Start ─────────────────────────────────────────────────────────────────────────────────────

  const start = useCallback(async (input: StartRunInput) => {
    if (starting) return;
    setStarting(true);
    setStartError(null);
    setLiteFallback(null);
    // A new run means the previous run's answers are no longer about anything on this screen.
    expectedRunIdRef.current = null;
    setPoll({ status: 'starting', message: 'Starting research pipeline…' });
    setLogs([]);

    const payload = {
      address: input.address?.trim() || undefined,
      county: input.county?.trim() || undefined,
      propertyId: input.parcelId?.trim() || undefined,
      ownerName: input.ownerName?.trim() || undefined,
      operatorNotes: input.operatorNotes?.trim() || undefined,
      userFiles: input.userFiles?.length ? input.userFiles : undefined,
      settings: input.settings,
      trigger: input.trigger,
    };

    try {
      const res = await fetch(`/api/admin/research/${projectId}/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok || res.status === 409) {
        const data = await res.json().catch(() => ({})) as { runId?: string | null; startedAt?: string };
        // THE LINE THAT WAS MISSING. The route has returned `runId` all along and the panel read
        // the body only to discard it.
        if (data.runId) expectedRunIdRef.current = data.runId;
        setPoll((p) => ({ ...(p ?? {}), status: 'running', runId: data.runId ?? null, startedAt: data.startedAt }));
        setStarting(false);
        startTimers();
        return;
      }

      if (res.status === 503) {
        // The worker is not there. The lite pipeline is a genuinely weaker run and the operator is
        // told so for the LIFE of the run, not for the one second before the next message lands.
        const err = await res.json().catch(() => ({})) as { error?: string };
        setLiteFallback(err.error ?? 'The research worker is not answering.');
        const liteRes = await fetch(`/api/admin/research/${projectId}/lite-pipeline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: payload.address, county: payload.county,
            owner_name: payload.ownerName, parcel_id: payload.propertyId,
          }),
        });
        if (liteRes.ok) {
          setPoll({ status: 'running', message: 'Running the lite pipeline — the full worker is unavailable.' });
          setStarting(false);
          startTimers();
          return;
        }
        setStartError('The research worker is unavailable and the fallback could not start either.');
        setPoll(null);
        setStarting(false);
        return;
      }

      const err = await res.json().catch(() => ({})) as { error?: string };
      // A start that never happened is NOT a failed run — there is no run. Rendering it as one put
      // a red "Research Failed" panel over a project where nothing had been attempted.
      setStartError(err.error || 'The run could not be started.');
      setPoll(null);
      setStarting(false);
    } catch (e) {
      setStartError(`Could not reach the server to start the run (${e instanceof Error ? e.message : String(e)}).`);
      setPoll(null);
      setStarting(false);
    }
  }, [projectId, starting, startTimers]);

  // ── Cancel ────────────────────────────────────────────────────────────────────────────────────

  const cancel = useCallback(async () => {
    setCancelling(true);
    try {
      const res = await fetch(`/api/admin/research/${projectId}/pipeline`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        stopTimers();
        // `cancelled`, not `failed`. The old panel set 'failed' with the reason "Pipeline cancelled
        // by user", which is how a deliberate stop came to be rendered in red as a broken run.
        setPoll((p) => ({ ...(p ?? {}), status: 'cancelled', stopReason: 'cancelled_by_user' }));
        void fetchConsole();
        void fetchDocuments();
      }
    } catch { /* leave the run alone; the poll will report what actually happened */ }
    setCancelling(false);
  }, [projectId, stopTimers, fetchConsole, fetchDocuments]);

  const refresh = useCallback(() => {
    void pollStatus();
    void fetchConsole();
    void fetchDocuments();
    void fetchPaidNotice();
  }, [pollStatus, fetchConsole, fetchDocuments, fetchPaidNotice]);

  // ── Adopt a run that was already going when the page opened ───────────────────────────────────

  useEffect(() => {
    void pollStatus();
    void fetchConsole();
    void fetchDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Start or stop the timers to match what the run is doing. Driven by the derived lifecycle rather
  // than by each call site remembering to schedule and clear its own interval.
  const lifecycle = lifecycleFromPayload(poll);
  useEffect(() => {
    if (isActive(lifecycle)) {
      if (!pollTimerRef.current) startTimers();
    } else {
      stopTimers();
    }
    return () => { /* timers are torn down by the unmount effect below */ };
  }, [lifecycle, startTimers, stopTimers]);

  useEffect(() => () => stopTimers(), [stopTimers]);

  // D4 — the clock advances between polls. It is still DERIVED from `startedAt`; this only forces a
  // re-render so the derivation is recomputed, which is why reopening the page mid-run shows the
  // true elapsed time instead of counting from zero.
  useEffect(() => {
    if (!isActive(lifecycle)) return;
    const t = setInterval(() => setTick((n) => n + 1), 1_000);
    return () => clearInterval(t);
  }, [lifecycle]);

  // ── Derive ────────────────────────────────────────────────────────────────────────────────────

  // The legacy regex inference, kept ONLY for a worker that predates `percent`. It is not consulted
  // when the server has an answer — see `resolvePercent`.
  const inferred = poll?.status
    ? progressPercent(
        inferMicroStage(poll.message ?? undefined, poll.status, docCountRef.current),
        false,
      )
    : null;

  useEffect(() => { void fetchPaidNotice(); }, [fetchPaidNotice]);

  const state = buildRunState({
    poll,
    console: cons,
    inferredPercent: inferred,
    paidDocumentsNotice: paidNotice,
  });

  return {
    state, logs, documents, documentsLoading, liteFallback, startError,
    starting, cancelling, start, cancel, refresh,
  };
}

/** Lifecycle straight off a payload, for the places that need it before `buildRunState` runs. */
function lifecycleFromPayload(p: PollPayload | null): RunLifecycle {
  return lifecycleOf(p?.status ?? null);
}
