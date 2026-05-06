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

export { importFromDxf } from './dxf-reader';
export type { DxfImportResult } from './dxf-reader';

export { exportToGeoJSON, downloadGeoJSON } from './geojson-writer';
export type { GeoJsonExportOptions } from './geojson-writer';

export { exportToPdf, downloadPdf } from './pdf-writer';
export type { PdfExportOptions, PdfExportResult } from './pdf-writer';

export { generateSurveyDescription } from './description-generator';
export type {
  DescriptionRevision,
  GenerateDescriptionOptions,
  SurveyDescription,
  SurveyNote,
  SurveyNoteCategory,
} from './description-generator';

export {
  buildDeliverableBundle,
  downloadDeliverableBundle,
} from './deliverable-bundle';
export type {
  DeliverableBundle,
  DeliverableBundleInputs,
  DeliverableManifest,
} from './deliverable-bundle';
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
