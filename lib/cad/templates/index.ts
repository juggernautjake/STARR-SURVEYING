// lib/cad/templates/index.ts — Re-export all template utilities
export type {
  PaperSize,
  CompanyInfo,
  TitleBlockFields,
  TitleBlockTemplateConfig,
  NorthArrowTemplateConfig,
  ScaleBarTemplateConfig,
  LegendEntryConfig,
  LegendTemplateConfig,
  CertificationTemplateConfig,
  StandardNotesTemplateConfig,
  BorderTemplateConfig,
  DrawingTemplate,
  PrintConfig,
  DrawableArea,
} from './types';

export { PAPER_DIMENSIONS } from './types';

export {
  STANDARD_NOTES,
  getDefaultNotes,
  formatNoteText,
} from './standard-notes';
export type { StandardNote } from './standard-notes';

export {
  DEFAULT_CERTIFICATION_TEXT,
  formatCertificationText,
  DEFAULT_CERTIFICATION_CONFIG,
} from './certification';

export {
  autoPopulateLegend,
  DEFAULT_LEGEND_CONFIG,
} from './legend';
export type { CodeStyleEntry } from './legend';

export {
  computeDrawableArea,
  computeTitleBlockBounds,
  DEFAULT_BORDER_CONFIG,
} from './sheet-border';

export {
  STARR_COMPANY_INFO,
  STARR_SURVEYING_TEMPLATE,
  LETTER_TEMPLATE,
  ARCH_D_TEMPLATE,
} from './default-templates';

export {
  computePrintTransform,
  DEFAULT_PRINT_CONFIG,
  buildPrintTitle,
} from './print-engine';
export type { FeatureExtents, PrintTransform } from './print-engine';
