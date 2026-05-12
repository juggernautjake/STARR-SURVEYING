'use client';
// lib/cad/store/ai-store.ts — Zustand store for the Phase 6 AI
// drawing pipeline UI. Tracks the dialog open/close state, the
// in-flight job status (idle / running / done / error), the
// latest result, and the user-facing error message.
//
// Also hosts the Phase 6 §32 "AI Integration Framework" state:
// the four-mode enum, the per-action sandbox toggle, and the
// confidence threshold that drives AUTO escalation. Those
// fields are persisted to localStorage via zustand's `persist`
// middleware with a strict allow-list — the live pipeline
// state (`status`, `result`, `error`, chat history, ...)
// stays ephemeral so a refresh doesn't resurrect a stale run.
//
// The AIDrawingDialog reads + writes this; the ReviewQueuePanel
// (Phase 6 UI slice 2) consumes the result + per-item status.
// Per-item updates land back in the same `result.reviewQueue`
// shape so a reload of the panel renders consistently.
//
// Pure client-side state. The actual pipeline call goes through
// POST /api/admin/cad/ai-pipeline.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AIProposal } from '../ai/proposals';
import { executeProposal } from '../ai/proposals';
import type { ToolResult } from '../ai/tool-registry';
import {
  buildAutoIntakePrompt,
  snapshotFromFeatures,
} from '../ai/auto-intake';

import type {
  AIJobPayload,
  AIJobResult,
  ClarifyingQuestion,
  ElementChatAction,
  ElementChatMessage,
  ElementExplanation,
  ReviewItem,
  ReviewItemStatus,
} from '../ai-engine/types';
import type { Feature } from '../types';
import { useDrawingStore } from './drawing-store';

export type AIPipelineStatus = 'idle' | 'running' | 'done' | 'error';

/**
 * Phase 6 §32 — four-mode AI integration framework.
 * COPILOT is the default for fresh projects.
 */
export type AIMode = 'AUTO' | 'COPILOT' | 'COMMAND' | 'MANUAL';

/**
 * Phase 6 §32 Slice 7 — one entry in the Copilot sidebar
 * transcript. `role` distinguishes surveyor input (USER) from
 * narrative output (AI) and structured system acks (SYSTEM,
 * e.g. "Accepted proposal", "AI offline").
 */
export interface AICopilotMessage {
  id: string;
  role: 'USER' | 'AI' | 'SYSTEM';
  content: string;
  /** ISO timestamp. */
  ts: string;
}

/**
 * Phase 6 §32 Slice 9 — metadata for a project reference
 * document the surveyor has uploaded (deed PDF, recorded plat,
 * hand sketch, prior drawing, …). We only persist a manifest
 * of names/kinds — the actual file blobs live wherever the
 * existing deed/import pipelines store them. The framework
 * uses this list to (a) dampen confidence × 0.85 when empty,
 * (b) feed `hasReferenceDocs` into the system prompt.
 */
export interface AIReferenceDoc {
  id: string;
  /** Surveyor-facing name. Filename when uploaded; freeform
   *  when entered as a stub. */
  name: string;
  /** Coarse classification so the AI knows what to expect. */
  kind: 'DEED' | 'PLAT' | 'SKETCH' | 'PRIOR_DRAWING' | 'OTHER';
  /** ISO timestamp. */
  addedAt: string;
}

/** Confidence dampening factor applied to every proposal that
 *  lands while there are no reference docs (§32.6). 0.85 is the
 *  spec value. */
export const REFERENCE_DOC_DAMPENING = 0.85;

/**
 * Phase 6 §32 Slice 12 — one entry in the AI session timeline.
 * Records enough metadata to replay an AI sequence against a
 * different points file later. Persisted so the log survives
 * reload (size is modest — a few hundred bytes per turn).
 */
export interface AIBatchLog {
  id: string;
  /** ms-since-epoch when the batch landed. */
  createdAt: number;
  /** Surveyor-typed prompt (or the AUTO intake prompt for AUTO
   *  runs). Replay re-fires this verbatim so the AI works
   *  against the new document state without re-tweaking. */
  prompt: string;
  /** Number of proposals the AI returned in this turn.
   *  Informational only — replay doesn't need it. */
  proposalCount: number;
}

/** Ordered list used by the cycle hotkey (Ctrl+Shift+M). */
export const AI_MODE_CYCLE: AIMode[] = ['AUTO', 'COPILOT', 'COMMAND', 'MANUAL'];

interface AIStore {
  // ────────────────────────────────────────────────────────
  // §32 Integration Framework — persisted fields
  // ────────────────────────────────────────────────────────
  /** Which of the four modes is active. Default COPILOT. */
  mode: AIMode;
  /** Per-action sandbox toggle. When ON, AI writes route to
   *  `DRAFT__<targetname>` layers and require explicit promotion
   *  via the §11.7 Layer Transfer kernel. Defaults follow §32.3:
   *  AUTO → true, COPILOT → true, COMMAND → false. */
  sandbox: boolean;
  /** Confidence threshold (0–1). In AUTO mode, decisions below
   *  this confidence pause the run and escalate to COPILOT for
   *  that single step. Default 0.85. */
  autoApproveThreshold: number;

  setMode: (mode: AIMode) => void;
  /** Cycle AUTO → COPILOT → COMMAND → MANUAL → AUTO. Bound to
   *  Ctrl+Shift+M; also exposed via the status-bar mode chip. */
  cycleMode: () => void;
  setSandbox: (sandbox: boolean) => void;
  setAutoApproveThreshold: (threshold: number) => void;

  // ────────────────────────────────────────────────────────
  // §32 Slice 5 — COPILOT proposal queue
  // ────────────────────────────────────────────────────────
  /** FIFO queue of proposals waiting for the surveyor to
   *  Accept / Modify / Skip. The CopilotCard renders the head.
   *  Ephemeral — not persisted (a fresh load starts empty). */
  proposalQueue: AIProposal[];
  /** Append a proposal to the tail. Used by both the real AI
   *  adapter (Slice 6) and the mock proposer (tests). */
  enqueueProposal: (proposal: AIProposal) => void;
  /** Run the head proposal through `executeProposal`, then
   *  dequeue. Returns the `ToolResult` so test code can assert
   *  the kernel's response without scraping the drawing store.
   *  `sandbox` overrides the proposal's `sandboxDefault` and
   *  the store-wide default. */
  acceptHeadProposal: (sandbox?: boolean) => ToolResult<unknown> | null;
  /** Dequeue the head without executing. The proposal id is
   *  returned so the AI adapter can NACK the model if needed. */
  skipHeadProposal: () => string | null;
  /** Drop every queued proposal. Used by mode-changes (leaving
   *  COPILOT cancels in-flight cards) and by `clearProposalQueue`
   *  in the test helpers. */
  clearProposalQueue: () => void;

  /** True while a `proposeFromPrompt` POST is in flight. The
   *  chat sidebar / command palette wires a spinner off this. */
  isProposing: boolean;
  /** Last narrative Claude emitted alongside a proposal turn —
   *  shown verbatim in the chat sidebar so the surveyor sees
   *  caveats and clarifying questions before the card lands. */
  lastProposeNarrative: string | null;
  /** §32.13 Slice 6 — POST the surveyor's prompt to
   *  /api/admin/cad/ai-propose. Enqueues every returned proposal
   *  on the proposal queue and stashes the narrative for the
   *  chat sidebar. Resolves once the proposals land or rejects
   *  with the route's error message. */
  proposeFromPrompt: (prompt: string) => Promise<void>;
  /** §32.13 Slice 11 — kick off an AUTO run. Builds the intake
   *  prompt from the current document + project context and
   *  fires it through `proposeFromPrompt`. The surveyor sees
   *  the intake in the transcript and can stop the run at any
   *  feature boundary via Ctrl+Shift+P (which flips mode to
   *  COPILOT — escalation handles the rest). */
  startAutoRun: () => Promise<void>;

  // ────────────────────────────────────────────────────────
  // §32 Slice 7 — COPILOT / COMMAND chat sidebar
  // ────────────────────────────────────────────────────────
  /** Whether the AI Copilot sidebar is mounted-visible. The
   *  status-bar mode chip + Ctrl+Shift+C focus action both
   *  open it. Persisted so the surveyor's last layout sticks. */
  isCopilotSidebarOpen: boolean;
  openCopilotSidebar: () => void;
  closeCopilotSidebar: () => void;
  toggleCopilotSidebar: () => void;
  /** Surveyor-visible transcript. USER turns are typed; AI
   *  turns are either narratives from `proposeFromPrompt`
   *  responses or short acknowledgements when a proposal is
   *  accepted / skipped. Ephemeral. */
  copilotChat: AICopilotMessage[];
  /** Pre-composed text seeded into the sidebar input when an
   *  external surface opens the chat (right-click "Ask AI
   *  about this…", a palette entry, etc.). Consumed + cleared
   *  by the sidebar on next render. */
  pendingPrompt: string | null;
  /** Append one message to the transcript. */
  appendCopilotMessage: (m: AICopilotMessage) => void;
  /** Open the sidebar + seed `pendingPrompt`. The sidebar reads
   *  it on mount / next render, places it in the input, and
   *  clears it. */
  openCopilotWithPrompt: (prompt: string) => void;
  /** Clear the live transcript. */
  clearCopilotChat: () => void;

  // ────────────────────────────────────────────────────────
  // §32 Slice 8 — code-resolution memory + AUTO escalation
  // ────────────────────────────────────────────────────────
  /**
   * Code-disambiguation answers the surveyor has already given
   * in this project. When the AI proposes a layer for a code
   * the surveyor's previously resolved, it can pull the answer
   * straight from here rather than re-asking. Keyed by the
   * code (case-insensitive; we canonicalise to upper-case).
   * Persisted so a surveyor doesn't lose their resolutions on
   * a reload.
   */
  codeResolutionMemory: Record<string, { layerId: string; answeredAt: number }>;
  /** Store / overwrite one code → layer resolution. The
   *  `code` is canonicalised to upper-case before storing so
   *  case-insensitive matches work in both directions. */
  recordCodeResolution: (code: string, layerId: string) => void;
  /** Remove one resolution (surveyor changed their mind). */
  forgetCodeResolution: (code: string) => void;
  /** Clear every resolution — e.g. when the surveyor opens a
   *  brand-new project file and old answers no longer apply. */
  clearCodeResolutionMemory: () => void;

  // ────────────────────────────────────────────────────────
  // §32 Slice 9 — reference-doc manifest + dampening
  // ────────────────────────────────────────────────────────
  /** Project reference documents the surveyor has uploaded.
   *  Empty by default; populated by the existing deed / plat
   *  pipelines via `addReferenceDoc` (Phase 6 §6 / §32.6).
   *  Persisted across reloads. */
  referenceDocs: AIReferenceDoc[];
  addReferenceDoc: (doc: Omit<AIReferenceDoc, 'id' | 'addedAt'>) => void;
  removeReferenceDoc: (id: string) => void;
  clearReferenceDocs: () => void;

  // ────────────────────────────────────────────────────────
  // §32 Slice 12 — replay timeline
  // ────────────────────────────────────────────────────────
  /** Append-only log of every successful AI turn this project.
   *  `proposeFromPrompt` auto-records on success; the replay
   *  command walks the log and re-fires every prompt against
   *  the current document state. */
  aiBatches: AIBatchLog[];
  /** Drop one log entry by id. Used by the replay-management
   *  UI to skip stale turns. */
  removeAIBatch: (id: string) => void;
  /** Wipe every log entry — typically called before kicking
   *  off a fresh project so old turns don't bleed in. */
  clearAIBatches: () => void;
  /**
   * Re-fire every recorded turn's prompt in order via
   * `proposeFromPrompt`. The current document state acts as
   * the "new points file" — surveyors point at an updated
   * document and replay produces a fresh draft drawing.
   *
   * Returns `{ replayed, failed }`. Aborts cleanly on
   * `options.signal`. Each turn awaits the previous one so
   * the proposal queue receives them in source order.
   */
  replayAISequence: (
    options?: { signal?: AbortSignal },
  ) => Promise<{ replayed: number; failed: number; aborted: boolean }>;

  // Dialog visibility.
  isDialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;

  // Review queue panel visibility (Phase 6 UI slice 2).
  isQueuePanelOpen: boolean;
  openQueuePanel: () => void;
  closeQueuePanel: () => void;
  toggleQueuePanel: () => void;

  // §28.4 clarifying-question dialog visibility. Auto-opened
  // by `setResult` when deliberation flagged shouldShowDialog;
  // manual open/close lets the user re-visit it.
  isQuestionDialogOpen: boolean;
  openQuestionDialog: () => void;
  closeQuestionDialog: () => void;

  // §30.3 element-explanation popup. Holds the featureId of the
  // currently-open popup; null when nothing is open. Opens on
  // a row click in the review queue and closes via the popup
  // close button or Esc.
  explanationFeatureId: string | null;
  openExplanation: (featureId: string) => void;
  closeExplanation: () => void;

  // Pipeline state.
  status: AIPipelineStatus;
  /** Last successful result from the pipeline. Cleared when a
   *  new run starts; preserved across dialog close so the
   *  review queue can still render. */
  result: AIJobResult | null;
  /** User-facing error message when status === 'error'. */
  error: string | null;

  /** Set when /api/admin/cad/ai-pipeline returns. */
  setResult: (result: AIJobResult) => void;
  /** Mark the run as failed. Pass a friendly message. */
  setError: (message: string) => void;
  /** Reset to idle. Used by the dialog before re-running and
   *  when the user dismisses the result. */
  reset: () => void;
  /** Mark the run as in-flight. */
  start: () => void;

  /** Mutate one review item's status (Accept / Modify / Reject /
   *  Pending). No-ops when no result is loaded or the item id
   *  isn't found. Updates the summary counters in lock-step. */
  setItemStatus: (
    itemId: string,
    status: ReviewItemStatus,
    userNote?: string | null
  ) => void;

  /** §28.4 — record the user's answer to a clarifying question.
   *  Answers stay in the result object so a subsequent re-run
   *  can fold them back into the pipeline payload. */
  setQuestionAnswer: (questionId: string, answer: string) => void;
  /** §28.4 — mark a question skipped (only optional questions
   *  honor this; BLOCKING questions ignore the call). */
  setQuestionSkipped: (questionId: string, skipped: boolean) => void;
  /** §28.4 — bulk-skip every non-blocking question. */
  skipAllOptionalQuestions: () => void;

  /** §3.3 — feature ids whose AI explanation has drifted
   *  from the live geometry (typically because the surveyor
   *  manually moved / grip-edited the feature on the canvas).
   *  Surfaced as a ⚠ chip on the Explanations sidebar tab +
   *  a banner inside the explanation popup. Cleared
   *  automatically whenever a fresh pipeline run lands new
   *  explanations. */
  staleExplanationIds: string[];
  markExplanationStale: (featureId: string) => void;
  clearExplanationStale: (featureId: string) => void;
  clearAllStaleExplanations: () => void;

  /** Last payload posted to /api/admin/cad/ai-pipeline. Kept
   *  so the §28.5 re-run path can rebuild the payload without
   *  requiring the user to re-type the deed text or toggle
   *  options. Cleared on `reset`. */
  lastPayload: AIJobPayload | null;
  setLastPayload: (payload: AIJobPayload) => void;
  /** §28.5 — re-POST the last payload with the user's clarifying
   *  answers folded back in. Resolves once the new result lands
   *  in the store; rejects on network/HTTP failure. The dialog
   *  closes automatically on success. No-op when no payload is
   *  cached or no questions exist. */
  rerunWithAnswers: () => Promise<void>;
  /** Phase 6 §3109 — re-POST the cached payload without folding in
   *  any new answers. Refreshes every confidence card / review
   *  item with whatever the pipeline now produces (useful when
   *  the underlying point set, code library, or template has
   *  changed since the first run). No-op when nothing is cached. */
  reanalyze: () => Promise<void>;

  /** §30.4 — element-chat per-popup loading flag. Keyed by
   *  feature id so multiple popups (future multi-element
   *  workflow) don't collide. */
  chatLoadingByFeature: Record<string, boolean>;
  /** §30.4 — POST the in-flight transcript + element context
   *  to /api/admin/cad/element-chat, then append Claude's reply
   *  (with optional ElementChatAction) to
   *  `result.explanations[featureId].chatHistory`. */
  sendChatMessage: (featureId: string, content: string) => Promise<void>;

  /** §30.4 — execute a structured ElementChatAction returned by
   *  Claude. UPDATE_ATTRIBUTE mutates feature.properties on the
   *  AI result + the live drawing store if the feature has been
   *  applied. REDRAW_FULL re-runs the pipeline with the chat
   *  instruction folded into `userPrompt`. REDRAW_ELEMENT and
   *  REDRAW_GROUP land an AI message + warning marking the
   *  feature(s) as queued for partial recompute (the partial
   *  paths land in a follow-up slice once Stage-4-only and
   *  group-only re-run helpers exist). */
  executeChatAction: (
    featureId: string,
    action: ElementChatAction,
    /** Optional instruction text used by REDRAW_FULL. Falls back
     *  to action.description when omitted. */
    instruction?: string
  ) => Promise<void>;
}

/**
 * Default sandbox value for each mode per §32.3. AUTO/COPILOT
 * default to sandbox-on (safer); COMMAND defaults to live
 * (surveyor explicitly asked for the action); MANUAL is N/A
 * and just keeps the current value untouched.
 */
function defaultSandboxFor(mode: AIMode): boolean {
  if (mode === 'COMMAND') return false;
  return true;
}

export const useAIStore = create<AIStore>()(persist((set, get) => ({
  // §32 framework — defaults documented in §32.1/§32.3/§32.5.
  mode: 'COPILOT',
  sandbox: true,
  autoApproveThreshold: 0.85,

  setMode: (mode) =>
    set((s) => {
      if (s.mode === mode) return s;
      return {
        mode,
        sandbox: defaultSandboxFor(mode),
        // §32 Slice 7 — mode change drives the sidebar default:
        // COPILOT / COMMAND auto-open it; MANUAL closes it.
        isCopilotSidebarOpen: mode !== 'MANUAL',
      };
    }),
  cycleMode: () =>
    set((s) => {
      const i = AI_MODE_CYCLE.indexOf(s.mode);
      const next = AI_MODE_CYCLE[(i + 1) % AI_MODE_CYCLE.length];
      return {
        mode: next,
        sandbox: defaultSandboxFor(next),
        isCopilotSidebarOpen: next !== 'MANUAL',
      };
    }),
  setSandbox: (sandbox) => set({ sandbox }),
  setAutoApproveThreshold: (threshold) =>
    set({ autoApproveThreshold: Math.max(0, Math.min(1, threshold)) }),

  // §32 Slice 5 — COPILOT proposal queue
  proposalQueue: [],
  enqueueProposal: (proposal) =>
    set((s) => ({ proposalQueue: [...s.proposalQueue, proposal] })),
  acceptHeadProposal: (sandbox) => {
    const state = get();
    const head = state.proposalQueue[0];
    if (!head) return null;
    const effectiveSandbox =
      typeof sandbox === 'boolean'
        ? sandbox
        : (head.sandboxDefault ?? state.sandbox);
    const result = executeProposal(head, effectiveSandbox);
    set((s) => ({ proposalQueue: s.proposalQueue.slice(1) }));
    return result;
  },
  skipHeadProposal: () => {
    const state = get();
    const head = state.proposalQueue[0];
    if (!head) return null;
    set((s) => ({ proposalQueue: s.proposalQueue.slice(1) }));
    return head.id;
  },
  clearProposalQueue: () => set({ proposalQueue: [] }),

  isProposing: false,
  lastProposeNarrative: null,
  isCopilotSidebarOpen: false,
  copilotChat: [],
  pendingPrompt: null,
  openCopilotSidebar: () => set({ isCopilotSidebarOpen: true }),
  closeCopilotSidebar: () => set({ isCopilotSidebarOpen: false }),
  toggleCopilotSidebar: () =>
    set((s) => ({ isCopilotSidebarOpen: !s.isCopilotSidebarOpen })),
  appendCopilotMessage: (m) =>
    set((s) => ({ copilotChat: [...s.copilotChat, m] })),
  openCopilotWithPrompt: (prompt) =>
    set({ isCopilotSidebarOpen: true, pendingPrompt: prompt }),
  clearCopilotChat: () => set({ copilotChat: [], pendingPrompt: null }),

  // §32 Slice 8 — code-resolution memory.
  codeResolutionMemory: {},
  recordCodeResolution: (code, layerId) => {
    const key = code.trim().toUpperCase();
    if (key.length === 0 || layerId.length === 0) return;
    set((s) => ({
      codeResolutionMemory: {
        ...s.codeResolutionMemory,
        [key]: { layerId, answeredAt: Date.now() },
      },
    }));
  },
  forgetCodeResolution: (code) => {
    const key = code.trim().toUpperCase();
    set((s) => {
      if (!(key in s.codeResolutionMemory)) return s;
      const next = { ...s.codeResolutionMemory };
      delete next[key];
      return { codeResolutionMemory: next };
    });
  },
  clearCodeResolutionMemory: () => set({ codeResolutionMemory: {} }),

  // §32 Slice 9 — reference-doc manifest.
  referenceDocs: [],
  addReferenceDoc: (doc) => {
    const trimmedName = doc.name.trim();
    if (trimmedName.length === 0) return;
    const entry: AIReferenceDoc = {
      id: 'doc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
      name: trimmedName,
      kind: doc.kind,
      addedAt: new Date().toISOString(),
    };
    set((s) => ({ referenceDocs: [...s.referenceDocs, entry] }));
  },
  removeReferenceDoc: (id) =>
    set((s) => ({
      referenceDocs: s.referenceDocs.filter((d) => d.id !== id),
    })),
  clearReferenceDocs: () => set({ referenceDocs: [] }),

  // §32 Slice 12 — replay timeline.
  aiBatches: [],
  removeAIBatch: (id) =>
    set((s) => ({ aiBatches: s.aiBatches.filter((b) => b.id !== id) })),
  clearAIBatches: () => set({ aiBatches: [] }),
  replayAISequence: async (options) => {
    const log = get().aiBatches;
    if (log.length === 0) {
      return { replayed: 0, failed: 0, aborted: false };
    }
    let replayed = 0;
    let failed = 0;
    for (const entry of log) {
      if (options?.signal?.aborted) {
        return { replayed, failed, aborted: true };
      }
      const prior = get().lastProposeNarrative;
      try {
        await get().proposeFromPrompt(entry.prompt);
      } catch {
        failed++;
        continue;
      }
      // `proposeFromPrompt` writes `lastProposeNarrative` on
      // both ok and error paths (errors come back with a ⚠
      // prefix). Treat "narrative starts with ⚠ and changed
      // during the call" as a failure indicator.
      const next = get().lastProposeNarrative;
      if (
        typeof next === 'string' &&
        next !== prior &&
        next.startsWith('⚠')
      ) {
        failed++;
      } else {
        replayed++;
      }
    }
    return { replayed, failed, aborted: false };
  },

  proposeFromPrompt: async (prompt: string) => {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) return;
    const drawing = useDrawingStore.getState();
    const ai = get();
    const context = {
      layers: Object.values(drawing.document.layers)
        .filter((l) => !l.name.startsWith('SURVEY-INFO'))
        .map((l) => ({ id: l.id, name: l.name, color: l.color })),
      activeLayerId: drawing.activeLayerId,
      mode: ai.mode,
      sandboxDefault: ai.sandbox,
      autoApproveThreshold: ai.autoApproveThreshold,
      // §32.4 — let the model see prior code resolutions so
      // it doesn't keep asking about codes the surveyor's
      // already answered.
      codeResolutions: ai.codeResolutionMemory,
      // §32.6 — tell the model what reference docs (if any)
      // have been uploaded so it can be more cautious when
      // running blind.
      referenceDocs: ai.referenceDocs.map((d) => ({
        name: d.name,
        kind: d.kind,
      })),
    };
    // Mirror the USER turn into the sidebar transcript before
    // we wait on the network so the surveyor sees their own
    // prompt land instantly.
    const userMsg: AICopilotMessage = {
      id: copilotMsgId(),
      role: 'USER',
      content: trimmed,
      ts: new Date().toISOString(),
    };
    set((s) => ({
      copilotChat: [...s.copilotChat, userMsg],
      isProposing: true,
    }));
    try {
      const res = await fetch('/api/admin/cad/ai-propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed, context }),
      });
      const json = (await res.json().catch(() => ({}))) as
        | {
            proposals: AIProposal[];
            narrative: string;
          }
        | { error?: string };
      if (!res.ok) {
        const msg =
          (json as { error?: string }).error ??
          `AI proposer failed (${res.status}).`;
        set((s) => ({
          isProposing: false,
          lastProposeNarrative: `⚠ ${msg}`,
          copilotChat: [...s.copilotChat, {
            id: copilotMsgId(), role: 'SYSTEM', content: `⚠ ${msg}`,
            ts: new Date().toISOString(),
          }],
        }));
        return;
      }
      const ok = json as { proposals: AIProposal[]; narrative: string };
      // §32.6 — dampen confidence × 0.85 on every proposal
      // when no reference docs are loaded. Stamps the dampened
      // value back into provenance so the right-click "Why did
      // AI draw this?" popup shows the actual confidence the
      // surveyor saw.
      const hasRefs = ai.referenceDocs.length > 0;
      const incoming = (ok.proposals ?? []).map((p) =>
        hasRefs
          ? p
          : {
              ...p,
              confidence: p.confidence * REFERENCE_DOC_DAMPENING,
              provenance: {
                ...p.provenance,
                aiConfidence: p.provenance.aiConfidence * REFERENCE_DOC_DAMPENING,
              },
            },
      );
      const replyTurns: AICopilotMessage[] = [];
      if (ok.narrative.length > 0) {
        replyTurns.push({
          id: copilotMsgId(),
          role: 'AI',
          content: ok.narrative,
          ts: new Date().toISOString(),
        });
      }
      if (incoming.length > 0) {
        const dampenSuffix = hasRefs
          ? ''
          : ` (confidence dampened ×${REFERENCE_DOC_DAMPENING} — no reference docs)`;
        replyTurns.push({
          id: copilotMsgId(),
          role: 'SYSTEM',
          content:
            `Queued ${incoming.length} proposal${incoming.length === 1 ? '' : 's'} for review (see COPILOT card)${dampenSuffix}.`,
          ts: new Date().toISOString(),
        });
      }
      // §32 Slice 12 — auto-record the turn in the replay log.
      const batchEntry: AIBatchLog = {
        id: copilotMsgId().replace('aic_', 'bat_'),
        createdAt: Date.now(),
        prompt: trimmed,
        proposalCount: incoming.length,
      };
      set((s) => ({
        proposalQueue: [...s.proposalQueue, ...incoming],
        lastProposeNarrative: ok.narrative.length > 0 ? ok.narrative : null,
        copilotChat: [...s.copilotChat, ...replyTurns],
        aiBatches: [...s.aiBatches, batchEntry],
        isProposing: false,
      }));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      set((s) => ({
        isProposing: false,
        lastProposeNarrative: `⚠ ${errMsg}`,
        copilotChat: [...s.copilotChat, {
          id: copilotMsgId(), role: 'SYSTEM', content: `⚠ ${errMsg}`,
          ts: new Date().toISOString(),
        }],
      }));
    }
  },

  startAutoRun: async () => {
    // Sidebar opens on its own when mode flips to AUTO, but
    // mode might already be AUTO — make sure the surveyor
    // sees the transcript regardless.
    const ai = get();
    if (!ai.isCopilotSidebarOpen) {
      set({ isCopilotSidebarOpen: true });
    }
    const drawing = useDrawingStore.getState();
    const snapshot = snapshotFromFeatures(
      Object.values(drawing.document.features),
    );
    const context = {
      layers: Object.values(drawing.document.layers)
        .filter((l) => !l.name.startsWith('SURVEY-INFO'))
        .map((l) => ({ id: l.id, name: l.name, color: l.color })),
      activeLayerId: drawing.activeLayerId,
      mode: ai.mode,
      sandboxDefault: ai.sandbox,
      autoApproveThreshold: ai.autoApproveThreshold,
      codeResolutions: ai.codeResolutionMemory,
      referenceDocs: ai.referenceDocs.map((d) => ({
        name: d.name,
        kind: d.kind,
      })),
    };
    const prompt = buildAutoIntakePrompt(snapshot, context);
    await get().proposeFromPrompt(prompt);
  },

  isDialogOpen: false,
  isQueuePanelOpen: false,
  isQuestionDialogOpen: false,
  explanationFeatureId: null,
  status: 'idle',
  result: null,
  error: null,
  lastPayload: null,
  chatLoadingByFeature: {},
  staleExplanationIds: [],

  openDialog: () => set({ isDialogOpen: true }),
  closeDialog: () => set({ isDialogOpen: false }),

  openQueuePanel: () => set({ isQueuePanelOpen: true }),
  closeQueuePanel: () => set({ isQueuePanelOpen: false }),
  toggleQueuePanel: () =>
    set((s) => ({ isQueuePanelOpen: !s.isQueuePanelOpen })),

  openQuestionDialog: () => set({ isQuestionDialogOpen: true }),
  closeQuestionDialog: () => set({ isQuestionDialogOpen: false }),

  openExplanation: (featureId) => set({ explanationFeatureId: featureId }),
  closeExplanation: () => set({ explanationFeatureId: null }),

  start: () => set({ status: 'running', error: null }),
  setResult: (result) => {
    // Phase 6 §3084 — broadcast enrichment-ready event so the
    // title-block listener can merge PLSS / flood-zone fields
    // into the surveyor's notes without coupling this store to
    // the drawing store. No-op when enrichment didn't produce
    // any populated field.
    if (
      typeof window !== 'undefined' &&
      result.enrichmentData &&
      (result.enrichmentData.plssSection ||
        result.enrichmentData.plssTownship ||
        result.enrichmentData.plssRange ||
        result.enrichmentData.femaFloodZone)
    ) {
      window.dispatchEvent(
        new CustomEvent('cad:enrichmentReady', {
          detail: result.enrichmentData,
        }),
      );
    }
    set({
      status: 'done',
      result,
      error: null,
      // Auto-open the review panel on first successful result
      // so the surveyor sees what the pipeline produced.
      isQueuePanelOpen: true,
      // §28.1 short-circuit: only pop the question dialog when
      // deliberation actually wants the user to answer something.
      isQuestionDialogOpen:
        result.deliberationResult?.shouldShowDialog ?? false,
      // §3.3 — fresh pipeline run produces fresh explanations
      // so any prior stale flags are now stale themselves.
      staleExplanationIds: [],
    });
  },
  setError: (message) => set({ status: 'error', error: message }),
  reset: () =>
    set({
      status: 'idle',
      result: null,
      error: null,
      isQuestionDialogOpen: false,
      explanationFeatureId: null,
      lastPayload: null,
      chatLoadingByFeature: {},
    }),

  setLastPayload: (payload) => set({ lastPayload: payload }),

  rerunWithAnswers: async () => {
    const { lastPayload, result } = get();
    if (!lastPayload || !result?.deliberationResult) return;
    const answered = result.deliberationResult.questions.filter(
      (q) => q.userAnswer !== null && !q.skipped
    );
    if (answered.length === 0) {
      // Nothing to apply — just close the dialog without a re-run.
      set({ isQuestionDialogOpen: false });
      return;
    }
    set({ status: 'running', error: null });
    try {
      const nextPayload: AIJobPayload = {
        ...lastPayload,
        // Carry both prior answers + the new ones so the server
        // can render a cumulative answer log without dropping
        // earlier rounds.
        answers: [...lastPayload.answers, ...answered],
      };
      const res = await fetch('/api/admin/cad/ai-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextPayload),
      });
      const json = (await res.json().catch(() => ({}))) as
        | AIJobResult
        | { error?: string };
      if (!res.ok) {
        const msg =
          (json as { error?: string }).error ??
          `Pipeline re-run failed (${res.status}).`;
        set({ status: 'error', error: msg });
        return;
      }
      set({
        status: 'done',
        result: json as AIJobResult,
        error: null,
        lastPayload: nextPayload,
        // §28.1 short-circuit re-applies on the new result.
        isQuestionDialogOpen:
          (json as AIJobResult).deliberationResult?.shouldShowDialog ??
          false,
      });
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  reanalyze: async () => {
    const { lastPayload } = get();
    if (!lastPayload) return;
    set({ status: 'running', error: null });
    try {
      const res = await fetch('/api/admin/cad/ai-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lastPayload),
      });
      const json = (await res.json().catch(() => ({}))) as
        | AIJobResult
        | { error?: string };
      if (!res.ok) {
        const msg =
          (json as { error?: string }).error ??
          `Pipeline re-analyze failed (${res.status}).`;
        set({ status: 'error', error: msg });
        return;
      }
      set({
        status: 'done',
        result: json as AIJobResult,
        error: null,
        // lastPayload unchanged — re-analyze keeps the original cache
        isQuestionDialogOpen:
          (json as AIJobResult).deliberationResult?.shouldShowDialog ??
          false,
      });
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  sendChatMessage: async (featureId, content) => {
    const trimmed = content.trim();
    if (trimmed.length === 0) return;
    const stateNow = get();
    const explanation = stateNow.result?.explanations[featureId] as
      | ElementExplanation
      | undefined;
    const feature = stateNow.result?.features.find((f) => f.id === featureId);
    if (!stateNow.result || !explanation || !feature) return;

    const userMessage: ElementChatMessage = {
      id: chatMessageId(),
      role: 'USER',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    set((s) =>
      appendChatMessage(s, featureId, userMessage, true)
    );

    try {
      const res = await fetch('/api/admin/cad/element-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature,
          explanation: {
            ...explanation,
            // Echo the just-appended user turn so the server
            // receives the full transcript including the new
            // message at the end of `history`.
            chatHistory: [...explanation.chatHistory, userMessage],
          },
          history: [...explanation.chatHistory, userMessage],
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        reply?: string;
        action?: ElementChatAction | null;
        error?: string;
      };
      if (!res.ok) {
        const errMsg =
          json.error ?? `Element chat failed (${res.status}).`;
        set((s) =>
          appendChatMessage(
            s,
            featureId,
            {
              id: chatMessageId(),
              role: 'AI',
              content: `⚠ ${errMsg}`,
              timestamp: new Date().toISOString(),
            },
            false
          )
        );
        return;
      }
      const reply: ElementChatMessage = {
        id: chatMessageId(),
        role: 'AI',
        content:
          typeof json.reply === 'string' && json.reply.length > 0
            ? json.reply
            : '(empty reply)',
        timestamp: new Date().toISOString(),
        action: json.action ?? undefined,
      };
      set((s) => appendChatMessage(s, featureId, reply, false));
    } catch (err) {
      set((s) =>
        appendChatMessage(
          s,
          featureId,
          {
            id: chatMessageId(),
            role: 'AI',
            content: `⚠ ${err instanceof Error ? err.message : String(err)}`,
            timestamp: new Date().toISOString(),
          },
          false
        )
      );
    }
  },

  executeChatAction: async (featureId, action, instruction) => {
    if (action.type === 'NO_ACTION') return;

    const stateNow = get();
    if (!stateNow.result) return;

    if (action.type === 'UPDATE_ATTRIBUTE') {
      if (
        !action.attributeUpdates ||
        Object.keys(action.attributeUpdates).length === 0
      ) {
        appendActionAck(
          set,
          featureId,
          '⚠ Update skipped — Claude returned UPDATE_ATTRIBUTE ' +
            'without any concrete property/value pairs.'
        );
        return;
      }
      const targetIds =
        action.affectedIds.length > 0 ? action.affectedIds : [featureId];
      applyAttributeUpdates(set, get, targetIds, action.attributeUpdates);
      appendActionAck(
        set,
        featureId,
        `✓ Updated ${targetIds.length} feature${targetIds.length === 1 ? '' : 's'} ` +
          `(${Object.keys(action.attributeUpdates).join(', ')}).`
      );
      return;
    }

    if (action.type === 'REDRAW_ELEMENT' || action.type === 'REDRAW_GROUP') {
      const targets =
        action.affectedIds.length > 0
          ? action.affectedIds
          : [featureId];
      const label =
        action.type === 'REDRAW_ELEMENT'
          ? 'this element'
          : 'this group';
      appendActionAck(
        set,
        featureId,
        `↻ Queued ${targets.length} feature${targets.length === 1 ? '' : 's'} for ` +
          `${label} recompute. Partial-recompute lands in a ` +
          'follow-up slice; for now use Redraw Full Drawing to ' +
          'apply the change end-to-end.'
      );
      set((s) => {
        if (!s.result) return s;
        return {
          result: {
            ...s.result,
            warnings: [
              ...s.result.warnings,
              `Chat action ${action.type} queued for ${targets.length} ` +
                'feature(s); partial-recompute path not yet wired.',
            ],
          },
        };
      });
      return;
    }

    if (action.type === 'REDRAW_FULL') {
      const { lastPayload } = stateNow;
      if (!lastPayload) {
        appendActionAck(
          set,
          featureId,
          '⚠ Cannot re-run — no cached payload. Re-open the AI ' +
            'Drawing Engine dialog and run the pipeline first.'
        );
        return;
      }
      const chatInstruction =
        instruction && instruction.trim().length > 0
          ? instruction.trim()
          : action.description;
      set({ status: 'running', error: null });
      try {
        const augmentedPrompt = [
          lastPayload.userPrompt ?? '',
          chatInstruction
            ? `Additional instruction from element chat: ${chatInstruction}`
            : '',
        ]
          .filter(Boolean)
          .join('\n');
        const nextPayload: AIJobPayload = {
          ...lastPayload,
          userPrompt: augmentedPrompt.length > 0 ? augmentedPrompt : null,
        };
        const res = await fetch('/api/admin/cad/ai-pipeline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nextPayload),
        });
        const json = (await res.json().catch(() => ({}))) as
          | AIJobResult
          | { error?: string };
        if (!res.ok) {
          const msg =
            (json as { error?: string }).error ??
            `Full re-run failed (${res.status}).`;
          set({ status: 'error', error: msg });
          return;
        }
        set({
          status: 'done',
          result: json as AIJobResult,
          error: null,
          lastPayload: nextPayload,
          isQuestionDialogOpen:
            (json as AIJobResult).deliberationResult?.shouldShowDialog ??
            false,
          // Close the popup — the new result has fresh
          // explanations and the surveyor needs to see the
          // updated drawing.
          explanationFeatureId: null,
        });
      } catch (err) {
        set({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }
  },

  setItemStatus: (itemId, nextStatus, userNote = null) =>
    set((state) => {
      if (!state.result) return state;
      const queue = state.result.reviewQueue;

      let foundItem: ReviewItem | null = null;
      let foundTier: 1 | 2 | 3 | 4 | 5 | null = null;
      for (const tier of [5, 4, 3, 2, 1] as const) {
        const list = queue.tiers[tier];
        const ix = list.findIndex((i) => i.id === itemId);
        if (ix !== -1) {
          foundItem = list[ix];
          foundTier = tier;
          break;
        }
      }
      if (!foundItem || foundTier === null) return state;

      const prevStatus = foundItem.status;
      const updatedItem: ReviewItem = {
        ...foundItem,
        status: nextStatus,
        userNote,
      };

      const tierList = queue.tiers[foundTier].map((i) =>
        i.id === itemId ? updatedItem : i
      );

      // Recompute summary counters by walking the whole queue —
      // cheap (single-digit hundreds at most) and bulletproof
      // against bookkeeping drift if multiple writers race.
      const summary = {
        totalElements: 0,
        acceptedCount: 0,
        modifiedCount: 0,
        rejectedCount: 0,
        pendingCount: 0,
      };
      const tiersOut = { ...queue.tiers, [foundTier]: tierList };
      for (const tier of [5, 4, 3, 2, 1] as const) {
        for (const it of tiersOut[tier]) {
          summary.totalElements += 1;
          if (it.status === 'ACCEPTED') summary.acceptedCount += 1;
          else if (it.status === 'MODIFIED') summary.modifiedCount += 1;
          else if (it.status === 'REJECTED') summary.rejectedCount += 1;
          else summary.pendingCount += 1;
        }
      }
      // Reference prevStatus so future telemetry can fire here
      // (e.g. "user reversed an accepted decision"); silenced
      // for the v1 noop.
      void prevStatus;

      return {
        result: {
          ...state.result,
          reviewQueue: { tiers: tiersOut, summary },
        },
      };
    }),

  setQuestionAnswer: (questionId, answer) =>
    set((state) =>
      mutateQuestion(state, questionId, (q) => ({
        ...q,
        userAnswer: answer,
        skipped: false,
      }))
    ),

  setQuestionSkipped: (questionId, skipped) =>
    set((state) =>
      mutateQuestion(state, questionId, (q) =>
        // Blocking questions cannot be skipped per §28.4.
        q.priority === 'BLOCKING' && skipped ? q : { ...q, skipped }
      )
    ),

  markExplanationStale: (featureId) =>
    set((s) =>
      s.staleExplanationIds.includes(featureId)
        ? s
        : { staleExplanationIds: [...s.staleExplanationIds, featureId] }
    ),

  clearExplanationStale: (featureId) =>
    set((s) =>
      s.staleExplanationIds.includes(featureId)
        ? {
            staleExplanationIds: s.staleExplanationIds.filter(
              (id) => id !== featureId
            ),
          }
        : s
    ),

  clearAllStaleExplanations: () =>
    set((s) =>
      s.staleExplanationIds.length === 0
        ? s
        : { staleExplanationIds: [] }
    ),

  skipAllOptionalQuestions: () =>
    set((state) => {
      if (!state.result?.deliberationResult) return state;
      const deliberation = state.result.deliberationResult;
      const questions = deliberation.questions.map((q) =>
        q.priority === 'BLOCKING' || q.userAnswer !== null
          ? q
          : { ...q, skipped: true }
      );
      return rebuildDeliberation(state, questions);
    }),
}), {
  name: 'starr-cad-ai-store',
  // Persist ONLY the §32 framework fields. Pipeline state
  // (status / result / error / chat / staleExplanationIds /
  // lastPayload) stays ephemeral — a page reload should not
  // resurrect a half-finished AI run.
  partialize: (state) => ({
    mode: state.mode,
    sandbox: state.sandbox,
    autoApproveThreshold: state.autoApproveThreshold,
    isCopilotSidebarOpen: state.isCopilotSidebarOpen,
    // §32 Slice 8 — persist code-disambiguations so the
    // surveyor doesn't lose them on reload.
    codeResolutionMemory: state.codeResolutionMemory,
    // §32 Slice 9 — persist the reference-doc manifest.
    referenceDocs: state.referenceDocs,
    // §32 Slice 12 — persist the replay timeline so the surveyor
    // can run a sequence across sessions.
    aiBatches: state.aiBatches,
  }),
}));

// ────────────────────────────────────────────────────────────
// Helpers — keep `set` callbacks readable
// ────────────────────────────────────────────────────────────

function mutateQuestion(
  state: AIStore,
  questionId: string,
  mutate: (q: ClarifyingQuestion) => ClarifyingQuestion
): Partial<AIStore> {
  if (!state.result?.deliberationResult) return state;
  const deliberation = state.result.deliberationResult;
  let touched = false;
  const questions = deliberation.questions.map((q) => {
    if (q.id !== questionId) return q;
    touched = true;
    return mutate(q);
  });
  if (!touched) return state;
  return rebuildDeliberation(state, questions);
}

function rebuildDeliberation(
  state: AIStore,
  questions: ClarifyingQuestion[]
): Partial<AIStore> {
  if (!state.result?.deliberationResult) return state;
  const deliberation = state.result.deliberationResult;
  const blocking = questions.filter((q) => q.priority === 'BLOCKING');
  const optional = questions.filter((q) => q.priority !== 'BLOCKING');
  return {
    result: {
      ...state.result,
      deliberationResult: {
        ...deliberation,
        questions,
        blockingQuestions: blocking,
        optionalQuestions: optional,
      },
    },
  };
}

function appendChatMessage(
  state: AIStore,
  featureId: string,
  message: ElementChatMessage,
  loading: boolean
): Partial<AIStore> {
  if (!state.result) return state;
  const explanation = state.result.explanations[featureId] as
    | ElementExplanation
    | undefined;
  if (!explanation) return state;
  const updatedExplanation: ElementExplanation = {
    ...explanation,
    chatHistory: [...explanation.chatHistory, message],
  };
  const explanations = {
    ...state.result.explanations,
    [featureId]: updatedExplanation,
  };
  const chatLoadingByFeature = {
    ...state.chatLoadingByFeature,
    [featureId]: loading,
  };
  return {
    result: { ...state.result, explanations },
    chatLoadingByFeature,
  };
}

/** Tight, dependency-free id for the §32 Copilot transcript. */
function copilotMsgId(): string {
  return (
    'aic_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 8)
  );
}

function chatMessageId(): string {
  // Tight, dependency-free id — collision-free for the lifetime
  // of a single browser session, which is all the chat history
  // needs to survive (the next pipeline run regenerates the
  // explanations + clears history).
  return (
    'msg_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 8)
  );
}

type SetFn = (
  partial:
    | Partial<AIStore>
    | ((state: AIStore) => Partial<AIStore> | AIStore)
) => void;
type GetFn = () => AIStore;

/**
 * Append an AI-role acknowledgement to the live chat history
 * for `featureId`. Used after an executeChatAction step lands
 * (success or failure) so the surveyor sees the outcome inline
 * without needing to read warnings on the dialog.
 */
function appendActionAck(
  set: SetFn,
  featureId: string,
  text: string
): void {
  const ackMessage: ElementChatMessage = {
    id: chatMessageId(),
    role: 'AI',
    content: text,
    timestamp: new Date().toISOString(),
  };
  set((s) => appendChatMessage(s, featureId, ackMessage, false));
}

/**
 * Mutate `feature.properties` for the given target ids on the
 * AI result *and* on the live drawing store (when the feature
 * was already applied). Numeric / boolean strings are coerced
 * back to their primitive type so canvas styling reads them
 * correctly.
 */
function applyAttributeUpdates(
  set: SetFn,
  get: GetFn,
  targetIds: string[],
  updates: Record<string, string>
): void {
  const coerced: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(updates)) {
    coerced[k] = coerceAttributeValue(v);
  }

  // 1) AI result mutation — keeps explanation popups + review
  //    queue counters in sync.
  set((s) => {
    if (!s.result) return s;
    const targets = new Set(targetIds);
    const features = s.result.features.map((f) => {
      if (!targets.has(f.id)) return f;
      return {
        ...f,
        properties: { ...f.properties, ...coerced },
      } satisfies Feature;
    });
    return { result: { ...s.result, features } };
  });

  // 2) Drawing-store mutation — only writes when the feature
  //    has already been applied via the review-queue Accept
  //    path; otherwise it's a no-op.
  const drawing = useDrawingStore.getState();
  for (const id of targetIds) {
    const live = drawing.getFeature(id);
    if (!live) continue;
    drawing.updateFeature(id, {
      properties: { ...live.properties, ...coerced },
    });
  }
}

function coerceAttributeValue(raw: string): string | number | boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw.length > 0 && /^-?\d+(?:\.\d+)?$/.test(raw)) {
    const num = Number.parseFloat(raw);
    if (Number.isFinite(num)) return num;
  }
  return raw;
}
