/**
 * Bell County Research Input — what the user provides on the input form.
 * At least one identifying field must be provided.
 */
export interface BellResearchInput {
  /** Supabase project ID for status updates and storage */
  projectId: string;

  // ── Identifying fields (at least one required) ─────────────────────
  /** Property street address (e.g., "3779 W FM 436, Belton, TX 76513") */
  address?: string;
  /**
   * The same address in the SEPARATE FIELDS the operator filled in (seed 624).
   *
   * `address` above is a display line. Deriving the street name back out of it is what
   * `research/address-parts.ts` exists to stop: the Bell CAD scraper's own parser strips the city
   * with a hardcoded list of fifteen Bell-area towns, so any other county's city stays inside the
   * street name and the CAD is asked for a street that does not exist.
   */
  addressParts?: import('../../../research/address-parts.js').AddressParts;
  /** Bell CAD property ID / account number */
  propertyId?: string;
  /** Current or historical owner name */
  ownerName?: string;
  /** Deed instrument number */
  instrumentNumber?: string;

  // ── Optional context ───────────────────────────────────────────────
  /** Type of survey being performed */
  surveyType?: SurveyType;
  /** Purpose of the survey */
  jobPurpose?: string;
  /**
   * Additional instructions or notes.
   *
   * Nothing sends this and nothing in a run reads it — `generateSurveyPlan` is its only reader
   * and no run calls that. Left in place rather than deleted because the survey-plan generator
   * is real code with a real use; `operatorNotes` below is the field the app actually fills.
   */
  specialInstructions?: string;
  /**
   * What the operator wrote about this property — intake notes plus this run's notes.
   *
   * Reaches the deed-summary prompt in Phase 3. "The neighbour disputes the fence line" is
   * exactly the kind of fact a title examiner would want before reading a chain, and it was
   * being typed into a box that led nowhere.
   */
  operatorNotes?: string;
  /** Fired at "Phase 1 complete" — see `research/run-order.ts`. */
  onPropertyIdentified?: import('../../../research/run-order.js').OnPropertyIdentified;

  // ── Uploaded files ─────────────────────────────────────────────────
  /** User-uploaded documents (base64 or Supabase storage URLs) */
  uploadedFiles?: UploadedFile[];

  // ── Options ────────────────────────────────────────────────────────
  /** Whether to also research adjacent properties (default false) */
  includeAdjacentProperties?: boolean;
  /** Maximum time in minutes to spend on research (default 30) */
  maxResearchTimeMinutes?: number;
  /** Maximum USD this run may spend — AI, paid pages, captcha solves.
   *  Clamped to MAX_COST_CEILING_USD by limitsFor(); 0 means free sources only. */
  maxCostUsd?: number;
}

export type SurveyType =
  | 'boundary'
  | 'alta'
  | 'topographic'
  | 'subdivision'
  | 'easement'
  | 'right-of-way'
  | 'as-built'
  | 'construction'
  | 'elevation'
  | 'other';

export interface UploadedFile {
  /** Original filename */
  name: string;
  /** MIME type */
  mimeType: string;
  /** Base64 encoded content, or Supabase storage URL */
  content: string;
  /** Whether content is a URL (true) or base64 (false) */
  isUrl?: boolean;
  /** User-provided description of this file */
  description?: string;
}
