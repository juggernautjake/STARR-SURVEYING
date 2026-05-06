'use client';
// lib/cad/store/drawing-chat-store.ts
//
// Phase 7 §4 — persistent drawing-level chat store. Holds the
// transcript + in-flight flag for the right-sidebar chat
// panel; sends / executes happen here so the panel stays
// thin.
//
// Action execution coverage:
//   * NO_ACTION              — store appends the AI bubble.
//   * UPDATE_TITLE_BLOCK     — patches `titleBlock` via
//                              `useDrawingStore.updateSettings`
//                              with primitive coercion.
//   * UPDATE_SETTING         — patches whitelisted top-level
//                              settings (drawingScale,
//                              paperSize, paperOrientation,
//                              codeDisplayMode,
//                              drawingRotationDeg).
//   * REGENERATE_PIPELINE    — re-POSTs `useAIStore.lastPayload`
//                              with the chat instruction
//                              folded into `userPrompt`.
//   * REDRAW_LAYER           — appends a "queued" AI ack +
//                              warning until partial-recompute
//                              lands.
//
// Chat history is session-scoped — restarting the editor
// drops it. Persistence to user-settings or the document is
// a follow-up slice if it turns out the surveyor wants prior
// transcripts to ride with the file.

import { create } from 'zustand';

import type {
  DrawingChatAction,
  DrawingChatMessage,
} from '../ai-engine/drawing-chat';
import type { AIJobPayload, AIJobResult } from '../ai-engine/types';
import { useAIStore } from './ai-store';
import { useDrawingStore } from './drawing-store';

const TITLE_BLOCK_KEYS = new Set([
  'firmName',
  'surveyorName',
  'surveyorLicense',
  'projectName',
  'projectNumber',
  'clientName',
  'surveyDate',
  'notes',
  'scaleLabel',
  'sheetNumber',
  'totalSheets',
  'surveyType',
]);

const SETTING_KEYS = new Set([
  'drawingScale',
  'paperSize',
  'paperOrientation',
  'codeDisplayMode',
  'drawingRotationDeg',
]);

interface DrawingChatStore {
  isOpen: boolean;
  open:   () => void;
  close:  () => void;
  toggle: () => void;

  history: DrawingChatMessage[];
  loading: boolean;

  send: (content: string) => Promise<void>;
  applyAction: (action: DrawingChatAction) => Promise<void>;
  reset: () => void;
}

export const useDrawingChatStore = create<DrawingChatStore>((set, get) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),

  history: [],
  loading: false,

  send: async (content) => {
    const trimmed = content.trim();
    if (trimmed.length === 0 || get().loading) return;
    const userMessage: DrawingChatMessage = {
      id: chatMessageId(),
      role: 'USER',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    set((s) => ({
      history: [...s.history, userMessage],
      loading: true,
    }));
    const doc = useDrawingStore.getState().document;
    try {
      const res = await fetch('/api/admin/cad/drawing-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc,
          history: [...get().history],
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        reply?: string;
        action?: DrawingChatAction | null;
        error?: string;
      };
      if (!res.ok) {
        appendAi(set, `⚠ ${json.error ?? `Drawing chat failed (${res.status}).`}`, undefined);
        return;
      }
      appendAi(
        set,
        typeof json.reply === 'string' && json.reply.length > 0
          ? json.reply
          : '(empty reply)',
        json.action ?? undefined
      );
    } catch (err) {
      appendAi(
        set,
        `⚠ ${err instanceof Error ? err.message : String(err)}`,
        undefined
      );
    } finally {
      set({ loading: false });
    }
  },

  applyAction: async (action) => {
    if (action.type === 'NO_ACTION') return;
    if (action.type === 'UPDATE_TITLE_BLOCK') {
      if (!action.patch || Object.keys(action.patch).length === 0) {
        appendAi(
          set,
          '⚠ UPDATE_TITLE_BLOCK ignored — no fields supplied.',
          undefined
        );
        return;
      }
      const tbPatch: Record<string, string | number | boolean> = {};
      const ignored: string[] = [];
      for (const [k, v] of Object.entries(action.patch)) {
        if (!TITLE_BLOCK_KEYS.has(k)) {
          ignored.push(k);
          continue;
        }
        tbPatch[k] = coerce(v);
      }
      const drawing = useDrawingStore.getState();
      drawing.updateSettings({
        titleBlock: {
          ...drawing.document.settings.titleBlock,
          ...tbPatch,
        },
      });
      const applied = Object.keys(tbPatch);
      appendAi(
        set,
        applied.length > 0
          ? `✓ Updated title block (${applied.join(', ')}).` +
              (ignored.length > 0
                ? ` Ignored unknown field(s): ${ignored.join(', ')}.`
                : '')
          : '⚠ No recognized title-block fields in patch.',
        undefined
      );
      return;
    }
    if (action.type === 'UPDATE_SETTING') {
      if (!action.patch || Object.keys(action.patch).length === 0) {
        appendAi(
          set,
          '⚠ UPDATE_SETTING ignored — no fields supplied.',
          undefined
        );
        return;
      }
      const settingsPatch: Record<string, string | number | boolean> = {};
      const ignored: string[] = [];
      for (const [k, v] of Object.entries(action.patch)) {
        if (!SETTING_KEYS.has(k)) {
          ignored.push(k);
          continue;
        }
        settingsPatch[k] = coerce(v);
      }
      useDrawingStore.getState().updateSettings(settingsPatch);
      const applied = Object.keys(settingsPatch);
      appendAi(
        set,
        applied.length > 0
          ? `✓ Updated settings (${applied.join(', ')}).` +
              (ignored.length > 0
                ? ` Ignored unknown field(s): ${ignored.join(', ')}.`
                : '')
          : '⚠ No recognized settings in patch.',
        undefined
      );
      return;
    }
    if (action.type === 'REDRAW_LAYER') {
      const layerName = action.layerName ?? '(unspecified)';
      appendAi(
        set,
        `↻ REDRAW_LAYER queued for "${layerName}". Partial-` +
          'recompute path lands in a follow-up slice; until ' +
          'then, use REGENERATE_PIPELINE to refresh end-to-end.',
        undefined
      );
      return;
    }
    if (action.type === 'REGENERATE_PIPELINE') {
      const lastPayload = useAIStore.getState().lastPayload;
      if (!lastPayload) {
        appendAi(
          set,
          '⚠ Cannot re-run — open the AI Drawing Engine dialog ' +
            'and run the pipeline first so a payload is cached.',
          undefined
        );
        return;
      }
      const instruction =
        action.instruction && action.instruction.trim().length > 0
          ? action.instruction.trim()
          : action.description;
      const augmentedPrompt = [
        lastPayload.userPrompt ?? '',
        instruction
          ? `Additional instruction from drawing chat: ${instruction}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');
      const nextPayload: AIJobPayload = {
        ...lastPayload,
        userPrompt: augmentedPrompt.length > 0 ? augmentedPrompt : null,
      };
      useAIStore.setState({ status: 'running', error: null });
      try {
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
          useAIStore.setState({ status: 'error', error: msg });
          appendAi(set, `⚠ ${msg}`, undefined);
          return;
        }
        useAIStore.setState({
          status: 'done',
          result: json as AIJobResult,
          error: null,
          lastPayload: nextPayload,
          isQuestionDialogOpen:
            (json as AIJobResult).deliberationResult?.shouldShowDialog ??
            false,
        });
        appendAi(
          set,
          `✓ Pipeline re-ran with the chat instruction. ` +
            `${(json as AIJobResult).features.length} feature(s); ` +
            `${(json as AIJobResult).reviewQueue.summary.totalElements} ` +
            'review item(s).',
          undefined
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        useAIStore.setState({ status: 'error', error: msg });
        appendAi(set, `⚠ ${msg}`, undefined);
      }
      return;
    }
  },

  reset: () => set({ history: [], loading: false }),
}));

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

type SetFn = (
  partial:
    | Partial<DrawingChatStore>
    | ((s: DrawingChatStore) => Partial<DrawingChatStore>)
) => void;

function appendAi(
  set: SetFn,
  text: string,
  action?: DrawingChatAction
): void {
  const message: DrawingChatMessage = {
    id: chatMessageId(),
    role: 'AI',
    content: text,
    timestamp: new Date().toISOString(),
    ...(action ? { action } : {}),
  };
  set((s) => ({ history: [...s.history, message] }));
}

function chatMessageId(): string {
  return (
    'dchat_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 8)
  );
}

function coerce(raw: string): string | number | boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw.length > 0 && /^-?\d+(?:\.\d+)?$/.test(raw)) {
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n)) return n;
  }
  return raw;
}
