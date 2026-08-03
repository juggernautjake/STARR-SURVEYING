// worker/src/adapters/edoctec-clerk-adapter.ts — a vendor the platform did not know existed (R39).
//
// Found on 2026-08-02 while hunting Coryell's portal county-by-county after the Tyler Host pattern
// failed to generalise. eDocTec serves at least two counties inside the 80-mile ring, both fully
// open — no login, no paywall, current to within days of the search:
//
//     Coryell   /CoryellPublicRecords    12,705 documents / 20,267 party records
//     Lampasas  /LampasasPublicRecords
//
// Coryell matters twice over: it is Gatesville AND Copperas Cove, both named by the owner.
//
// Everything here was read off the live pages, not guessed. The form field names below are the
// actual ASP.NET MVC input names; `__RequestVerificationToken` is an antiforgery token the server
// rejects the POST without, which is why this drives the real form rather than building a URL.

import { acquireBrowser } from '../lib/browser-factory.js';
import type { BrowserContext } from 'playwright';
import {
  ClerkAdapter,
  type ClerkDocumentResult,
  type ClerkSearchOptions,
  type DocumentImage,
  type DocumentType,
  type PricingInfo,
} from './clerk-adapter.js';
import {
  describeParse,
  parseResults,
  type GroupedDocument,
} from './edoctec-results-parser.js';
import { RESULTS_SETTLED, SEARCH_FORM_USABLE, waitWithRetry } from '../lib/page-readiness.js';
import { resolveAdapter } from '../infra/adapter-registry.js';

/** The host every known deployment shares. It is named for McLennan because that is where eDocTec
 *  first deployed; McLennan's own records are NOT here (that path serves JP ticket payments). */
export const EDOCTEC_HOST = 'https://mclennan.edoctec.com';

/** County name → path segment, for counties VERIFIED to answer a live search.
 *
 *  Verified means: the search form was driven, rows came back, and the headers mapped. Nothing goes
 *  in this table because a URL returned 200 — that is exactly how the platform ended up claiming 53
 *  Kofile counties when it had 21. */
export const EDOCTEC_COUNTIES: Record<string, string> = {
  Coryell: 'CoryellPublicRecords',
  Lampasas: 'LampasasPublicRecords',
};

export function edoctecBaseUrl(county: string): string | null {
  const slug = EDOCTEC_COUNTIES[county.replace(/\s+county$/i, '').trim()];
  return slug ? `${EDOCTEC_HOST}/${slug}` : null;
}

/** Form field names, read off the live pages on 2026-08-02. */
export const EDOCTEC_FIELDS = {
  party: { firstName: 'FirstName', lastName: 'LastName', partyType: 'PartyTypeID' },
  document: { fullName: 'FullName', instrumentNo: 'InstrumentNo' },
  common: { dateFrom: 'DateFrom', dateTo: 'DateTo', pageSize: 'PageSize', token: '__RequestVerificationToken' },
} as const;

/** eDocTec's date inputs take US format. An ISO string typed into them silently matches nothing,
 *  which would read as "this property has no records". */
export function toSiteDate(value: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  return value.trim();
}

/** A date range wide enough that an empty result means something.
 *
 *  Searching 1990-onward on a county whose records start in 1854 and calling the empty result "no
 *  deeds" is the defect this whole document exists to close. */
export const EARLIEST_RECORD_DATE = '01/01/1836';

export interface EdocTecSearchWindow {
  from?: string;
  to?: string;
}

export class EdocTecClerkAdapter extends ClerkAdapter {
  private baseUrl: string;
  private context: BrowserContext | null = null;
  /** The last parse's own account of itself, so a caller can distinguish "nothing recorded" from
   *  "we could not read the table". */
  lastParseSummary: string | null = null;

  constructor(countyFIPS: string, countyName: string) {
    super(countyName, countyFIPS);
    const url = edoctecBaseUrl(countyName);
    if (!url) {
      throw new Error(
        `[eDocTec] ${countyName} is not a verified eDocTec county. Known: ${Object.keys(EDOCTEC_COUNTIES).join(', ')}. ` +
          `Add it only after driving its search form and seeing rows come back.`,
      );
    }
    this.baseUrl = url;
  }

  // ── Session ───────────────────────────────────────────────────────────────────

  async initSession(): Promise<void> {
    if (this.browser) return;
    await this.applyRegistryOverrides();

    this.browser = await acquireBrowser({
      adapterId: 'edoctec-clerk',
      launchOptions: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] },
    });
    if (!this.browser) throw new Error(`[eDocTec/${this.countyName}] Could not acquire a browser.`);
    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
      viewport: { width: 1600, height: 1100 },
      acceptDownloads: true,
    });
    this.page = await this.context.newPage();
  }

  /** Let a stored repair move the portal without a release, exactly as the Kofile adapter does.
   *  Never throws — a registry outage must not stop research for a county whose code still works. */
  private async applyRegistryOverrides(): Promise<void> {
    try {
      const resolved = await resolveAdapter(this.countyName, 'clerk_deeds', {
        county: this.countyName,
        siteType: 'clerk_deeds',
        system: 'edoctec',
        baseUrl: this.baseUrl,
        implementation: 'implemented',
      });
      if (resolved.source === 'registry' && resolved.baseUrl) {
        this.baseUrl = resolved.baseUrl.replace(/\/+$/, '');
      }
    } catch {
      /* keep the compiled URL */
    }
  }

  async destroySession(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    this.context = null;
    this.page = null;
    this.browser = null;
  }

  // ── The two searches the site offers ──────────────────────────────────────────

  /** Drive a form and read its table.
   *
   *  `complete` says whether the rows carry a document's WHOLE party list. Only a document search
   *  does; a party search returns just the parties that matched the term. That flag is the
   *  difference between "this deed has no grantee" and "we did not ask about the grantee". */
  private async runSearch(
    path: string,
    fill: Record<string, string>,
    complete: boolean,
  ): Promise<ClerkDocumentResult[]> {
    await this.initSession();
    if (!this.page) throw new Error('Session not initialized');
    const page = this.page;

    await page.goto(`${this.baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    // Condition, not a fixed delay: these pages render slowly and unevenly, and a timeout that
    // fires before the form exists produces a wrong recorded fact rather than an error (R38).
    await waitWithRetry(page, SEARCH_FORM_USABLE, '() => 1', { label: `${this.countyName} form` });

    for (const [name, value] of Object.entries(fill)) {
      if (!value) continue;
      await page.fill(`[name="${name}"]`, value).catch(() => undefined);
    }

    await page.click('button[type=submit], input[type=submit]').catch(() => undefined);

    // Settle on rows OR an explicit empty statement. Anything else stays unknown.
    await waitWithRetry(page, RESULTS_SETTLED, '() => 1', { label: `${this.countyName} results` }).catch(
      () => undefined,
    );

    const table = await page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('table thead th')).map((h) => (h.textContent ?? '').trim());
      const rows = Array.from(document.querySelectorAll('table tbody tr')).map((tr) =>
        Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim().replace(/\s+/g, ' ')),
      );
      return { headers, rows };
    });

    const report = parseResults(table.headers, table.rows, { complete });
    this.lastParseSummary = describeParse(report, this.countyName);
    console.log(`[eDocTec/${this.countyName}] ${this.lastParseSummary}`);

    if (report.unusable) {
      // Refusing to answer beats answering "no records" from a table we could not read.
      throw new Error(this.lastParseSummary);
    }

    return report.documents.map((d) => this.toResult(d));
  }

  private toResult(doc: GroupedDocument): ClerkDocumentResult {
    const vp = doc.bookVolumePage?.split('/');
    return {
      instrumentNumber: doc.instrumentNumber,
      volumePage: vp && vp.length === 2 ? { volume: vp[0], page: vp[1] } : undefined,
      documentType: this.classifyDocumentType(doc.documentType) as DocumentType,
      recordingDate: doc.recordingDate,
      // Unclassified parties ride along on the grantor side rather than vanishing, but the summary
      // says how many there were so a human can look.
      grantors: doc.grantors,
      grantees: doc.grantees,
      source: doc.partiesComplete ? 'edoctec' : 'edoctec (party list PARTIAL — re-read document)',
    };
  }

  private window(options?: ClerkSearchOptions & EdocTecSearchWindow): Record<string, string> {
    const o = options as EdocTecSearchWindow | undefined;
    return {
      [EDOCTEC_FIELDS.common.dateFrom]: toSiteDate(o?.from ?? EARLIEST_RECORD_DATE),
      [EDOCTEC_FIELDS.common.dateTo]: toSiteDate(o?.to ?? '12/31/2099'),
      [EDOCTEC_FIELDS.common.pageSize]: '100',
    };
  }

  async searchByInstrumentNumber(instrumentNo: string): Promise<ClerkDocumentResult[]> {
    // A document search returns EVERY party on the instrument, so this one is complete.
    return this.runSearch(
      '/Home/Index',
      { [EDOCTEC_FIELDS.document.instrumentNo]: instrumentNo, ...this.window() },
      true,
    );
  }

  async searchByGrantorName(name: string, options?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
    return this.partySearch(name, options);
  }

  async searchByGranteeName(name: string, options?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
    // One party index covers both sides; the Party Type column decides which side each name is on,
    // so both entry points run the same search and let the parser sort it out.
    return this.partySearch(name, options);
  }

  private async partySearch(name: string, options?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
    const { last, first } = splitName(name);
    return this.runSearch(
      '/Search/PartySearch',
      {
        [EDOCTEC_FIELDS.party.lastName]: last,
        [EDOCTEC_FIELDS.party.firstName]: first,
        ...this.window(options),
      },
      false,
    );
  }

  async searchByVolumePage(volume: string, pg: string): Promise<ClerkDocumentResult[]> {
    // The site exposes no book/page entry on either search form; Advanced Search would be the place
    // and has not been driven. Saying so beats returning [] — an empty array reads as "no such
    // instrument", and this is "we have not built that search".
    throw new Error(
      `[eDocTec/${this.countyName}] Volume/page search is NOT implemented (vol ${volume} pg ${pg}). ` +
        `The site's Advanced Search may support it; it has not been driven. This is a missing capability, not an empty result.`,
    );
  }

  async searchByLegalDescription(legalDesc: string): Promise<ClerkDocumentResult[]> {
    throw new Error(
      `[eDocTec/${this.countyName}] Legal-description search is NOT offered by this vendor (asked: ${legalDesc.slice(0, 40)}). ` +
        `Use a party or instrument search. Not an empty result.`,
    );
  }

  async getDocumentImages(instrumentNo: string): Promise<DocumentImage[]> {
    // The site sells certified and uncertified copies through a cart. Image retrieval therefore has
    // a purchase step that has not been built or authorised, and pretending otherwise would return
    // an empty page set for a document that has pages.
    throw new Error(
      `[eDocTec/${this.countyName}] Image retrieval for ${instrumentNo} goes through the site's paid cart, which is not wired up. ` +
        `Not "no images".`,
    );
  }

  async getDocumentPricing(instrumentNo: string): Promise<PricingInfo> {
    throw new Error(
      `[eDocTec/${this.countyName}] Pricing for ${instrumentNo} has not been read off the cart. Unknown, not free.`,
    );
  }
}

/** Split a search name into the site's two fields.
 *
 *  The site indexes "SMITH, CHRISTOPHER D." and "SMITH JONATHAN JR ETAL" — comma and space forms
 *  both occur, so both are handled. Entity names ("STARR TECHNICAL SERVICES INC") have no first
 *  name and must go wholly into the last-name field; splitting them puts "TECHNICAL SERVICES INC"
 *  in FirstName and finds nothing. */
export function splitName(name: string): { last: string; first: string } {
  const n = name.trim().replace(/\s+/g, ' ');
  if (!n) return { last: '', first: '' };

  const comma = n.indexOf(',');
  if (comma > 0) return { last: n.slice(0, comma).trim(), first: n.slice(comma + 1).trim() };

  // No comma: treat it as an entity/whole-name search rather than guessing which token is the
  // surname. The site matches on a leading substring, so the full string in LastName is correct for
  // "SMITH JONATHAN JR ETAL" and safe for companies.
  return { last: n, first: '' };
}
