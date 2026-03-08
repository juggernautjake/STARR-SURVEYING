// lib/cad/labels/index.ts — Re-export label utilities
export {
  generateLabelsForFeature,
  regenerateLayerLabels,
  resolveLayerDisplayPrefs,
  formatDistance,
  formatBearingForDisplay,
  formatArea,
  formatCoordinates,
} from './generate-labels';

// Annotation types
export type {
  AnnotationType,
  AnnotationBase,
  BearingDistanceDimension,
  CurveDataAnnotation,
  MonumentLabel,
  AreaAnnotation,
  TextAnnotation,
  LeaderAnnotation,
  Annotation,
} from './annotation-types';

// Bearing dimension
export {
  createBearingDimension,
  computeBearingDimPlacement,
  DEFAULT_BEARING_DIM_CONFIG,
} from './bearing-dim';
export type { BearingDimConfig } from './bearing-dim';

// Curve label
export {
  createCurveDataAnnotation,
  buildCurveDataLines,
  computeCurveLabelPosition,
  DEFAULT_CURVE_DATA_CONFIG,
} from './curve-label';
export type { CurveDataConfig } from './curve-label';

// Monument label
export {
  createMonumentLabel,
  getMonumentText,
  computeMonumentLabelPosition,
  pickBestOffsetAngle,
  DEFAULT_MONUMENT_LABEL_CONFIG,
} from './monument-label';
export type { MonumentLabelConfig } from './monument-label';

// Area label
export {
  createAreaAnnotation,
  buildAreaText,
  computeCentroid,
  DEFAULT_AREA_LABEL_CONFIG,
} from './area-label';
export type { AreaLabelConfig } from './area-label';

// Auto-annotate
export {
  autoAnnotate,
  DEFAULT_AUTO_ANNOTATE_CONFIG,
} from './auto-annotate';
export type { AutoAnnotateConfig } from './auto-annotate';

// Label optimizer
export {
  optimizeLabels,
  DEFAULT_LABEL_OPT_CONFIG,
} from './label-optimizer';
export type {
  LabelOptConfig,
  LabelRect,
  LabelPlacement,
  OptimizationResult,
} from './label-optimizer';
