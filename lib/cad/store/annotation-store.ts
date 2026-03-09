// lib/cad/store/annotation-store.ts — Annotation state management
import { create } from 'zustand';
import type { AnnotationBase } from '../labels/annotation-types';
import type { AutoAnnotateConfig } from '../labels/auto-annotate';
import type { LabelOptConfig, OptimizationResult } from '../labels/label-optimizer';
import { autoAnnotate } from '../labels/auto-annotate';
import { optimizeLabels, DEFAULT_LABEL_OPT_CONFIG } from '../labels/label-optimizer';
import type { Feature, SurveyPoint } from '../types';
import type { Traverse } from '../types';

interface AnnotationState {
  annotations: Record<string, AnnotationBase>;
  optimizerResult: OptimizationResult | null;
}

interface AnnotationStore extends AnnotationState {
  addAnnotation: (annotation: AnnotationBase) => void;
  removeAnnotation: (id: string) => void;
  updateAnnotation: (id: string, updates: Partial<AnnotationBase>) => void;
  clearAllAnnotations: () => void;
  autoAnnotateAll: (
    features: Feature[],
    points: SurveyPoint[],
    traverses: Traverse[],
    config: AutoAnnotateConfig,
  ) => void;
  runOptimizer: (drawingScale: number, config?: LabelOptConfig) => void;
  getAnnotation: (id: string) => AnnotationBase | undefined;
  getAnnotationsForFeature: (featureId: string) => AnnotationBase[];
  getAnnotationsByType: (type: AnnotationBase['type']) => AnnotationBase[];
  getAllAnnotations: () => AnnotationBase[];
  getFlaggedAnnotations: () => AnnotationBase[];
}

export const useAnnotationStore = create<AnnotationStore>((set, get) => ({
  annotations: {},
  optimizerResult: null,

  addAnnotation: (annotation) =>
    set((s) => ({ annotations: { ...s.annotations, [annotation.id]: annotation } })),

  removeAnnotation: (id) =>
    set((s) => {
      const next = { ...s.annotations };
      delete next[id];
      return { annotations: next };
    }),

  updateAnnotation: (id, updates) =>
    set((s) => ({
      annotations: {
        ...s.annotations,
        [id]: { ...s.annotations[id], ...updates } as AnnotationBase,
      },
    })),

  clearAllAnnotations: () => set({ annotations: {}, optimizerResult: null }),

  autoAnnotateAll: (features, points, traverses, config) => {
    const generated = autoAnnotate(features, points, traverses, config);
    const record: Record<string, AnnotationBase> = {};
    for (const a of generated) record[a.id] = a;
    set({ annotations: record, optimizerResult: null });
  },

  runOptimizer: (drawingScale, config = DEFAULT_LABEL_OPT_CONFIG) => {
    const annotations = Object.values(get().annotations);
    const result = optimizeLabels(annotations, drawingScale, config);
    set({ optimizerResult: result });
  },

  getAnnotation: (id) => get().annotations[id],

  getAnnotationsForFeature: (featureId) =>
    Object.values(get().annotations).filter((a) => a.linkedFeatureId === featureId),

  getAnnotationsByType: (type) =>
    Object.values(get().annotations).filter((a) => a.type === type),

  getAllAnnotations: () => Object.values(get().annotations),

  getFlaggedAnnotations: () => {
    const result = get().optimizerResult;
    if (!result) return [];
    return result.flaggedForManual
      .map((id) => get().annotations[id])
      .filter(Boolean) as AnnotationBase[];
  },
}));
