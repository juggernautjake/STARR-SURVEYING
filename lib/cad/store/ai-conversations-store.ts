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
  ChatCoord,
} from '../ai-engine/drawing-chat';
import type { AIJobPayload, AIJobResult } from '../ai-engine/types';
import type { Feature, FeatureGeometry, Point2D, UndoOperation } from '../types';
import { generateId } from '../types';
import { DEFAULT_FEATURE_STYLE } from '../constants';
import { transformFeature, translate, rotate, scale } from '../geometry/transform';
import { fitPointsToBezier, arcFrom3Points } from '../geometry/curve-render';
import { fitOrientedRectangle, fitCircle, fitLine } from '../geometry/fit';
import { useAIStore } from './ai-store';
import { useDrawingStore } from './drawing-store';
import { useSelectionStore } from './selection-store';
import { useUndoStore, makeBatchEntry } from './undo-store';

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
        };

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
        // Send the live canvas selection so the model can answer about
        // exactly what the user has highlighted ("these points", etc.).
        const selectedIds = Array.from(useSelectionStore.getState().selectedIds);
        try {
          const res = await fetch('/api/admin/cad/drawing-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ doc, history, selectedIds }),
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

        if (action.type === 'EDIT_DRAWING') {
          const summary = applyEditDrawing(action);
          appendAi(set, activeId, summary);
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

// ────────────────────────────────────────────────────────────
// EDIT_DRAWING executor — applies the model's programmatic geometry
// edits (add / modify / transform / delete) as one undoable batch.
// All incoming coordinates are survey northing/easting (the frame the
// model is shown); converted to world here.
// ────────────────────────────────────────────────────────────
export function applyEditDrawing(action: DrawingChatAction): string {
  const drawing = useDrawingStore.getState();
  const doc = drawing.document;
  const originN = doc.settings.displayPreferences?.originNorthing ?? 0;
  const originE = doc.settings.displayPreferences?.originEasting ?? 0;
  const toWorld = (c: ChatCoord): Point2D => ({ x: c.easting - originE, y: c.northing - originN });

  const ops: UndoOperation[] = [];
  const notes: string[] = [];

  // Find a layer by (case-insensitive) name, creating it if missing so the
  // AI can place geometry on STRUCTURES/FENCE/etc. without a separate step.
  const ensureLayer = (name?: string, color?: string): string => {
    if (name && name.trim()) {
      const match = Object.values(useDrawingStore.getState().document.layers).find(
        (l) => l.name.toLowerCase() === name.toLowerCase(),
      );
      if (match) {
        if (color && match.color !== color) drawing.updateLayer(match.id, { color });
        return match.id;
      }
      const id = generateId();
      const order = Object.keys(useDrawingStore.getState().document.layers).length;
      drawing.addLayer({
        id, name: name.trim(), visible: true, locked: false, frozen: false,
        color: color ?? '#000000', lineWeight: 0.5, lineTypeId: 'SOLID',
        opacity: 1, groupId: null, sortOrder: order, isDefault: false,
        isProtected: false, autoAssignCodes: [],
      });
      return id;
    }
    return drawing.activeLayerId || Object.keys(doc.layers)[0] || '';
  };
  const layerIdByName = (name?: string): string => ensureLayer(name);

  // ── createLayers (explicit) ──
  let layersCreated = 0;
  for (const spec of action.createLayers ?? []) {
    const existed = Object.values(useDrawingStore.getState().document.layers)
      .some((l) => l.name.toLowerCase() === spec.name.toLowerCase());
    ensureLayer(spec.name, spec.color);
    if (!existed) layersCreated += 1;
  }
  if (layersCreated) notes.push(`created ${layersCreated} layer${layersCreated === 1 ? '' : 's'}`);

  // ── add ──
  let added = 0;
  for (const spec of action.add ?? []) {
    const pts = spec.points.map(toWorld);
    let geometry: FeatureGeometry | null = null;
    let type: Feature['type'] = 'POINT';
    switch (spec.shape) {
      case 'POINT': if (pts[0]) { geometry = { type: 'POINT', point: pts[0] }; type = 'POINT'; } break;
      case 'LINE': if (pts.length >= 2) { geometry = { type: 'LINE', start: pts[0], end: pts[1] }; type = 'LINE'; } break;
      case 'POLYLINE': if (pts.length >= 2) { geometry = { type: 'POLYLINE', vertices: pts }; type = 'POLYLINE'; } break;
      case 'POLYGON': if (pts.length >= 3) { geometry = { type: 'POLYGON', vertices: pts }; type = 'POLYGON'; } break;
      case 'SPLINE': if (pts.length >= 2) { geometry = { type: 'SPLINE', spline: { controlPoints: fitPointsToBezier(pts, !!spec.closed), isClosed: !!spec.closed } }; type = 'SPLINE'; } break;
      case 'CIRCLE': {
        const center = pts[0];
        const radius = spec.radius != null ? spec.radius : (pts[1] ? Math.hypot(pts[1].x - center.x, pts[1].y - center.y) : 0);
        if (center && radius > 0) { geometry = { type: 'CIRCLE', circle: { center, radius } }; type = 'CIRCLE'; }
        break;
      }
      case 'ELLIPSE': {
        const center = pts[0];
        const rx = spec.radiusX ?? 0; const ry = spec.radiusY ?? 0;
        if (center && rx > 0 && ry > 0) { geometry = { type: 'ELLIPSE', ellipse: { center, radiusX: rx, radiusY: ry, rotation: ((spec.rotationDeg ?? 0) * Math.PI) / 180 } }; type = 'ELLIPSE'; }
        break;
      }
      case 'ARC': if (pts.length >= 3) { const arc = arcFrom3Points(pts[0], pts[1], pts[2]); if (arc) { geometry = { type: 'ARC', arc }; type = 'ARC'; } } break;
      case 'TEXT': if (pts[0] && spec.text && spec.text.trim()) { geometry = { type: 'TEXT', point: pts[0], textContent: spec.text, textRotation: ((spec.rotationDeg ?? 0) * Math.PI) / 180 }; type = 'TEXT'; } break;
    }
    if (!geometry) continue;
    const baseStyle = { ...DEFAULT_FEATURE_STYLE, ...drawing.getActiveLayerStyle() };
    const style = {
      ...baseStyle,
      ...(spec.color ? { color: spec.color } : {}),
      ...(spec.opacity != null ? { opacity: Math.max(0, Math.min(1, spec.opacity)) } : {}),
      ...(spec.lineWeight != null ? { lineWeight: spec.lineWeight } : {}),
    };
    const feature: Feature = {
      id: generateId(),
      type,
      geometry,
      layerId: layerIdByName(spec.layerName),
      style,
      properties: {
        ...(spec.pointNumber ? { pointNumber: spec.pointNumber } : {}),
        ...(spec.code ? { code: spec.code } : {}),
        ...(spec.description ? { description: spec.description } : {}),
      },
    };
    drawing.addFeature(feature);
    ops.push({ type: 'ADD_FEATURE', data: feature });
    added += 1;
  }
  if (added) notes.push(`added ${added} feature${added === 1 ? '' : 's'}`);

  // ── fit (exact best-fit shape from a point set) ──
  let fitted = 0;
  for (const spec of action.fit ?? []) {
    const srcPts: Point2D[] = [];
    for (const id of spec.fromIds ?? []) {
      const f = drawing.getFeature(id);
      if (f) srcPts.push(...featurePoints(f));
    }
    for (const c of spec.points ?? []) srcPts.push(toWorld(c));
    if (srcPts.length < 2) continue;

    let geometry: FeatureGeometry | null = null;
    let type: Feature['type'] = 'POLYGON';
    if (spec.shape === 'RECTANGLE') {
      const corners = fitOrientedRectangle(srcPts);
      if (corners) { geometry = { type: 'POLYGON', vertices: corners }; type = 'POLYGON'; }
    } else if (spec.shape === 'CIRCLE') {
      const c = fitCircle(srcPts);
      if (c && c.radius > 0) { geometry = { type: 'CIRCLE', circle: c }; type = 'CIRCLE'; }
    } else if (spec.shape === 'LINE') {
      const l = fitLine(srcPts);
      if (l) { geometry = { type: 'LINE', start: l.start, end: l.end }; type = 'LINE'; }
    } else if (spec.shape === 'CURVE') {
      geometry = { type: 'SPLINE', spline: { controlPoints: fitPointsToBezier(srcPts, !!spec.closed), isClosed: !!spec.closed } };
      type = 'SPLINE';
    }
    if (!geometry) continue;

    const baseStyle = { ...DEFAULT_FEATURE_STYLE, ...drawing.getActiveLayerStyle() };
    const style = {
      ...baseStyle,
      ...(spec.color ? { color: spec.color } : {}),
      ...(spec.opacity != null ? { opacity: Math.max(0, Math.min(1, spec.opacity)) } : {}),
      ...(spec.lineWeight != null ? { lineWeight: spec.lineWeight } : {}),
    };
    const feature: Feature = {
      id: generateId(), type, geometry,
      layerId: layerIdByName(spec.layerName),
      style, properties: {},
    };
    drawing.addFeature(feature);
    ops.push({ type: 'ADD_FEATURE', data: feature });
    fitted += 1;

    if (spec.deleteSource) {
      const sel = useSelectionStore.getState();
      for (const id of spec.fromIds ?? []) {
        const f = drawing.getFeature(id);
        if (!f) continue;
        const snap = JSON.parse(JSON.stringify(f)) as Feature;
        drawing.removeFeature(id);
        sel.select(id, 'REMOVE');
        ops.push({ type: 'REMOVE_FEATURE', data: snap });
      }
    }
  }
  if (fitted) notes.push(`fit ${fitted} shape${fitted === 1 ? '' : 's'}`);

  // ── modify (geometry and/or style) ──
  let modified = 0;
  for (const m of action.modify ?? []) {
    const before = drawing.getFeature(m.id);
    if (!before) continue;
    const beforeSnap = JSON.parse(JSON.stringify(before)) as Feature;
    if (m.points && m.points.length > 0) {
      const pts = m.points.map(toWorld);
      const g = { ...before.geometry } as FeatureGeometry;
      if (g.type === 'POINT' && pts[0]) g.point = pts[0];
      else if (g.type === 'LINE' && pts.length >= 2) { g.start = pts[0]; g.end = pts[1]; }
      else if ((g.type === 'POLYLINE' || g.type === 'POLYGON') && pts.length >= 2) g.vertices = pts;
      else if (g.type === 'SPLINE' && g.spline && pts.length >= 2) g.spline = { ...g.spline, controlPoints: fitPointsToBezier(pts, g.spline.isClosed) };
      drawing.updateFeatureGeometry(m.id, g);
    }
    if (m.color || m.opacity != null || m.lineWeight != null) {
      drawing.updateFeature(m.id, {
        style: {
          ...drawing.getFeature(m.id)!.style,
          ...(m.color ? { color: m.color } : {}),
          ...(m.opacity != null ? { opacity: Math.max(0, Math.min(1, m.opacity)) } : {}),
          ...(m.lineWeight != null ? { lineWeight: m.lineWeight } : {}),
        },
      });
    }
    const after = drawing.getFeature(m.id);
    if (after) { ops.push({ type: 'MODIFY_FEATURE', data: { id: m.id, before: beforeSnap, after } }); modified += 1; }
  }
  if (modified) notes.push(`edited ${modified}`);

  // ── transform (translate / rotate / scale) ──
  if (action.transform) {
    const t = action.transform;
    const ids = t.ids === 'SELECTION'
      ? Array.from(useSelectionStore.getState().selectedIds)
      : t.ids;
    const feats = ids.map((id) => drawing.getFeature(id)).filter((f): f is Feature => !!f);
    if (feats.length > 0) {
      let pivot: Point2D;
      if (t.about && t.about !== 'CENTROID') {
        pivot = toWorld(t.about);
      } else {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const f of feats) for (const p of featurePoints(f)) {
          minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
        }
        pivot = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
      }
      const dx = t.translate?.east ?? 0;
      const dy = t.translate?.north ?? 0;
      const rad = t.rotateDeg ? (t.rotateDeg * Math.PI) / 180 : 0;
      const sc = t.scale ?? 1;
      const fn = (p: Point2D): Point2D => {
        let q = p;
        if (sc !== 1) q = scale(q, pivot, sc);
        if (rad !== 0) q = rotate(q, pivot, rad);
        if (dx !== 0 || dy !== 0) q = translate(q, dx, dy);
        return q;
      };
      let transformed = 0;
      for (const f of feats) {
        const beforeSnap = JSON.parse(JSON.stringify(f)) as Feature;
        const moved = transformFeature(f, fn);
        drawing.updateFeature(f.id, { geometry: moved.geometry });
        const after = drawing.getFeature(f.id);
        if (after) { ops.push({ type: 'MODIFY_FEATURE', data: { id: f.id, before: beforeSnap, after } }); transformed += 1; }
      }
      if (transformed) notes.push(`transformed ${transformed}`);
    }
  }

  // ── delete (last, so added/modified ids stay valid above) ──
  let deleted = 0;
  const sel = useSelectionStore.getState();
  for (const id of action.deleteIds ?? []) {
    const f = drawing.getFeature(id);
    if (!f) continue;
    const snap = JSON.parse(JSON.stringify(f)) as Feature;
    drawing.removeFeature(id);
    sel.select(id, 'REMOVE');
    ops.push({ type: 'REMOVE_FEATURE', data: snap });
    deleted += 1;
  }
  if (deleted) notes.push(`deleted ${deleted}`);

  if (ops.length === 0 && notes.length === 0) return '⚠ No valid geometry edits in the action.';
  // Layer creation isn't a feature op; only push undo when geometry changed.
  if (ops.length > 0) {
    useUndoStore.getState().pushUndo(makeBatchEntry(action.description || 'AI drawing edit', ops));
  }
  return `✓ ${notes.join(', ')}.`;
}

function featurePoints(f: Feature): Point2D[] {
  const g = f.geometry;
  const out: Point2D[] = [];
  if (g.point) out.push(g.point);
  if (g.start) out.push(g.start);
  if (g.end) out.push(g.end);
  if (g.vertices) out.push(...g.vertices);
  if (g.circle) out.push(g.circle.center);
  if (g.arc) out.push(g.arc.center);
  if (g.ellipse) out.push(g.ellipse.center);
  if (g.spline) out.push(...g.spline.controlPoints);
  return out;
}
