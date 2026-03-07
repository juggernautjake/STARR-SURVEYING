// worker/src/types/county-adapter.ts
// County Adapter Interface — Starr Software Spec v2.0 §15
//
// Formal TypeScript interface that abstracts county-specific clerk automation
// behind a consistent API. All adapters must implement this interface.
// The factory function getCountyAdapter() selects the right adapter for a county.

// ── Shared types ──────────────────────────────────────────────────────────────

export type ClerkSystemType = 'kofile' | 'countyfusion' | 'texasfile' | 'custom';
export type DocumentType     = 'deed' | 'plat' | 'easement' | 'lien' | 'other';
export type PaymentMethodType = 'texasfile_wallet' | 'county_credit_card' | 'stripe_passthrough';

export interface ClerkDocumentResult {
  documentId:    string;
  instrumentNumber: string;
  recordingDate: Date | null;
  documentType:  DocumentType;
  grantors:      string[];
  grantees:      string[];
  legalDescription?: string;
  pageCount?:    number;
  volumePage?:   { volume: string; page: string };
  /** URL to the watermarked preview image (free) */
  previewUrl?:   string;
  source:        string;
}

export interface PricingResult {
  pricePerPage:   number;
  pageCount:      number;
  totalPrice:     number;
  currency:       'USD';
  paymentMethods: PaymentMethodType[];
  /** Where this pricing information was retrieved from */
  source:         string;
}

export interface PreviewResult {
  /** Base64-encoded watermarked preview image(s) */
  pages:     Array<{ pageNumber: number; imageBase64: string; mimeType: string }>;
  pageCount: number;
  /** URL of the preview (for reference) */
  sourceUrl: string | null;
}

export interface EncryptedCredentials {
  /** Supabase Vault secret name — the actual credentials are never stored in code */
  vaultSecretName: string;
}

export interface PaymentMethod {
  type:         PaymentMethodType;
  credentials?: EncryptedCredentials;
}

export interface PurchaseResult {
  success:         boolean;
  documentId:      string;
  instrumentNumber: string;
  /** Path on disk where the purchased document was saved */
  localPath?:      string;
  /** Base64-encoded document content (PDF or image) */
  documentBase64?: string;
  mimeType?:       string;
  amountCharged:   number;
  receiptReference: string | null;
  errorMessage?:   string;
}

export interface SearchOptions {
  startDate?:   Date;
  endDate?:     Date;
  /** Filter by approximate acreage (±20%) */
  acreage?:     number;
  documentType?: DocumentType;
  maxResults?:  number;
}

// ── County Adapter Interface ──────────────────────────────────────────────────

/**
 * All county clerk adapters must implement this interface.
 * Implementations handle the county-specific Playwright automation
 * (or HTTP API calls) behind a consistent contract.
 */
export interface CountyAdapter {
  /** Human-readable county name (e.g., "Bell") */
  readonly countyName: string;
  /** 5-digit FIPS code (e.g., "48027" for Bell County TX) */
  readonly countyFIPS: string;
  /** Which clerk system this county uses */
  readonly systemType: ClerkSystemType;

  // ── Search methods ──────────────────────────────────────────────────────────
  searchByInstrumentNumber(instrumentNo: string): Promise<ClerkDocumentResult[]>;
  searchByVolumePage(volume: string, page: string): Promise<ClerkDocumentResult[]>;
  searchByGranteeName(name: string, options?: SearchOptions): Promise<ClerkDocumentResult[]>;
  searchByGrantorName(name: string, options?: SearchOptions): Promise<ClerkDocumentResult[]>;

  // ── Document access ─────────────────────────────────────────────────────────
  /** Get watermarked preview pages (free) */
  getDocumentPreview(documentId: string): Promise<PreviewResult>;
  /** Scrape pricing before presenting purchase options to user */
  getDocumentPricing(documentId: string): Promise<PricingResult>;

  // ── Purchase (requires user approval — pipeline STOPS before payment) ───────
  /**
   * Purchase a document. For county_credit_card: navigates to payment page and
   * STOPS before entering card info — returns a URL for user to complete payment.
   * For texasfile_wallet and stripe_passthrough: completes automatically.
   */
  purchaseDocument(documentId: string, paymentMethod: PaymentMethod): Promise<PurchaseResult>;
  downloadDocument(documentId: string): Promise<Buffer>;

  // ── Session management ──────────────────────────────────────────────────────
  /** Launch Playwright browser session and authenticate if needed */
  initSession(): Promise<void>;
  /** Close browser and release resources */
  destroySession(): Promise<void>;
  /** Check if the current session is still valid (not expired/timed-out) */
  isSessionValid(): Promise<boolean>;
  /** Refresh an expired session without full re-init */
  refreshSession(): Promise<void>;
}

// ── Abstract base class with shared helpers ───────────────────────────────────

/**
 * Convenience base class providing default implementations for methods
 * that most adapters handle the same way. Extend this instead of implementing
 * CountyAdapter directly when building new adapters.
 */
export abstract class BaseCountyAdapter implements CountyAdapter {
  abstract readonly countyName: string;
  abstract readonly countyFIPS: string;
  abstract readonly systemType: ClerkSystemType;

  abstract searchByInstrumentNumber(instrumentNo: string): Promise<ClerkDocumentResult[]>;
  abstract searchByVolumePage(volume: string, page: string): Promise<ClerkDocumentResult[]>;
  abstract searchByGranteeName(name: string, options?: SearchOptions): Promise<ClerkDocumentResult[]>;
  abstract searchByGrantorName(name: string, options?: SearchOptions): Promise<ClerkDocumentResult[]>;
  abstract getDocumentPreview(documentId: string): Promise<PreviewResult>;
  abstract initSession(): Promise<void>;
  abstract destroySession(): Promise<void>;
  abstract isSessionValid(): Promise<boolean>;

  /** Default: scrape TexasFile for pricing when county-direct pricing not available */
  async getDocumentPricing(documentId: string): Promise<PricingResult> {
    void documentId;
    // Default: $1/page on TexasFile (conservative estimate without page count)
    return {
      pricePerPage:   1.00,
      pageCount:      1,      // unknown without scraping
      totalPrice:     1.00,
      currency:       'USD',
      paymentMethods: ['texasfile_wallet', 'county_credit_card'],
      source:         'default-estimate',
    };
  }

  /** Default: not yet implemented — subclasses should override */
  async purchaseDocument(documentId: string, _paymentMethod: PaymentMethod): Promise<PurchaseResult> {
    return {
      success:          false,
      documentId,
      instrumentNumber: documentId,
      amountCharged:    0,
      receiptReference: null,
      errorMessage:     `Purchase not yet implemented for ${this.countyName} adapter`,
    };
  }

  /** Default: not yet implemented — subclasses should override */
  async downloadDocument(_documentId: string): Promise<Buffer> {
    throw new Error(`downloadDocument not yet implemented for ${this.countyName} adapter`);
  }

  /** Default refresh: destroy + re-init */
  async refreshSession(): Promise<void> {
    await this.destroySession();
    await this.initSession();
  }
}

// ── TexasFile stub adapter ────────────────────────────────────────────────────

/**
 * TexasFile universal fallback adapter.
 * Covers all 254 Texas counties at $1/page.
 *
 * Current status: stub — search returns empty results.
 * Full implementation deferred to Phase 3.
 */
export class TexasFileAdapter extends BaseCountyAdapter {
  readonly countyName: string;
  readonly countyFIPS: string = '00000'; // county-specific FIPS set by factory
  readonly systemType: ClerkSystemType = 'texasfile';

  constructor(countyName: string) {
    super();
    this.countyName = countyName;
  }

  async searchByInstrumentNumber(instrumentNo: string): Promise<ClerkDocumentResult[]> {
    // TODO Phase 3: Navigate texasfile.com, search by instrument number
    console.warn(`[TexasFileAdapter:${this.countyName}] searchByInstrumentNumber not implemented — instrument: ${instrumentNo}`);
    return [];
  }

  async searchByVolumePage(volume: string, page: string): Promise<ClerkDocumentResult[]> {
    console.warn(`[TexasFileAdapter:${this.countyName}] searchByVolumePage not implemented — vol: ${volume}, pg: ${page}`);
    return [];
  }

  async searchByGranteeName(name: string, _options?: SearchOptions): Promise<ClerkDocumentResult[]> {
    console.warn(`[TexasFileAdapter:${this.countyName}] searchByGranteeName not implemented — name: ${name}`);
    return [];
  }

  async searchByGrantorName(name: string, _options?: SearchOptions): Promise<ClerkDocumentResult[]> {
    console.warn(`[TexasFileAdapter:${this.countyName}] searchByGrantorName not implemented — name: ${name}`);
    return [];
  }

  async getDocumentPreview(_documentId: string): Promise<PreviewResult> {
    return { pages: [], pageCount: 0, sourceUrl: 'https://texasfile.com' };
  }

  async getDocumentPricing(documentId: string): Promise<PricingResult> {
    void documentId;
    return {
      pricePerPage:   1.00,
      pageCount:      1,
      totalPrice:     1.00,
      currency:       'USD',
      paymentMethods: ['texasfile_wallet'],
      source:         'texasfile-estimate',
    };
  }

  async initSession():    Promise<void> { /* no-op until implemented */ }
  async destroySession(): Promise<void> { /* no-op */ }
  async isSessionValid(): Promise<boolean> { return false; }
}

// ── County FIPS map (partial — Bell + key TX counties) ────────────────────────

const TEXAS_COUNTY_FIPS: Record<string, string> = {
  anderson: '48001', andrews: '48003', angelina: '48005', aransas: '48007',
  atascosa: '48013', austin: '48015', bandera: '48019', bastrop: '48021',
  bell: '48027', bexar: '48029', blanco: '48031', brazoria: '48039',
  brazos: '48041', burleson: '48051', burnet: '48053', caldwell: '48055',
  calhoun: '48057', cameron: '48061', cherokee: '48073', collin: '48085',
  comal: '48091', dallas: '48113', denton: '48121', ector: '48135',
  el_paso: '48141', ellis: '48139', fort_bend: '48157', galveston: '48167',
  gillespie: '48171', guadalupe: '48187', harris: '48201', hays: '48209',
  hidalgo: '48215', hunt: '48231', jefferson: '48245', johnson: '48251',
  kendall: '48259', kerr: '48265', lampasas: '48281', lubbock: '48303',
  mclennan: '48309', medina: '48325', midland: '48329', milam: '48331',
  montgomery: '48339', navarro: '48349', nueces: '48355', parker: '48367',
  robertson: '48395', rockwall: '48397', rusk: '48401', smith: '48423',
  tarrant: '48439', taylor: '48441', tom_green: '48451', travis: '48453',
  victoria: '48469', walker: '48471', waller: '48473', webb: '48479',
  williamson: '48491', wilson: '48493', wise: '48497', wood: '48499',
};

export function getCountyFIPS(countyName: string): string {
  const key = countyName.toLowerCase().replace(/\s+/g, '_');
  return TEXAS_COUNTY_FIPS[key] ?? '00000';
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Factory function — returns the right CountyAdapter for a given county name.
 *
 * Routing priority:
 *   1. Named adapters (Bell — fully implemented)
 *   2. Planned adapters (Williamson, Travis — Phase 4)
 *   3. TexasFile universal fallback (all other counties)
 *
 * New adapters should be registered here as they are implemented.
 */
export function getCountyAdapter(countyName: string): CountyAdapter {
  const name = countyName.toLowerCase().trim();

  // Lazy-import named adapters to avoid loading Playwright until needed
  const NAMED_ADAPTERS: Record<string, () => CountyAdapter> = {
    'bell': () => new BellCountyAdapterShim(),
    // Phase 4:
    // 'williamson': () => new WilliamsonCountyAdapter(),
    // 'travis':     () => new TravisCountyAdapter(),
  };

  const factory = NAMED_ADAPTERS[name];
  if (factory) return factory();

  // Universal TexasFile fallback for all other counties
  return new TexasFileAdapter(countyName);
}

// ── Bell County shim ──────────────────────────────────────────────────────────

/**
 * Bell County adapter shim — wraps the existing bell-clerk.ts procedural
 * functions behind the CountyAdapter interface.
 *
 * This is a transitional wrapper. A full class-based adapter for Bell County
 * should be built in Phase 1 to replace this shim.
 */
class BellCountyAdapterShim extends BaseCountyAdapter {
  readonly countyName = 'Bell';
  readonly countyFIPS = '48027';
  readonly systemType: ClerkSystemType = 'kofile';

  // The Bell County shim delegates to bell-clerk.ts at the call site via pipeline.ts.
  // Dynamic import is intentionally deferred to Phase 1 when a full class adapter is built.
  // These methods return empty results as stubs — the existing bell-clerk.ts functions
  // are called directly from pipeline.ts until the refactor is complete.

  async searchByInstrumentNumber(_instrumentNo: string): Promise<ClerkDocumentResult[]> {
    return []; // Phase 1: delegate to bell-clerk.ts searchClerkRecords()
  }

  async searchByVolumePage(_volume: string, _page: string): Promise<ClerkDocumentResult[]> {
    return []; // Phase 1: add vol/page search to bell-clerk.ts
  }

  async searchByGranteeName(_name: string, _options?: SearchOptions): Promise<ClerkDocumentResult[]> {
    return []; // Phase 1: delegate to bell-clerk.ts searchClerkRecords()
  }

  async searchByGrantorName(_name: string, _options?: SearchOptions): Promise<ClerkDocumentResult[]> {
    return []; // Phase 1: same as grantee search
  }

  async getDocumentPreview(_documentId: string): Promise<PreviewResult> {
    return { pages: [], pageCount: 0, sourceUrl: null };
  }

  async initSession():    Promise<void> { /* bell-clerk.ts manages browser lifecycle internally */ }
  async destroySession(): Promise<void> { /* same */ }
  async isSessionValid(): Promise<boolean> { return true; }
}

/** Map a raw document type string to the DocumentType enum */
export function mapDocType(raw: string): DocumentType {
  const lower = raw.toLowerCase();
  if (lower.includes('plat'))              return 'plat';
  if (lower.includes('deed'))              return 'deed';
  if (lower.includes('easement'))          return 'easement';
  if (lower.includes('lien') || lower.includes('judgment')) return 'lien';
  return 'other';
}
