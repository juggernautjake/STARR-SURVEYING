// lib/cad/delivery/index.ts
// Phase 7 — final-delivery package barrel. Hosts the
// completeness checker today; RPLS workflow, seal engine,
// export pipelines, and deliverable orchestration land in
// follow-up slices.

export {
  checkDrawingCompleteness,
  summarizeCompleteness,
} from './completeness-checker';
export type {
  CompletenessCheck,
  CompletenessInputs,
  CompletenessSeverity,
  CompletenessSummary,
} from './completeness-checker';

export {
  appendComment,
  canTransition,
  createDraftRecord,
  runTransition,
  transitionEvent,
} from './rpls-workflow';
export {
  applySeal,
  buildSealData,
  computeDrawingHash,
  verifyDrawingSeal,
} from './seal-engine';
export type {
  BuildSealInputs,
  SealData,
  SealType,
} from './seal-engine';

export { exportToDxf, downloadDxf } from './dxf-writer';
export type { DxfExportOptions } from './dxf-writer';
export type {
  CreateRecordInputs,
  RPLSReviewEvent,
  RPLSReviewEventType,
  RPLSReviewRecord,
  RPLSWorkflowStatus,
  TransitionError,
  TransitionInputs,
  TransitionResult,
} from './rpls-workflow';
