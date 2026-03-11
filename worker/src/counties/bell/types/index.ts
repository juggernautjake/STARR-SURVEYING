/**
 * Bell County Research System — Type Definitions
 *
 * All types specific to the Bell County property research pipeline.
 * These types define the input, output, and intermediate data structures
 * used exclusively by the Bell County folder code.
 */

export type { BellResearchInput } from './research-input';
export type {
  BellResearchResult,
  DeedRecord,
  PlatRecord,
  EasementRecord,
  FemaFloodInfo,
  TxDotRowInfo,
  AdjacentProperty,
  ResearchedLink,
  DiscrepancyItem,
  ScreenshotCapture,
  SiteIntelligenceNote,
  ToggleSection,
  SurveyPlan,
  PlatLayer,
  FieldStep,
} from './research-result';
export type { ConfidenceRating, ConfidenceFactors } from './confidence';
