// worker/src/infra/county-config-registry.ts
// Phase 16: County Configuration Registry
//
// Provides per-county portal configuration (URLs, selectors, rate limits, etc.)
// so purchase adapters can read county-specific overrides without code changes.
// Operator-managed JSON files can extend or override defaults at runtime.

import * as fs from 'fs';

// ── Public types ──────────────────────────────────────────────────────────────

export type PortalPlatform =
  | 'tyler_pay'
  | 'henschen_pay'
  | 'idocket_pay'
  | 'fidlar_pay'
  | 'govos_direct'
  | 'kofile'
  | 'texasfile'
  | 'landex';

export interface CountyPortalSelectors {
  searchInput?: string;
  searchButton?: string;
  resultsTable?: string;
  documentRow?: string;
  instrumentNumberCell?: string;
  purchaseButton?: string;
  checkoutButton?: string;
  downloadButton?: string;
  cardNumberInput?: string;
}

export interface CountyPortalConfig {
  countyFIPS: string;
  countyName: string;
  platform: PortalPlatform;
  baseUrl?: string;
  loginUrl?: string;
  searchUrl?: string;
  selectors?: CountyPortalSelectors;
  rateLimitRpm?: number;
  extraHeaders?: Record<string, string>;
  isSpa?: boolean;
  usesIframe?: boolean;
  spaHydrationDelayMs?: number;
  /** e.g. "TYLER_PAY_DALLAS" → looks for TYLER_PAY_DALLAS_USERNAME in env */
  credentialEnvPrefix?: string;
  notes?: string;
}

export interface ValidationResult {
  valid: boolean;
  missingFields: string[];
}

// Shared selectors for GovOS-family portals (Kofile and GovOS Direct use the same UI)
const GOVOS_FAMILY_SELECTORS: CountyPortalSelectors = {
  searchInput: 'input.search-input',
  searchButton: 'button.search-button',
  resultsTable: '.results-container',
  documentRow: '.result-item',
  instrumentNumberCell: '.instrument-num',
  purchaseButton: '.btn-purchase',
  checkoutButton: '.btn-checkout',
  downloadButton: '.btn-download',
  cardNumberInput: 'input[name="cc_number"]',
};

// ── Platform defaults ─────────────────────────────────────────────────────────

const PLATFORM_DEFAULTS: Record<PortalPlatform, Partial<CountyPortalConfig>> = {
  tyler_pay: {
    platform: 'tyler_pay',
    rateLimitRpm: 20,
    isSpa: false,
    usesIframe: false,
    selectors: {
      searchInput: '#SearchText',
      searchButton: '#SearchButton',
      resultsTable: '#SearchResults',
      documentRow: 'tr.resultsRow',
      instrumentNumberCell: 'td.instrument',
      purchaseButton: 'a.addToCart',
      checkoutButton: '#checkout',
      downloadButton: 'a.downloadDoc',
      cardNumberInput: '#cardNumber',
    },
  },
  henschen_pay: {
    platform: 'henschen_pay',
    rateLimitRpm: 15,
    isSpa: false,
    usesIframe: true,
    selectors: {
      searchInput: 'input[name="SearchText"]',
      searchButton: 'input[type="submit"]',
      resultsTable: 'table.searchResults',
      documentRow: 'tr.dataRow',
      instrumentNumberCell: 'td:nth-child(2)',
      purchaseButton: 'a[href*="purchase"]',
      checkoutButton: 'input[value="Checkout"]',
      downloadButton: 'a[href*="download"]',
      cardNumberInput: 'input[name="cardNumber"]',
    },
  },
  idocket_pay: {
    platform: 'idocket_pay',
    rateLimitRpm: 10,
    isSpa: true,
    usesIframe: false,
    spaHydrationDelayMs: 1500,
    selectors: {
      searchInput: '[data-testid="search-input"]',
      searchButton: '[data-testid="search-btn"]',
      resultsTable: '[data-testid="results-table"]',
      documentRow: '[data-testid="result-row"]',
      instrumentNumberCell: '[data-testid="instrument-number"]',
      purchaseButton: '[data-testid="purchase-btn"]',
      checkoutButton: '[data-testid="checkout-btn"]',
      downloadButton: '[data-testid="download-btn"]',
      cardNumberInput: '[data-testid="card-number"]',
    },
  },
  fidlar_pay: {
    platform: 'fidlar_pay',
    rateLimitRpm: 12,
    isSpa: false,
    usesIframe: false,
    selectors: {
      searchInput: '#instrno',
      searchButton: '#btnSearch',
      resultsTable: '#tblResults',
      documentRow: 'tr.resultRow',
      instrumentNumberCell: '.instrNum',
      purchaseButton: '.btnOrder',
      checkoutButton: '#btnCheckout',
      downloadButton: '.btnDownload',
      cardNumberInput: '#txtCardNum',
    },
  },
  govos_direct: {
    platform: 'govos_direct',
    rateLimitRpm: 10,
    isSpa: true,
    usesIframe: false,
    spaHydrationDelayMs: 2000,
    selectors: GOVOS_FAMILY_SELECTORS,
  },
  kofile: {
    platform: 'kofile',
    rateLimitRpm: 10,
    isSpa: true,
    usesIframe: false,
    spaHydrationDelayMs: 2000,
    selectors: GOVOS_FAMILY_SELECTORS,
  },
  texasfile: {
    platform: 'texasfile',
    rateLimitRpm: 20,
    isSpa: false,
    usesIframe: false,
    selectors: {
      searchInput: '#SearchBox',
      searchButton: '#SearchBtn',
      resultsTable: '#ResultsTable',
      documentRow: 'tr.docRow',
      instrumentNumberCell: 'td.instrNo',
      purchaseButton: 'a.purchase-link',
      checkoutButton: '#checkoutBtn',
      downloadButton: 'a.download-link',
    },
  },
  landex: {
    platform: 'landex',
    rateLimitRpm: 30,
    isSpa: false,
    usesIframe: false,
  },
};

// ── Default county configs ────────────────────────────────────────────────────

const DEFAULT_COUNTY_CONFIGS: CountyPortalConfig[] = [
  // Bell County — 48027 — Henschen Pay
  {
    countyFIPS: '48027',
    countyName: 'Bell',
    platform: 'henschen_pay',
    baseUrl: 'https://www.bellcountytx.com/recorder',
    credentialEnvPrefix: 'HENSCHEN_PAY_BELL',
    rateLimitRpm: 15,
    notes: 'Bell County clerk uses Henschen Pay portal',
  },
  // Dallas County — 48113 — Tyler Pay
  {
    countyFIPS: '48113',
    countyName: 'Dallas',
    platform: 'tyler_pay',
    baseUrl: 'https://dallas.tylerpay.com',
    loginUrl: 'https://dallas.tylerpay.com/login',
    searchUrl: 'https://dallas.tylerpay.com/search',
    credentialEnvPrefix: 'TYLER_PAY_DALLAS',
    rateLimitRpm: 20,
    notes: 'Dallas County — Tyler/Odyssey portal',
  },
  // Tarrant County — 48439 — Tyler Pay
  {
    countyFIPS: '48439',
    countyName: 'Tarrant',
    platform: 'tyler_pay',
    baseUrl: 'https://tarrant.tylerpay.com',
    loginUrl: 'https://tarrant.tylerpay.com/login',
    searchUrl: 'https://tarrant.tylerpay.com/search',
    credentialEnvPrefix: 'TYLER_PAY_TARRANT',
    rateLimitRpm: 20,
    notes: 'Tarrant County — Tyler/Odyssey portal',
  },
  // Harris County — 48201 — Tyler Pay
  {
    countyFIPS: '48201',
    countyName: 'Harris',
    platform: 'tyler_pay',
    baseUrl: 'https://harris.tylerpay.com',
    loginUrl: 'https://harris.tylerpay.com/login',
    searchUrl: 'https://harris.tylerpay.com/search',
    credentialEnvPrefix: 'TYLER_PAY_HARRIS',
    rateLimitRpm: 20,
    notes: 'Harris County (Houston) — Tyler/Odyssey portal',
  },
  // Bexar County — 48029 — GovOS/Kofile
  {
    countyFIPS: '48029',
    countyName: 'Bexar',
    platform: 'kofile',
    baseUrl: 'https://bexar.tx.publicsearch.us',
    credentialEnvPrefix: 'GOVOS_BEXAR',
    rateLimitRpm: 10,
    isSpa: true,
    spaHydrationDelayMs: 2000,
    notes: 'Bexar County (San Antonio) — Kofile/GovOS portal',
  },
  // Collin County — 48085 — Tyler Pay
  {
    countyFIPS: '48085',
    countyName: 'Collin',
    platform: 'tyler_pay',
    baseUrl: 'https://collin.tylerpay.com',
    loginUrl: 'https://collin.tylerpay.com/login',
    searchUrl: 'https://collin.tylerpay.com/search',
    credentialEnvPrefix: 'TYLER_PAY_COLLIN',
    rateLimitRpm: 20,
    notes: 'Collin County — Tyler/Odyssey portal',
  },
  // Denton County — 48121 — Tyler Pay
  {
    countyFIPS: '48121',
    countyName: 'Denton',
    platform: 'tyler_pay',
    baseUrl: 'https://denton.tylerpay.com',
    loginUrl: 'https://denton.tylerpay.com/login',
    searchUrl: 'https://denton.tylerpay.com/search',
    credentialEnvPrefix: 'TYLER_PAY_DENTON',
    rateLimitRpm: 20,
    notes: 'Denton County — Tyler/Odyssey portal',
  },
  // Fort Bend County — 48157 — Tyler Pay
  {
    countyFIPS: '48157',
    countyName: 'Fort Bend',
    platform: 'tyler_pay',
    baseUrl: 'https://fortbend.tylerpay.com',
    loginUrl: 'https://fortbend.tylerpay.com/login',
    searchUrl: 'https://fortbend.tylerpay.com/search',
    credentialEnvPrefix: 'TYLER_PAY_FORT_BEND',
    rateLimitRpm: 20,
    notes: 'Fort Bend County — Tyler/Odyssey portal',
  },
  // Williamson County — 48491 — Henschen Pay
  {
    countyFIPS: '48491',
    countyName: 'Williamson',
    platform: 'henschen_pay',
    baseUrl: 'https://www.wilco.org/recorder',
    credentialEnvPrefix: 'HENSCHEN_PAY_WILLIAMSON',
    rateLimitRpm: 15,
    notes: 'Williamson County — Henschen Pay portal',
  },
  // Travis County — 48453 — Henschen Pay
  {
    countyFIPS: '48453',
    countyName: 'Travis',
    platform: 'henschen_pay',
    baseUrl: 'https://deed.traviscountytx.gov',
    credentialEnvPrefix: 'HENSCHEN_PAY_TRAVIS',
    rateLimitRpm: 15,
    notes: 'Travis County (Austin) — Henschen Pay portal',
  },
];

// Required selectors per platform for validation
const REQUIRED_SELECTORS: Partial<Record<PortalPlatform, (keyof CountyPortalSelectors)[]>> = {
  tyler_pay:    ['searchInput', 'resultsTable', 'purchaseButton', 'downloadButton'],
  henschen_pay: ['searchInput', 'resultsTable', 'purchaseButton'],
  idocket_pay:  ['searchInput', 'resultsTable', 'purchaseButton'],
  fidlar_pay:   ['searchInput', 'resultsTable', 'purchaseButton', 'downloadButton'],
  govos_direct: ['searchInput', 'resultsTable', 'purchaseButton'],
  kofile:       ['searchInput', 'resultsTable', 'purchaseButton'],
};

// ── CountyConfigRegistry class ────────────────────────────────────────────────

export class CountyConfigRegistry {
  private configs: Map<string, CountyPortalConfig> = new Map();

  constructor() {
    this._loadDefaults();
  }

  private _key(fips: string, platform: string): string {
    return `${fips}::${platform}`;
  }

  private _loadDefaults(): void {
    for (const config of DEFAULT_COUNTY_CONFIGS) {
      this.configs.set(this._key(config.countyFIPS, config.platform), config);
    }
  }

  /**
   * Retrieve config for a county FIPS, optionally filtered by platform.
   * If platform is omitted, returns the first match for that FIPS.
   */
  get(countyFIPS: string, platform?: string): CountyPortalConfig | null {
    if (platform) {
      return this.configs.get(this._key(countyFIPS, platform)) ?? null;
    }
    for (const config of this.configs.values()) {
      if (config.countyFIPS === countyFIPS) return config;
    }
    return null;
  }

  /** Add or replace a county config entry. */
  set(config: CountyPortalConfig): void {
    this.configs.set(this._key(config.countyFIPS, config.platform), config);
  }

  /** Return all registered configs as an array. */
  getAll(): CountyPortalConfig[] {
    return Array.from(this.configs.values());
  }

  /** Return the platform-level defaults (selectors, rate limits, etc.) for a platform. */
  getPlatformDefaults(platform: string): Partial<CountyPortalConfig> {
    return PLATFORM_DEFAULTS[platform as PortalPlatform] ?? {};
  }

  /**
   * Merge a base config with per-county overrides.
   * Nested objects (selectors, extraHeaders) are shallow-merged so individual
   * selector overrides don't discard all defaults.
   */
  merge(
    base: Partial<CountyPortalConfig>,
    override: Partial<CountyPortalConfig>,
  ): CountyPortalConfig {
    const merged: Partial<CountyPortalConfig> = { ...base, ...override };
    if (base.selectors || override.selectors) {
      merged.selectors = { ...(base.selectors ?? {}), ...(override.selectors ?? {}) };
    }
    if (base.extraHeaders || override.extraHeaders) {
      merged.extraHeaders = { ...(base.extraHeaders ?? {}), ...(override.extraHeaders ?? {}) };
    }
    return merged as CountyPortalConfig;
  }

  /** Load additional configs from a JSON file (operator customization). */
  loadFromFile(filePath: string): void {
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const entries: CountyPortalConfig[] = JSON.parse(raw);
    for (const config of entries) {
      this.set(config);
    }
  }

  /** Persist current registry to a JSON file. */
  saveToFile(filePath: string): void {
    const entries = this.getAll();
    fs.writeFileSync(filePath, JSON.stringify(entries, null, 2), 'utf-8');
  }

  /** Check that all required selectors (per platform) are present. */
  validate(config: CountyPortalConfig): ValidationResult {
    const missingFields: string[] = [];

    if (!config.countyFIPS) missingFields.push('countyFIPS');
    if (!config.countyName) missingFields.push('countyName');
    if (!config.platform)   missingFields.push('platform');

    const requiredSelectors = REQUIRED_SELECTORS[config.platform] ?? [];
    for (const sel of requiredSelectors) {
      if (!config.selectors?.[sel]) {
        missingFields.push(`selectors.${sel}`);
      }
    }

    return { valid: missingFields.length === 0, missingFields };
  }
}

// ── Singleton export ───────────────────────────────────────────────────────────

export const countyConfigRegistry = new CountyConfigRegistry();
