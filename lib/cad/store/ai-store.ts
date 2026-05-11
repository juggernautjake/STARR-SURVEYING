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
      return { mode, sandbox: defaultSandboxFor(mode) };
    }),
  cycleMode: () =>
    set((s) => {
      const i = AI_MODE_CYCLE.indexOf(s.mode);
      const next = AI_MODE_CYCLE[(i + 1) % AI_MODE_CYCLE.length];
      return { mode: next, sandbox: defaultSandboxFor(next) };
    }),
  setSandbox: (sandbox) => set({ sandbox }),
  setAutoApproveThreshold: (threshold) =>
    set({ autoApproveThreshold: Math.max(0, Math.min(1, threshold)) }),

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
  setResult: (result) =>
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
    }),
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
