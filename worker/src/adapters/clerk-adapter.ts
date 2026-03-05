// worker/src/adapters/clerk-adapter.ts
// Abstract base class for all Texas county clerk system adapters.
//
// Each county clerk adapter extends this class and implements the abstract
// search and image-retrieval methods.  Shared utilities (smartSearch,
// classifyDocumentType) live here so they only need to be written once.
//
// Spec §2.3 — County Clerk Adapter Interface

import { type Browser, type Page } from 'playwright';

// ── Document Type taxonomy ────────────────────────────────────────────────────

export type DocumentType =
  | 'warranty_deed' | 'special_warranty_deed' | 'quitclaim_deed' | 'deed_of_trust'
  | 'plat' | 'replat' | 'amended_plat' | 'vacating_plat'
  | 'easement' | 'utility_easement' | 'access_easement' | 'drainage_easement'
  | 'restrictive_covenant' | 'deed_restriction' | 'ccr'
  | 'release_of_lien' | 'mechanics_lien' | 'tax_lien'
  | 'right_of_way' | 'dedication' | 'vacation'
  | 'affidavit' | 'correction_instrument'
  | 'oil_gas_lease' | 'mineral_deed'
  | 'other';

// ── Result & option types ─────────────────────────────────────────────────────

export interface ClerkDocumentResult {
  instrumentNumber: string;
  volumePage?: { volume: string; page: string };
  documentType: DocumentType;
  /** ISO date string (e.g. "2023-04-12") or raw date string from clerk */
  recordingDate: string;
  grantors: string[];
  grantees: string[];
  legalDescription?: string;
  pageCount?: number;
  /** Cross-references to other recorded documents */
  relatedInstruments?: string[];
  /** Which clerk system returned this result */
  source: string;
}

export interface DocumentImage {
  instrumentNumber: string;
  pageNumber: number;
  totalPages: number;
  /** Absolute local file path where the image was saved */
  imagePath: string;
  /** Original URL (signed S3 or otherwise — may expire) */
  imageUrl?: string;
  width?: number;
  height?: number;
  /** Kofile / PublicSearch free previews are always watermarked */
  isWatermarked: boolean;
  /** Resolution / clarity estimate */
  quality: 'good' | 'fair' | 'poor';
}

export interface ClerkSearchOptions {
  dateFrom?: string;
  dateTo?: string;
  documentTypes?: DocumentType[];
  maxResults?: number;
}

export interface PricingInfo {
  available: boolean;
  pricePerPage?: number;
  totalPrice?: number;
  pageCount?: number;
  paymentMethod?: 'credit_card' | 'wallet' | 'subscription';
  source: string;
}

// ── Abstract base class ───────────────────────────────────────────────────────

export abstract class ClerkAdapter {
  protected countyName: string;
  protected countyFIPS: string;
  protected browser: Browser | null = null;
  protected page: Page | null = null;

  constructor(countyName: string, countyFIPS: string) {
    this.countyName = countyName;
    this.countyFIPS = countyFIPS;
  }

  // ── Abstract interface — each adapter must implement ─────────────────────────

  abstract searchByInstrumentNumber(instrumentNo: string): Promise<ClerkDocumentResult[]>;
  abstract searchByVolumePage(volume: string, page: string): Promise<ClerkDocumentResult[]>;
  abstract searchByGranteeName(name: string, options?: ClerkSearchOptions): Promise<ClerkDocumentResult[]>;
  abstract searchByGrantorName(name: string, options?: ClerkSearchOptions): Promise<ClerkDocumentResult[]>;
  abstract searchByLegalDescription(legalDesc: string, options?: ClerkSearchOptions): Promise<ClerkDocumentResult[]>;

  abstract getDocumentImages(instrumentNo: string): Promise<DocumentImage[]>;
  abstract getDocumentPricing(instrumentNo: string): Promise<PricingInfo>;

  abstract initSession(): Promise<void>;
  abstract destroySession(): Promise<void>;

  // ── Smart search — tries all strategies, returns de-duplicated results ────────

  /**
   * Try every available search strategy in priority order, stopping at the
   * first hit.  Falls through to name searches when an instrument number is
   * not available.  De-duplicates results by instrument number before returning.
   */
  async smartSearch(query: {
    instrumentNumber?: string;
    volumePage?: { volume: string; page: string };
    granteeName?: string;
    grantorName?: string;
    legalDescription?: string;
    expectedType?: DocumentType;
    expectedDate?: string;
  }): Promise<ClerkDocumentResult[]> {
    const results: ClerkDocumentResult[] = [];

    // Priority 1: Direct instrument number lookup (most precise)
    if (query.instrumentNumber) {
      try {
        const r = await this.searchByInstrumentNumber(query.instrumentNumber);
        if (r.length > 0) return r;
      } catch (e) {
        console.warn(`[${this.countyName}] Instrument# search failed:`, e);
      }
    }

    // Priority 2: Volume/Page lookup
    if (query.volumePage) {
      try {
        const r = await this.searchByVolumePage(
          query.volumePage.volume,
          query.volumePage.page,
        );
        if (r.length > 0) return r;
      } catch (e) {
        console.warn(`[${this.countyName}] Vol/Pg search failed:`, e);
      }
    }

    // Priority 3: Grantee name
    if (query.granteeName) {
      try {
        const r = await this.searchByGranteeName(query.granteeName, {
          documentTypes: query.expectedType ? [query.expectedType] : undefined,
        });
        results.push(...r);
      } catch (e) {
        console.warn(`[${this.countyName}] Grantee search failed:`, e);
      }
    }

    // Priority 4: Grantor name
    if (query.grantorName) {
      try {
        const r = await this.searchByGrantorName(query.grantorName, {
          documentTypes: query.expectedType ? [query.expectedType] : undefined,
        });
        results.push(...r);
      } catch (e) {
        console.warn(`[${this.countyName}] Grantor search failed:`, e);
      }
    }

    // De-duplicate by instrument number
    const seen = new Set<string>();
    return results.filter((r) => {
      if (seen.has(r.instrumentNumber)) return false;
      seen.add(r.instrumentNumber);
      return true;
    });
  }

  // ── Document type classifier ──────────────────────────────────────────────────

  /**
   * Map raw clerk metadata strings (e.g. "WD", "WARRANTY DEED", "PLT") to a
   * canonical DocumentType value.
   */
  classifyDocumentType(typeString: string): DocumentType {
    const upper = typeString.toUpperCase();

    // Deeds
    if (upper.includes('WARRANTY DEED') && !upper.includes('SPECIAL')) return 'warranty_deed';
    if (upper.includes('SPECIAL WARRANTY')) return 'special_warranty_deed';
    if (upper.includes('QUIT CLAIM') || upper.includes('QUITCLAIM')) return 'quitclaim_deed';
    if (upper.includes('DEED OF TRUST') || upper === 'DOT') return 'deed_of_trust';
    // Abbreviations
    if (upper === 'WD' || upper === 'GWD') return 'warranty_deed';
    if (upper === 'SWD') return 'special_warranty_deed';
    if (upper === 'QCD') return 'quitclaim_deed';

    // Plats
    if (upper.includes('REPLAT')) return 'replat';
    if (upper.includes('AMENDED PLAT')) return 'amended_plat';
    if (upper.includes('VACATING PLAT')) return 'vacating_plat';
    if (upper.includes('PLAT') || upper === 'PLT') return 'plat';

    // Easements
    if (upper.includes('UTILITY') && upper.includes('EASEMENT')) return 'utility_easement';
    if (upper.includes('ACCESS') && upper.includes('EASEMENT')) return 'access_easement';
    if (upper.includes('DRAINAGE') && upper.includes('EASEMENT')) return 'drainage_easement';
    if (upper.includes('EASEMENT') || upper === 'ESMT') return 'easement';

    // Restrictions
    if (upper.includes('RESTRICTIVE COVENANT') || upper === 'RC') return 'restrictive_covenant';
    if (upper.includes('CC&R') || upper === 'CCR') return 'ccr';
    if (upper.includes('DEED RESTRICTION')) return 'deed_restriction';

    // Liens
    if (upper.includes('RELEASE') && upper.includes('LIEN')) return 'release_of_lien';
    if (upper.includes('MECHANIC') && upper.includes('LIEN')) return 'mechanics_lien';
    if (upper.includes('TAX LIEN')) return 'tax_lien';
    if (upper === 'REL') return 'release_of_lien';

    // ROW / Dedication
    if (upper.includes('RIGHT OF WAY') || upper === 'ROW') return 'right_of_way';
    if (upper.includes('DEDICATION')) return 'dedication';

    // Minerals / O&G
    if (upper.includes('OIL') || upper.includes('GAS')) return 'oil_gas_lease';
    if (upper.includes('MINERAL')) return 'mineral_deed';
    if (upper === 'OGL' || upper === 'MD') return 'oil_gas_lease';

    // Corrections / Affidavits
    if (upper.includes('AFFIDAVIT')) return 'affidavit';
    if (upper.includes('CORRECTION')) return 'correction_instrument';

    return 'other';
  }
}
