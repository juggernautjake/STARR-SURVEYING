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
  /** Additional instructions or notes */
  specialInstructions?: string;

  // ── Uploaded files ─────────────────────────────────────────────────
  /** User-uploaded documents (base64 or Supabase storage URLs) */
  uploadedFiles?: UploadedFile[];

  // ── Options ────────────────────────────────────────────────────────
  /** Whether to also research adjacent properties (default false) */
  includeAdjacentProperties?: boolean;
  /** Maximum time in minutes to spend on research (default 30) */
  maxResearchTimeMinutes?: number;
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
