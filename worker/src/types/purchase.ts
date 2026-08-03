// worker/src/types/purchase.ts — Phase 9: Document Purchase & Automated Re-Analysis
// All TypeScript interfaces for the DocumentPurchaseOrchestrator.
//
// Spec §9 — Phase 9 Deliverable: PurchaseReport

// ── Purchase Configuration ──────────────────────────────────────────────────

export type PurchaseVendor =
  | 'kofile'
  | 'kofile_pay'
  | 'texasfile'
  | 'tyler_pay'
  | 'henschen_pay'
  | 'idocket_pay'
  | 'fidlar_pay'
  | 'govos_direct'
  | 'landex'
  | 'cs_lexi'
  | 'county_direct'
  | 'county_direct_pay'
  | 'txdot'
  | 'txdot_docs'
  | 'glo_archives';

export type PurchaseStatus =
  | 'purchased'
  | 'failed'
  | 'already_owned'
  | 'not_available'
  | 'budget_exceeded'
  | 'skipped';

export type PaymentMethodId =
  | 'account_balance'
  | 'credit_card'
  | 'debit_card'
  | 'texasfile_wallet'
  | 'kofile_wallet'
  | 'tyler_wallet'
  | 'henschen_account'
  | 'idocket_subscription'
  | 'fidlar_account'
  | 'govos_credit_card'
  | 'landex_api'
  | 'cs_lexi_account'
  | 'stripe_passthrough'; // Starr charges user, then pays platform

export interface KofileCredentials {
  username: string;
  password: string;
  paymentOnFile: boolean;
}

export interface TexasFileCredentials {
  username: string;
  password: string;
  accountType: 'pay_per_page' | 'subscription';
}

export interface TylerPayCredentials {
  username: string;
  password: string;
  /** Base URL for Tyler/Odyssey county system (varies per county) */
  baseUrl?: string;
}

export interface HenschenPayCredentials {
  username: string;
  password: string;
  /** Per-county Henschen portal URL */
  portalUrl?: string;
}

export interface IDocketPayCredentials {
  username: string;
  password: string;
}

export interface FidlarPayCredentials {
  username: string;
  password: string;
}

export interface GovOSDirectCredentials {
  /** GovOS allows guest checkout (no account); supply credit card token */
  creditCardToken?: string;
  accountUsername?: string;
  accountPassword?: string;
}

export interface LandExCredentials {
  apiKey: string;
  accountId: string;
}

export interface CSLexiCredentials {
  username: string;
  password: string;
}

export interface PurchaseOrchestratorConfig {
  kofileCredentials?: KofileCredentials;
  texasfileCredentials?: TexasFileCredentials;
  tylerPayCredentials?: TylerPayCredentials;
  henschenPayCredentials?: HenschenPayCredentials;
  idocketPayCredentials?: IDocketPayCredentials;
  fidlarPayCredentials?: FidlarPayCredentials;
  govosDirectCredentials?: GovOSDirectCredentials;
  landexCredentials?: LandExCredentials;
  csLexiCredentials?: CSLexiCredentials;
  budget: number;
  autoReanalyze: boolean;
  /** If true (default), always try free/watermarked images before paid */
  tryFreeFirst?: boolean;
  /** Max cost per document in USD; skip if exceeded */
  maxCostPerDocument?: number;
}

// ── Image Quality ───────────────────────────────────────────────────────────

export interface ImageQuality {
  format: string;          // TIFF, PNG, PDF
  resolution?: string;     // e.g. "300dpi"
  dimensions?: { width: number; height: number };
  hasWatermark: boolean;
  qualityScore: number;    // 0-100
}

/** Phase 15 image quality shape returned by automated purchase adapters. */
export interface AutomatedImageQuality {
  overallScore: number;     // 0–100
  resolution: number;       // DPI (e.g. 300)
  hasWatermark: boolean;
  isReadable: boolean;
  pageCount: number;
}

// ── Purchase Result (per-document) ──────────────────────────────────────────

export interface DocumentPurchaseResult {
  // ── Phase 9 fields (classic purchase orchestrator) ─────────────────────
  instrument?: string;
  documentType: string;
  source?: string;
  status?: PurchaseStatus;
  pages: number;
  costPerPage?: number;
  totalCost?: number;
  paymentMethod: PaymentMethodId | string;
  transactionId?: string | null;
  downloadedImages?: string[];
  imageQuality?: ImageQuality;
  error?: string;

  // ── Phase 15 fields (automated purchase adapters) ──────────────────────
  /** Whether the purchase attempt succeeded */
  success?: boolean;
  /** Platform identifier */
  vendor?: PurchaseVendor;
  /** Instrument number purchased */
  instrumentNumber?: string;
  /** Downloaded file paths on the worker droplet */
  imagePaths?: string[];
  /** Total cost in USD */
  totalCostUsd?: number;
  /** Structured image quality from Phase 15 adapters */
  quality?: AutomatedImageQuality;
  /** ISO timestamp when documents were downloaded */
  downloadedAt?: string;
  /** Elapsed time of the purchase operation in ms */
  elapsedMs?: number;
}

// ── Watermark Comparison ────────────────────────────────────────────────────

export interface ReadingComparison {
  callId: string;
  field: 'bearing' | 'distance' | 'curve_radius' | 'curve_arc' | 'curve_delta';
  watermarkedValue: string | number | null;
  officialValue: string | number | null;
  changed: boolean;
  watermarkedConfidence: number;
  officialConfidence: number;
  confidenceGain: number;
  notes: string | null;
}

export interface ComparisonReport {
  documentInstrument: string;
  documentType: string;
  totalCallsCompared: number;
  callsChanged: number;
  callsConfirmed: number;
  averageConfidenceGain: number;
  comparisons: ReadingComparison[];
  significantChanges: ReadingComparison[];
}

// ── Billing & Transaction Tracking ──────────────────────────────────────────

export type TransactionStatus = 'completed' | 'failed' | 'refunded';

export interface Transaction {
  transactionId: string;
  projectId: string;
  instrument: string;
  documentType: string;
  source: string;
  pages: number;
  costPerPage: number;
  totalCost: number;
  paymentMethod: string;
  timestamp: string;
  status: TransactionStatus;
}

export interface ProjectBilling {
  projectId: string;
  transactions: Transaction[];
  totalSpent: number;
  budget: number;
  remainingBudget: number;
}

export interface BillingInvoice {
  projectId: string;
  generatedAt: string;
  transactions: Transaction[];
  summary: {
    totalDocuments: number;
    totalPages: number;
    totalCost: number;
    budget: number;
    remaining: number;
  };
}

// ── Re-Analysis Results ─────────────────────────────────────────────────────

export interface ReanalysisCallImprovement {
  callId: string;
  field: 'bearing' | 'distance';
  watermarkedValue: string | number | null;
  officialValue: string | number | null;
  changed: boolean;
  watermarkedConfidence: number;
  officialConfidence: number;
  confidenceGain: number;
  notes?: string;
}

export interface DocumentReanalysis {
  documentType: string;
  instrument: string;
  totalCallsExtracted: number;
  callsChanged: number;
  callsConfirmed: number;
  averageConfidenceGain: number;
  improvements: ReanalysisCallImprovement[];
}

export interface DiscrepancyResolution {
  discrepancyId: string;
  previousStatus: 'unresolved';
  newStatus: 'resolved';
  resolution: string;
  previousConfidence: number;
  newConfidence: number;
}

export interface ReconciliationUpdate {
  previousOverallConfidence: number;
  newOverallConfidence: number;
  confidenceGain: number;
  previousClosureRatio: string;
  newClosureRatio: string;
  closureImproved: boolean;
  allDiscrepanciesResolved: boolean;
  savedTo: string;
}

export interface PurchaseBillingSummary {
  totalDocumentCost: number;
  taxOrFees: number;
  totalCharged: number;
  paymentMethod: string;
  remainingBalance: number;
  invoicePath: string;
}

// ── Final PurchaseReport (the Phase 9 deliverable) ──────────────────────────

export interface PurchaseReport {
  status: 'complete' | 'partial' | 'failed' | 'no_purchases_needed';

  projectId: string;
  purchases: DocumentPurchaseResult[];

  reanalysis: {
    status: 'complete' | 'partial' | 'skipped' | 'failed';
    documentReanalyses: DocumentReanalysis[];
    discrepanciesResolved: DiscrepancyResolution[];
  };

  updatedReconciliation: ReconciliationUpdate | null;

  billing: PurchaseBillingSummary;

  timing: {
    totalMs: number;
    purchaseMs: number;
    downloadMs: number;
    reanalysisMs: number;
  };
  aiCalls: number;
  errors: string[];

  /** What the firm-wide document library saved this run (plan R13): documents already owned, so not
   *  bought again. Optional because reports predating the ledger have no honest value to put here —
   *  a zero would read as "saved nothing" rather than "not measured". */
  librarySavings?: {
    reused: number;
    savedUsd: number;
  };

  /** What cross-vendor identity matching did to this run's spending (plan S-13/S-14).
   *
   *  `boughtUnderUncertainty` is the field that must not be hidden. The dedup rule deliberately buys
   *  when identity is unclear — a false match omits a document invisibly, a false miss costs a few
   *  dollars — but that trade is only defensible if the count is visible. Reporting the savings
   *  while burying the duplicates would be advertising one side of the bargain.
   *
   *  Optional for the same reason as `librarySavings`: a run with no index attached has not measured
   *  this, and a zero would read as "nothing was uncertain". */
  identity?: {
    /** Documents skipped because a free or already-bought copy is in hand. */
    skippedAlreadyHeld: number;
    /** Bought despite a possible match, because the match could not be confirmed. */
    boughtUnderUncertainty: number;
    /** Held documents that could not be keyed at all, so they can never prevent a purchase. */
    unkeyableHeld: number;
    /** One sentence for the report. */
    summary: string;
  };
}
