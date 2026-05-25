'use client';
// lib/cad/store/ai-conversations-store.ts
//
// CAD_UX_2026_05 §02 — single source of truth for the consolidated AI chat.
// Replaces the three competing chat surfaces (drawing chat panel, inline
// "Ask AI" popup, copilot sidebar) with ONE right-docked (and undockable)
// panel that holds multiple conversation tabs. Each tab is auto-named from
// the focus of its first request, can be renamed, and can be closed.
//
// Conversations + panel placement persist to localStorage so they survive a
// reload (fixing the "forgets the whole conversation" report). The send path
// forwards the full transcript to the drawing-chat engine, which already
// windows + sends a proper multi-turn message array.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type {
  DrawingChatAction,
  DrawingChatMessage,
} from '../ai-engine/drawing-chat';
import type { AIJobPayload, AIJobResult } from '../ai-engine/types';
import { useAIStore } from './ai-store';
import { useDrawingStore } from './drawing-store';

export type ChatDock = 'right' | 'float';

/** An image/file attached to a user turn for the model to analyze. */
export interface ChatAttachment {
  id: string;
  name: string;
  mediaType: string;
  /** base64 data URL (e.g. `data:image/png;base64,...`). */
  dataUrl: string;
}

export interface Conversation {
  id: string;
  title: string;
  /** True until the user renames it; auto-derived from the first request. */
  titleIsAuto: boolean;
  /** Optional focus of the conversation (e.g. "LINE #ab12", "Layer: Fence"). */
  scope: string | null;
  messages: DrawingChatMessage[];
  createdAt: string;
}

export interface PanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const TITLE_BLOCK_KEYS = new Set([
  'firmName', 'surveyorName', 'surveyorLicense', 'projectName', 'projectNumber',
  'clientName', 'surveyDate', 'notes', 'scaleLabel', 'sheetNumber', 'totalSheets',
  'surveyType',
]);
const SETTING_KEYS = new Set([
  'drawingScale', 'paperSize', 'paperOrientation', 'codeDisplayMode', 'drawingRotationDeg',
]);

// ── Pure helpers (unit-tested) ──────────────────────────────────────────────

/** Derive a short tab title from the conversation's focus or first message. */
export function deriveConversationTitle(content: string, scope?: string | null): string {
  const base = (scope && scope.trim().length > 0 ? scope : content).replace(/\s+/g, ' ').trim();
  if (!base) return 'New chat';
  return base.length > 40 ? `${base.slice(0, 39)}…` : base;
}

/**
 * Choose the next active tab when one is closed. If the closed tab wasn't
 * active, the active tab is unchanged. Otherwise pick the neighbour (the one
 * that slides into the closed tab's index), or null when none remain.
 */
export function pickNextActiveId(
  conversations: Conversation[],
  closingId: string,
  currentActiveId: string | null,
): string | null {
  if (currentActiveId !== closingId) return currentActiveId;
  const idx = conversations.findIndex((c) => c.id === closingId);
  const remaining = conversations.filter((c) => c.id !== closingId);
  if (remaining.length === 0) return null;
  const nextIdx = Math.min(Math.max(idx, 0), remaining.length - 1);
  return remaining[nextIdx]?.id ?? null;
}

// ── Store ───────────────────────────────────────────────────────────────────

interface AIConversationsStore {
  conversations: Conversation[];
  activeId: string | null;
  isOpen: boolean;
  dock: ChatDock;
  dockedWidth: number;
  panelRect: PanelRect | null;
  loading: boolean;

  open: () => void;
  close: () => void;
  toggle: () => void;
  setDock: (d: ChatDock) => void;
  setDockedWidth: (w: number) => void;
  setPanelRect: (r: PanelRect) => void;

  /** Open the panel and create/focus a conversation, optionally seeding a prompt. */
  openWith: (opts: { scope?: string | null; seedPrompt?: string }) => void;
  newConversation: () => string;
  closeConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  setActive: (id: string) => void;

  send: (content: string, attachments?: ChatAttachment[]) => Promise<void>;
  applyAction: (action: DrawingChatAction) => Promise<void>;
}

function chatId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeConversation(scope?: string | null): Conversation {
  return {
    id: chatId('conv'),
    title: 'New chat',
    titleIsAuto: true,
    scope: scope ?? null,
    messages: [],
    createdAt: new Date().toISOString(),
  };
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

export const useAIConversationsStore = create<AIConversationsStore>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeId: null,
      isOpen: false,
      dock: 'right',
      dockedWidth: 380,
      panelRect: null,
      loading: false,

      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      setDock: (dock) => set({ dock }),
      setDockedWidth: (dockedWidth) => set({ dockedWidth: Math.max(280, dockedWidth) }),
      setPanelRect: (panelRect) => set({ panelRect }),

      openWith: ({ scope = null, seedPrompt }) => {
        const conv = makeConversation(scope);
        set((s) => ({
          conversations: [...s.conversations, conv],
          activeId: conv.id,
          isOpen: true,
        }));
        if (seedPrompt && seedPrompt.trim().length > 0) {
          void get().send(seedPrompt.trim());
        }
      },

      newConversation: () => {
        const conv = makeConversation();
        set((s) => ({ conversations: [...s.conversations, conv], activeId: conv.id, isOpen: true }));
        return conv.id;
      },

      closeConversation: (id) =>
        set((s) => ({
          conversations: s.conversations.filter((c) => c.id !== id),
          activeId: pickNextActiveId(s.conversations, id, s.activeId),
        })),

      renameConversation: (id, title) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, title: title.trim() || c.title, titleIsAuto: false } : c,
          ),
        })),

      setActive: (id) => set({ activeId: id }),

      send: async (content, attachments) => {
        const trimmed = content.trim();
        if (trimmed.length === 0 || get().loading) return;

        // Ensure there's an active conversation.
        let activeId = get().activeId;
        if (!activeId || !get().conversations.some((c) => c.id === activeId)) {
          activeId = get().newConversation();
        }

        const userMessage: DrawingChatMessage = {
          id: chatId('msg'),
          role: 'USER',
          content: trimmed,
          timestamp: new Date().toISOString(),
          ...(attachments && attachments.length > 0
            ? { attachments: attachments.map((a) => ({ name: a.name, mediaType: a.mediaType, dataUrl: a.dataUrl })) }
            : {}),
        } as DrawingChatMessage;

        set((s) => ({
          loading: true,
          conversations: s.conversations.map((c) => {
            if (c.id !== activeId) return c;
            const messages = [...c.messages, userMessage];
            // Auto-title from the first user turn (or the scope).
            const title =
              c.titleIsAuto && c.messages.length === 0
                ? deriveConversationTitle(trimmed, c.scope)
                : c.title;
            return { ...c, messages, title };
          }),
        }));

        const doc = useDrawingStore.getState().document;
        const history = get().conversations.find((c) => c.id === activeId)?.messages ?? [];
        try {
          const res = await fetch('/api/admin/cad/drawing-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ doc, history }),
          });
          const json = (await res.json().catch(() => ({}))) as {
            reply?: string;
            action?: DrawingChatAction | null;
            error?: string;
          };
          if (!res.ok) {
            appendAi(set, activeId, `⚠ ${json.error ?? `Chat failed (${res.status}).`}`);
            return;
          }
          appendAi(
            set,
            activeId,
            typeof json.reply === 'string' && json.reply.length > 0 ? json.reply : '(empty reply)',
            json.action ?? undefined,
          );
        } catch (err) {
          appendAi(set, activeId, `⚠ ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          set({ loading: false });
        }
      },

      applyAction: async (action) => {
        const activeId = get().activeId;
        if (!activeId) return;
        if (action.type === 'NO_ACTION') return;

        if (action.type === 'UPDATE_TITLE_BLOCK' || action.type === 'UPDATE_SETTING') {
          const keys = action.type === 'UPDATE_TITLE_BLOCK' ? TITLE_BLOCK_KEYS : SETTING_KEYS;
          if (!action.patch || Object.keys(action.patch).length === 0) {
            appendAi(set, activeId, `⚠ ${action.type} ignored — no fields supplied.`);
            return;
          }
          const patch: Record<string, string | number | boolean> = {};
          const ignored: string[] = [];
          for (const [k, v] of Object.entries(action.patch)) {
            if (!keys.has(k)) { ignored.push(k); continue; }
            patch[k] = coerce(v);
          }
          const drawing = useDrawingStore.getState();
          if (action.type === 'UPDATE_TITLE_BLOCK') {
            drawing.updateSettings({ titleBlock: { ...drawing.document.settings.titleBlock, ...patch } });
          } else {
            drawing.updateSettings(patch);
          }
          const applied = Object.keys(patch);
          appendAi(
            set,
            activeId,
            applied.length > 0
              ? `✓ Updated ${applied.join(', ')}.${ignored.length > 0 ? ` Ignored: ${ignored.join(', ')}.` : ''}`
              : '⚠ No recognized fields in patch.',
          );
          return;
        }

        if (action.type === 'REDRAW_LAYER') {
          appendAi(set, activeId, `↻ REDRAW_LAYER queued for "${action.layerName ?? '(unspecified)'}".`);
          return;
        }

        if (action.type === 'REGENERATE_PIPELINE') {
          const lastPayload = useAIStore.getState().lastPayload;
          if (!lastPayload) {
            appendAi(set, activeId, '⚠ Cannot re-run — run the AI pipeline once first.');
            return;
          }
          const instruction =
            action.instruction && action.instruction.trim().length > 0
              ? action.instruction.trim()
              : action.description;
          const augmentedPrompt = [lastPayload.userPrompt ?? '', instruction ? `Additional instruction from chat: ${instruction}` : '']
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
            const json = (await res.json().catch(() => ({}))) as AIJobResult | { error?: string };
            if (!res.ok) {
              const msg = (json as { error?: string }).error ?? `Pipeline re-run failed (${res.status}).`;
              useAIStore.setState({ status: 'error', error: msg });
              appendAi(set, activeId, `⚠ ${msg}`);
              return;
            }
            useAIStore.setState({
              status: 'done',
              result: json as AIJobResult,
              error: null,
              lastPayload: nextPayload,
              isQuestionDialogOpen: (json as AIJobResult).deliberationResult?.shouldShowDialog ?? false,
            });
            appendAi(set, activeId, `✓ Pipeline re-ran. ${(json as AIJobResult).features.length} feature(s).`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            useAIStore.setState({ status: 'error', error: msg });
            appendAi(set, activeId, `⚠ ${msg}`);
          }
          return;
        }
      },
    }),
    {
      name: 'starr-cad-ai-conversations',
      // Persist conversations + placement, but never the in-flight flag.
      partialize: (s) => ({
        conversations: s.conversations,
        activeId: s.activeId,
        dock: s.dock,
        dockedWidth: s.dockedWidth,
        panelRect: s.panelRect,
      }),
    },
  ),
);

type SetFn = (
  partial:
    | Partial<AIConversationsStore>
    | ((s: AIConversationsStore) => Partial<AIConversationsStore>),
) => void;

function appendAi(set: SetFn, conversationId: string, text: string, action?: DrawingChatAction): void {
  const message: DrawingChatMessage = {
    id: chatId('msg'),
    role: 'AI',
    content: text,
    timestamp: new Date().toISOString(),
    ...(action ? { action } : {}),
  };
  set((s) => ({
    conversations: s.conversations.map((c) =>
      c.id === conversationId ? { ...c, messages: [...c.messages, message] } : c,
    ),
  }));
}
