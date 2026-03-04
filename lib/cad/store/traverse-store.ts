// lib/cad/store/traverse-store.ts — Traverse state management
import { create } from 'zustand';
import type { Traverse, AdjustmentMethod, Point2D } from '../types';
import { computeClosure, bowditchAdjustment, transitAdjustment } from '../geometry/closure';

interface TraverseStore {
  traverses: Record<string, Traverse>;
  activeTraverseId: string | null;

  createTraverse: (traverse: Traverse) => void;
  deleteTraverse: (id: string) => void;
  updateTraverse: (id: string, updates: Partial<Traverse>) => void;
  addPointToTraverse: (traverseId: string, pointId: string, index?: number) => void;
  removePointFromTraverse: (traverseId: string, pointId: string) => void;
  reorderTraversePoints: (traverseId: string, pointIds: string[]) => void;
  recomputeClosure: (traverseId: string) => void;
  adjustTraverse: (traverseId: string, method: AdjustmentMethod) => void;
  setActiveTraverse: (id: string | null) => void;
}

export const useTraverseStore = create<TraverseStore>((set, get) => ({
  traverses: {},
  activeTraverseId: null,

  createTraverse: (traverse) =>
    set((s) => ({
      traverses: { ...s.traverses, [traverse.id]: traverse },
      activeTraverseId: traverse.id,
    })),

  deleteTraverse: (id) =>
    set((s) => {
      const next = { ...s.traverses };
      delete next[id];
      return {
        traverses: next,
        activeTraverseId: s.activeTraverseId === id ? null : s.activeTraverseId,
      };
    }),

  updateTraverse: (id, updates) =>
    set((s) => ({
      traverses: {
        ...s.traverses,
        [id]: { ...s.traverses[id], ...updates },
      },
    })),

  addPointToTraverse: (traverseId, pointId, index) =>
    set((s) => {
      const t = s.traverses[traverseId];
      if (!t) return s;
      const pts = [...t.pointIds];
      if (index !== undefined) {
        pts.splice(index, 0, pointId);
      } else {
        pts.push(pointId);
      }
      return {
        traverses: { ...s.traverses, [traverseId]: { ...t, pointIds: pts } },
      };
    }),

  removePointFromTraverse: (traverseId, pointId) =>
    set((s) => {
      const t = s.traverses[traverseId];
      if (!t) return s;
      return {
        traverses: {
          ...s.traverses,
          [traverseId]: { ...t, pointIds: t.pointIds.filter((id) => id !== pointId) },
        },
      };
    }),

  reorderTraversePoints: (traverseId, pointIds) =>
    set((s) => {
      const t = s.traverses[traverseId];
      if (!t) return s;
      return {
        traverses: { ...s.traverses, [traverseId]: { ...t, pointIds } },
      };
    }),

  recomputeClosure: (traverseId) =>
    set((s) => {
      const t = s.traverses[traverseId];
      if (!t || !t.isClosed) return s;
      const closure = computeClosure(t);
      return {
        traverses: { ...s.traverses, [traverseId]: { ...t, closure } },
      };
    }),

  adjustTraverse: (traverseId, method) =>
    set((s) => {
      const t = s.traverses[traverseId];
      if (!t) return s;
      let adjustedPoints: Point2D[] | null = null;
      if (method === 'COMPASS') {
        adjustedPoints = bowditchAdjustment(t);
      } else if (method === 'TRANSIT') {
        adjustedPoints = transitAdjustment(t);
      }
      return {
        traverses: {
          ...s.traverses,
          [traverseId]: { ...t, adjustedPoints, adjustmentMethod: method },
        },
      };
    }),

  setActiveTraverse: (id) => set({ activeTraverseId: id }),
}));
