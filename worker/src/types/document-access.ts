// worker/src/types/document-access.ts — Phase 14
// Unified type definitions for the free-first, paid-fallback document access
// architecture.
//
// Architecture overview:
//
//   TIER 0: FREE_PREVIEW   — Kofile/GovOS watermarked JPG/PNG previews.
//                            Useful for AI extraction despite watermarks.
//                            Available for ~80+ TX counties.
//
//   TIER 1: FREE_INDEX     — County clerk system provides instrument number,
//                            grantor/grantee, recording date, doc type, page
//                            count — but NO image access.  (CountyFusion,
//                            Tyler index-only, Henschen index-only, iDocket
//                            guest, TexasFile free).
//
//   TIER 2: PAID_PLATFORM  — Automated payment to a commercial platform that
//                            returns clean, un-watermarked, high-res images.
//                            Multiple vendors available per county; tried in
//                            cost-ascending order.
//
//   TIER 3: COUNTY_DIRECT  — County clerk office direct purchase (some
//                            counties allow credit card online or by mail).
//                            Slower (1–5 business days) but authoritative.
//
//   TIER 4: MANUAL         — No automated option.  Operator must physically
//                            visit the county clerk office or submit a public
//                            records request.
//
// The DocumentAccessOrchestrator works through tiers in order and stops as
// soon as it obtains images that are "good enough" for the current operation
// (configurable via DocumentAccessConfig.minimumQuality).

// ── Access Tier ─────────────────────────────────────────────────────────────

export type DocumentAccessTier =
  | 'free_preview'    // Tier 0 — watermarked, usually sufficient for AI
  | 'free_index'      // Tier 1 — metadata only, no image
  | 'paid_platform'   // Tier 2 — automated paid purchase
  | 'county_direct'   // Tier 3 — county clerk direct (slower)
  | 'manual';         // Tier 4 — human intervention needed

// ── Paid Platform Identifiers ────────────────────────────────────────────────

/**
 * All automatable paid document platforms for Texas county records.
 *
 * | ID                | Platform             | Coverage    | Price/Page | Auth      |
 * |-------------------|----------------------|-------------|-----------|-----------|
 * | texasfile         | TexasFile.com        | All 254 TX  | $1.00      | Username  |
 * | kofile_pay        | Kofile/GovOS Pay     | ~80 TX      | $1.00      | Username  |
 * | tyler_pay         | Tyler/Odyssey Pay    | ~30 TX      | $0.50–$1   | Username  |
 * | henschen_pay      | Henschen Pay         | ~40 TX      | $0.50–$1   | County acct |
 * | idocket_pay       | iDocket Subscriber   | ~20 TX      | Subscription | Username |
 * | fidlar_pay        | Fidlar/Laredo Pay    | ~15 TX      | $0.75–$1   | Username  |
 * | govos_direct      | GovOS County Direct  | ~80 TX      | $1.00      | CC on file |
 * | landex            | LandEx (formerly VitalChek) | National | $0.50–$2 | API key  |
 * | cs_lexi           | CS LEXI / Accela    | Various TX  | $1.00      | Username  |
 * | county_direct_pay | County clerk portal  | Varies      | Varies     | Varies    |
 * | txdot_docs        | TxDOT ROW documents  | State-wide  | Free–$5    | None/account |
 * | glo_archives      | GLO Archives         | State-wide  | Free–$25   | None/form |
 */
export type PaidPlatformId =
  | 'texasfile'       // TexasFile.com — universal TX fallback
  | 'kofile_pay'      // Kofile / GovOS PublicSearch account purchase
  | 'tyler_pay'       // Tyler Technologies / Odyssey account purchase
  | 'henschen_pay'    // Henschen & Associates county pay portal
  | 'idocket_pay'     // iDocket subscriber account
  | 'fidlar_pay'      // Fidlar / Laredo subscriber account
  | 'govos_direct'    // GovOS county direct checkout (no account needed)
  | 'landex'          // LandEx national land records platform
  | 'cs_lexi'         // CS LEXI / Accela land records
  | 'county_direct_pay' // County's own online payment portal
  | 'txdot_docs'      // TxDOT Right-of-Way document library
  | 'glo_archives';   // Texas General Land Office Archives

// ── Platform Descriptor ──────────────────────────────────────────────────────

export interface PaidPlatformDescriptor {
  id: PaidPlatformId;
  displayName: string;
  baseUrl: string;
  /** Approximate cost per page in USD */
  costPerPage: number;
  /** Whether this platform supports fully automated payment (no human needed) */
  automationSupported: boolean;
  /** Whether this platform is available statewide or county-specific */
  statewide: boolean;
  /** FIPS codes this platform explicitly covers (empty = statewide) */
  coveredFIPS: string[];
  /** Auth mechanism required */
  authType: 'username_password' | 'api_key' | 'credit_card_guest' | 'none' | 'subscription';
  /** Payment method the platform supports */
  paymentMethods: PlatformPaymentMethod[];
  /** Typical delivery time (for non-instant platforms) */
  typicalDeliveryMinutes: number;
  /** Whether images returned are watermark-free */
  cleansImages: boolean;
  /** Notes for operators */
  notes?: string;
}

export type PlatformPaymentMethod =
  | 'credit_card'
  | 'debit_card'
  | 'platform_wallet'  // Pre-funded account balance on the platform
  | 'stripe_passthrough' // Starr charges user via Stripe, then pays platform
  | 'subscription_included' // Covered by platform subscription
  | 'free';

// ── Per-County Access Plan ────────────────────────────────────────────────────

/**
 * Describes all access options available for a specific Texas county.
 * Generated by PaidPlatformRegistry.getAccessPlan(countyFIPS).
 */
export interface CountyAccessPlan {
  countyFIPS: string;
  countyName: string;
  /** Tier 0/1: free access capability */
  freeAccess: {
    hasWatermarkedPreview: boolean;  // Tier 0
    hasIndexOnly: boolean;           // Tier 1
    clerkSystem: string;
    previewSource?: string;
  };
  /** Tier 2+: paid platforms, sorted cheapest-first */
  paidPlatforms: PaidPlatformDescriptor[];
  /** Minimum estimated cost to get clean images for this county */
  minimumCostPerPage: number;
  /** Whether any fully-automated paid option exists */
  hasAutomatedPaidOption: boolean;
  /** Recommended first platform to try */
  recommendedPlatform: PaidPlatformId | null;
}

// ── Document Access Request ───────────────────────────────────────────────────

export interface DocumentAccessRequest {
  projectId: string;
  countyFIPS: string;
  countyName: string;
  instrumentNumber: string;
  documentType: string;
  /** If true, stop at free_preview/free_index even if images are watermarked */
  freeOnly?: boolean;
  /** Maximum cost the caller is willing to pay per document */
  maxCostPerDocument?: number;
  /** Minimum image quality (0–100) required; below this, try next tier */
  minimumQuality?: number;
  /** User's Stripe customer ID for pass-through payment */
  stripeCustomerId?: string;
  /** Preferred platform to try first (overrides default ordering) */
  preferredPlatform?: PaidPlatformId;
  /** Platform credentials (injected by orchestrator from env/config) */
  credentials?: PlatformCredentialMap;
}

// ── Platform Credentials ──────────────────────────────────────────────────────

export interface TexasFileCreds {
  username: string;
  password: string;
}

export interface KofilePayCreds {
  username: string;
  password: string;
  paymentOnFile: boolean;
}

export interface TylerPayCreds {
  username: string;
  password: string;
}

export interface HenschenPayCreds {
  username: string;
  password: string;
  /** 3-digit county code — optional when building from env vars */
  countyCode?: string;
}

export interface IDocketPayCreds {
  username: string;
  password: string;
  /** iDocket subscriber plan ID */
  planId?: string;
}

export interface FidlarPayCreds {
  username: string;
  password: string;
}

export interface GovOSDirectCreds {
  /** GovOS allows guest checkout with credit card — no account needed */
  creditCardToken?: string;
  /** Or use pre-funded GovOS account */
  accountUsername?: string;
  accountPassword?: string;
}

export interface LandExCreds {
  apiKey: string;
  accountId: string;
}

export interface CSLexiCreds {
  username: string;
  password: string;
}

export type PlatformCredentialMap = {
  texasfile?: TexasFileCreds;
  kofile_pay?: KofilePayCreds;
  tyler_pay?: TylerPayCreds;
  henschen_pay?: HenschenPayCreds;
  idocket_pay?: IDocketPayCreds;
  fidlar_pay?: FidlarPayCreds;
  govos_direct?: GovOSDirectCreds;
  landex?: LandExCreds;
  cs_lexi?: CSLexiCreds;
};

// ── Document Access Result ────────────────────────────────────────────────────

export type DocumentAccessStatus =
  | 'success_free_preview'      // Got watermarked images for free
  | 'success_free_index'        // Got index metadata only (no images)
  | 'success_paid'              // Got clean images via paid platform
  | 'partial_free'              // Got some images but not all pages
  | 'failed_all_tiers'          // Every tier failed
  | 'requires_manual'           // No automated option — needs human
  | 'budget_exceeded'           // Could get images but cost exceeds limit
  | 'no_platforms_configured';  // No credentials provided for any paid platform

export interface DocumentAccessResult {
  status: DocumentAccessStatus;
  tier: DocumentAccessTier;
  platform: PaidPlatformId | 'kofile_free' | 'countyfusion_index' | 'tyler_index' | 'henschen_index' | 'idocket_index' | 'fidlar_index' | 'texasfile_index' | null;
  instrumentNumber: string;
  documentType: string;
  /** Local file paths for downloaded images (empty if index-only) */
  imagePaths: string[];
  /** Number of pages obtained */
  pages: number;
  /** Cost charged in USD (0 for free tiers) */
  costUSD: number;
  /** Whether images have watermarks */
  isWatermarked: boolean;
  /** Estimated image quality 0–100 */
  qualityScore: number;
  /** Transaction ID from paid platform (null for free) */
  transactionId: string | null;
  /** Stripe PaymentIntent ID when Starr charged the user */
  stripePaymentIntentId: string | null;
  /** Error message(s) from failed tier attempts */
  errors: string[];
  /** Which tiers were attempted before success/final-failure */
  tiersAttempted: DocumentAccessTier[];
  /** Timing */
  totalMs: number;
}

// ── Orchestrator Config ───────────────────────────────────────────────────────

export interface DocumentAccessConfig {
  /**
   * If true (default), always try free tiers before paid platforms.
   * If false, skip directly to paid platforms for clean images.
   */
  tryFreeFirst: boolean;
  /**
   * Minimum quality score (0–100) required to accept free-tier images.
   * If free images are below this threshold, proceed to paid platforms.
   * Default: 40 (very low — use AI extraction even on watermarked images)
   */
  minimumFreeQuality: number;
  /**
   * Maximum cost per document in USD.  Purchases exceeding this are skipped.
   * Default: 10.00
   */
  maxCostPerDocument: number;
  /**
   * If true, automatically charge the user's Stripe account for paid purchases.
   * If false, require manual approval for each paid purchase.
   */
  autoCharge: boolean;
  /**
   * Output directory for downloaded document images.
   */
  outputDir: string;
  /**
   * Platform credentials (loaded from environment variables if not provided).
   */
  credentials?: PlatformCredentialMap;
}

// ── Platform Availability Summary ────────────────────────────────────────────

/**
 * Summary of available paid platforms for a batch of counties.
 * Returned by GET /research/access/platforms.
 */
export interface PlatformAvailabilitySummary {
  totalCounties: number;
  coveredByFreePreview: number;
  coveredByFreeIndex: number;
  coveredByAutomatedPaid: number;
  requiresManual: number;
  platforms: Array<{
    id: PaidPlatformId;
    displayName: string;
    countiesSupported: number;
    costPerPage: number;
    automationSupported: boolean;
    configuredForUse: boolean;
  }>;
}
