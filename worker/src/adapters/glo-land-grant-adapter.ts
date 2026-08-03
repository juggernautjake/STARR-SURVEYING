// worker/src/adapters/glo-land-grant-adapter.ts — the original surveys (plan S-6).
//
// The Texas General Land Office holds the ORIGINAL land grants: the patents and surveys every later
// conveyance is written against. Six million documents, back to 1720, free, no login.
//
// ── WHY THIS IS NOT A ClerkAdapter ──────────────────────────────────────────────────────────────
//
// Every other adapter here returns CONVEYANCES — A sold to B on this date. GLO returns the
// SOVEREIGN GRANT: the moment the land left the state's hands and became private property, with the
// original survey that defined it.
//
// A Texas metes-and-bounds description is written against that survey — "the JOSE ORTIZ SURVEY,
// ABSTRACT 123". County clerks hold what happened to the land afterwards; GLO holds the thing the
// description is describing. Forcing it into ClerkDocumentResult would mean calling a patentee a
// "grantee" and an abstract number an "instrument number", which are near-misses that read as facts.
//
// So it has its own shape.

import { acquireBrowser } from '../lib/browser-factory.js';
import type { Browser, BrowserContext, Page } from 'playwright';

export const GLO_SEARCH_URL =
  'https://www.glo.texas.gov/archives-heritage/search-our-collections/land-grant-search';

/** Form fields, read off the live page on 2026-08-02. */
export const GLO_FIELDS = {
  county: 'county',
  abstractNumber: 'abstractnumber',
  originalGrantee: 'originalgrantee',
  patentee: 'patentee',
  classType: 'classtype',
  fileNumber: 'filenumber',
  certificate: 'certificate',
  titleDate: 'titledate',
  patentDate: 'patentdate',
  patentNumber: 'patentnumber',
  patentVolume: 'patentvolume',
  partSection: 'partsection',
  surveyBlockTownship: 'surveyblocktownship',
} as const;

/** The submit control.
 *
 *  `#search-button` is the SITE-WIDE search in the page header and submits nothing here — clicking
 *  it looks like a search that returned no results. */
export const GLO_SUBMIT = '#form-submission-button';

/** County values are UPPERCASE in the dropdown ("BELL", not "Bell"). Selecting the wrong case fails
 *  silently and searches every county, or nothing. */
export function countyValue(county: string): string {
  return county.replace(/\s+county$/i, '').trim().toUpperCase();
}

/** One row of the land-grant results table. */
export interface LandGrant {
  county: string;
  /** The abstract number — how a survey is cited in every Texas legal description.
   *
   *  EMPTY when the results table did not actually carry one. GLO renders that column as a "View"
   *  link, so its text is often the word "View"; storing that would put "ABSTRACT View" into a legal
   *  citation. The abstract lives on the detail page, which `detailUrl` points at. */
  abstractNumber: string;
  /** What the abstract cell literally said, kept so a caller can see why it was rejected. */
  abstractCellText?: string;
  districtClass: string;
  fileNumber: string;
  /** Who the land was granted TO originally. */
  originalGrantee: string;
  /** Who received the patent, when recorded separately. */
  patentee: string;
  /** GLO's own stable record id, from the detail link. */
  recordId?: string;
  detailUrl?: string;
  /** Direct PDF of the scanned grant, when the row offers one. */
  pdfUrl?: string;
}

export interface GloSearchReport {
  grants: LandGrant[];
  /** What GLO said the total was — its results are paged, so this is usually larger than `grants`. */
  reportedTotal: number | null;
  /** True when the page returned more than this read covers. */
  truncated: boolean;
  statement: string;
}

/** Read the results table. Runs in the browser. */
const READ_GRANTS = `() => {
  const txt = (el) => (el ? (el.textContent || '').trim().replace(/\\s+/g, ' ') : '');
  const rows = Array.from(document.querySelectorAll('table tr')).filter((r) => r.querySelectorAll('td').length > 3);
  const grants = rows.map((r) => {
    const c = Array.from(r.querySelectorAll('td'));
    const links = Array.from(r.querySelectorAll('a'));
    const detail = links.find((a) => /\\/land-grant\\/\\d+/.test(a.getAttribute('href') || ''));
    const pdf = links.find((a) => /\\.pdf$|\\/PDFs\\//i.test(a.getAttribute('href') || ''));
    // The Abstract column holds a "View" LINK, not the abstract number. Reading its text gives the
    // literal string "View", which would be stored as an abstract number and cited in a legal
    // description. Only accept it when it actually looks like one.
    const abstractCell = txt(c[1]);
    const abstractNumber = /^[0-9]+[A-Za-z]?$/.test(abstractCell) ? abstractCell : '';
    return {
      county: txt(c[0]),
      abstractNumber,
      abstractCellText: abstractCell,
      districtClass: txt(c[2]),
      fileNumber: txt(c[3]),
      originalGrantee: txt(c[4]),
      patentee: txt(c[5]),
      detailUrl: detail ? detail.getAttribute('href') : undefined,
      pdfUrl: pdf ? pdf.getAttribute('href') : undefined,
    };
  });
  const m = (document.body ? document.body.innerText : '').match(/([\\d,]+)\\s*results?/i);
  return { grants, reportedTotal: m ? Number(m[1].replace(/,/g, '')) : null };
}`;

const RECORD_ID = /\/land-grant\/(\d+)/;

/** Pull GLO's stable record id out of a detail href. */
export function recordIdFrom(detailUrl: string | undefined): string | undefined {
  return detailUrl ? (RECORD_ID.exec(detailUrl)?.[1] ?? undefined) : undefined;
}

/** A grant row is only usable if it identifies a survey. */
export function usableGrants(grants: LandGrant[]): LandGrant[] {
  return grants.filter((g) => g.county && (g.abstractNumber || g.fileNumber));
}

export function describeSearch(report: Omit<GloSearchReport, 'statement'>, county: string): string {
  const parts = [`GLO/${county}: ${report.grants.length} land grant(s) read.`];
  if (report.reportedTotal !== null) {
    parts.push(`GLO reports ${report.reportedTotal}.`);
    if (report.truncated) {
      parts.push(
        `TRUNCATED — this is one page of a paged result set. Narrow by abstract number, grantee or ` +
          `survey/block before treating it as the county's complete grant list.`,
      );
    }
  } else {
    parts.push('GLO stated no total, so completeness is UNKNOWN.');
  }
  return parts.join(' ');
}

export class GloLandGrantAdapter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  lastSearchSummary: string | null = null;

  async initSession(): Promise<void> {
    if (this.browser) return;
    this.browser = await acquireBrowser({
      adapterId: 'glo-land-grant',
      launchOptions: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] },
    });
    if (!this.browser) throw new Error('[GLO] Could not acquire a browser.');
    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
      viewport: { width: 1600, height: 1100 },
    });
    this.page = await this.context.newPage();
  }

  async destroySession(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    this.context = null;
    this.page = null;
    this.browser = null;
  }

  /** Search the grant index.
   *
   *  At least one criterion beyond county is strongly advised: Bell alone returns 1,523 grants, and
   *  GLO pages them. */
  async search(criteria: { county: string; abstractNumber?: string; originalGrantee?: string; surveyBlockTownship?: string }): Promise<GloSearchReport> {
    if (!criteria.county?.trim()) {
      throw new Error('[GLO] A county is required — refusing to search the whole state index.');
    }
    await this.initSession();
    const page = this.page!;

    await page.goto(GLO_SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector(`#${GLO_FIELDS.county}, [name=${GLO_FIELDS.county}]`, { timeout: 45_000 });
    // The form is rendered by the page's own JS; filling before it settles loses the values.
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);

    const county = countyValue(criteria.county);
    await page.selectOption(`#${GLO_FIELDS.county}, [name=${GLO_FIELDS.county}]`, county);

    const held = await page.inputValue(`#${GLO_FIELDS.county}, [name=${GLO_FIELDS.county}]`);
    if (held !== county) {
      // Selecting a value the dropdown does not carry fails quietly and searches something else.
      throw new Error(
        `[GLO] County "${criteria.county}" did not take (dropdown holds "${held}"). ` +
          `GLO county values are UPPERCASE and must match its own list exactly. Refusing to submit.`,
      );
    }

    for (const [field, value] of [
      [GLO_FIELDS.abstractNumber, criteria.abstractNumber],
      [GLO_FIELDS.originalGrantee, criteria.originalGrantee],
      [GLO_FIELDS.surveyBlockTownship, criteria.surveyBlockTownship],
    ] as const) {
      if (value) await page.fill(`#${field}, [name=${field}]`, value).catch(() => undefined);
    }

    await page.click(GLO_SUBMIT, { timeout: 25_000 });
    await page
      .waitForFunction(
        () => /\d[\d,]*\s*results?|no results|no records/i.test(document.body?.innerText ?? ''),
        undefined,
        { timeout: 70_000, polling: 600 },
      )
      .catch(() => undefined);

    const out = (await page.evaluate(`(${READ_GRANTS})()`)) as { grants: LandGrant[]; reportedTotal: number | null };
    const grants = usableGrants(out.grants).map((g) => ({ ...g, recordId: recordIdFrom(g.detailUrl) }));
    const truncated = out.reportedTotal !== null && grants.length < out.reportedTotal;

    const report: GloSearchReport = {
      grants,
      reportedTotal: out.reportedTotal,
      truncated,
      statement: describeSearch({ grants, reportedTotal: out.reportedTotal, truncated }, county),
    };
    this.lastSearchSummary = report.statement;
    console.log(`[GLO] ${report.statement}`);
    return report;
  }

  /** Find the grant for a specific abstract — the usual question a legal description raises. */
  async findByAbstract(county: string, abstractNumber: string): Promise<GloSearchReport> {
    return this.search({ county, abstractNumber });
  }
}
