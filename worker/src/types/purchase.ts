// worker/src/types/purchase.ts — Phase 9: Document Purchase & Automated Re-Analysis
// All TypeScript interfaces for the DocumentPurchaseOrchestrator.
//
// Spec §9 — Phase 9 Deliverable: PurchaseReport

// ── Purchase Configuration ──────────────────────────────────────────────────

export type PurchaseVendor = 'kofile' | 'texasfile' | 'county_direct' | 'txdot';

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
  | 'texasfile_wallet';

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

export interface PurchaseOrchestratorConfig {
  kofileCredentials?: KofileCredentials;
  texasfileCredentials?: TexasFileCredentials;
  budget: number;
  autoReanalyze: boolean;
}

// ── Image Quality ───────────────────────────────────────────────────────────

export interface ImageQuality {
  format: string;          // TIFF, PNG, PDF
  resolution?: string;     // e.g. "300dpi"
  dimensions?: { width: number; height: number };
  hasWatermark: boolean;
  qualityScore: number;    // 0-100
}

// ── Purchase Result (per-document) ──────────────────────────────────────────

export interface DocumentPurchaseResult {
  instrument: string;
  documentType: string;
  source: string;
  status: PurchaseStatus;
  pages: number;
  costPerPage: number;
  totalCost: number;
  paymentMethod: PaymentMethodId;
  transactionId: string | null;
  downloadedImages: string[];
  imageQuality: ImageQuality;
  error?: string;
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
}
