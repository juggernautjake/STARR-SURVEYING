// worker/src/services/paid-platform-registry.ts — Phase 14
// Registry of all automatable paid document platforms for Texas county records.
//
// Architecture principle:
//   1. FREE FIRST: Always attempt free tier (watermarked preview or index-only)
//      before spending money.  AI extraction can work on watermarked images.
//   2. PAID FALLBACK: If free images are insufficient (quality below threshold,
//      no images available at all, or user explicitly requests clean copies),
//      try paid platforms in cost-ascending order.
//   3. COUNTY DIRECT: Some counties have their own payment portals — tried
//      after commercial aggregators when cheaper.
//   4. MANUAL LAST: When no automated option exists, flag for human intervention.
//
// Paid platforms supported:
//   • TexasFile.com          — $1.00/page,  all 254 TX counties,  automated
//   • Kofile/GovOS Pay       — $1.00/page,  ~80 TX counties,      automated
//   • Tyler/Odyssey Pay      — $0.50–$1/pg, ~30 TX counties,      automated
//   • Henschen Pay           — $0.50–$1/pg, ~40 TX counties,      automated
//   • iDocket Subscriber     — subscription, ~20 TX counties,     automated
//   • Fidlar/Laredo Pay      — $0.75–$1/pg, ~15 TX counties,      automated
//   • GovOS County Direct    — $1.00/page,  ~80 TX counties,      semi-auto
//   • LandEx                 — $0.50–$2/pg, national,             API-based
//   • CS LEXI / Accela       — $1.00/page,  various TX,           automated
//   • County Direct Pay      — varies,      varies,               semi-auto
//   • TxDOT Documents        — free–$5,     state-wide ROW,       automated
//   • GLO Archives            — free–$25,    TX land grants,       semi-auto
//
// Spec §14.2 — Paid Platform Registry

import type {
  PaidPlatformDescriptor,
  PaidPlatformId,
  CountyAccessPlan,
  PlatformAvailabilitySummary,
} from '../types/document-access.js';
import {
  getClerkSystem,
} from './clerk-registry.js';
import { HENSCHEN_FIPS_SET } from '../adapters/henschen-clerk-adapter.js';
import { IDOCKET_FIPS_SET } from '../adapters/idocket-clerk-adapter.js';
import { FIDLAR_FIPS_SET } from '../adapters/fidlar-clerk-adapter.js';
import { TYLER_FIPS_SET } from '../adapters/tyler-clerk-adapter.js';

// Re-export the FIPS sets so they can be used by tests
export { HENSCHEN_FIPS_SET } from '../adapters/henschen-clerk-adapter.js';
export { IDOCKET_FIPS_SET }  from '../adapters/idocket-clerk-adapter.js';
export { FIDLAR_FIPS_SET }   from '../adapters/fidlar-clerk-adapter.js';

// ── Kofile county FIPS (from services/clerk-registry.ts) ─────────────────────
// These are the counties known to have Kofile/GovOS PublicSearch deployments.
// Imported directly to avoid circular deps — keep in sync with clerk-registry.ts.
const KOFILE_FIPS_SET = new Set<string>([
  '48027','48491','48453','48309','48099','48145','48281','48331',
  '48029','48019','48091','48187','48259','48325','48013',
  '48497','48143','48139','48251','48221','48367','48185',
  '48073','48005','48347','48455','48471','48473',
  '48137','48465','48105','48451',
  '48039','48041','48057','48469','48481','48477',
  '48375','48381',
  '48053','48055','48035','48049','48083','48093','48095',
]);

// Tyler county FIPS
const TYLER_FIPS_SET = new Set<string>([
  '48113','48085','48121','48439',
  '48201','48215','48029','48141','48157','48167',
  '48183','48199','48245','48303','48373','48397',
  '48423','48453','48491',
]);

// ── Platform Catalog ──────────────────────────────────────────────────────────

/**
 * Master catalog of all known paid document platforms for Texas county records.
 * Sorted by cost-per-page ascending so cheaper options are tried first.
 */
export const PAID_PLATFORM_CATALOG: PaidPlatformDescriptor[] = [
  // ── TxDOT Documents (free for ROW) ────────────────────────────────────────
  {
    id: 'txdot_docs',
    displayName: 'TxDOT Right-of-Way Document Library',
    baseUrl: 'https://www.txdot.gov/apps/row_inquiry/RowInquiry.aspx',
    costPerPage: 0.00,
    automationSupported: true,
    statewide: true,
    coveredFIPS: [],
    authType: 'none',
    paymentMethods: ['free'],
    typicalDeliveryMinutes: 2,
    cleansImages: true,
    notes: 'Free access to TxDOT ROW maps and documents. No account needed. Automation via Playwright.',
  },

  // ── GLO Archives (free for survey abstracts) ──────────────────────────────
  {
    id: 'glo_archives',
    displayName: 'Texas General Land Office Archives',
    baseUrl: 'https://s3.amazonaws.com/data.texashistory.org',
    costPerPage: 0.00,
    automationSupported: true,
    statewide: true,
    coveredFIPS: [],
    authType: 'none',
    paymentMethods: ['free'],
    typicalDeliveryMinutes: 5,
    cleansImages: true,
    notes: 'Free access to historical land grants and survey plats. REST API available.',
  },

  // ── Tyler/Odyssey Pay ─────────────────────────────────────────────────────
  {
    id: 'tyler_pay',
    displayName: 'Tyler Technologies / Odyssey Pay',
    baseUrl: 'https://odyssey.tylertech.com',
    costPerPage: 0.50,
    automationSupported: true,
    statewide: false,
    coveredFIPS: [...TYLER_FIPS_SET],
    authType: 'username_password',
    paymentMethods: ['credit_card', 'platform_wallet', 'stripe_passthrough'],
    typicalDeliveryMinutes: 3,
    cleansImages: true,
    notes: 'Tyler/Odyssey county clerk portals. $0.50–$1.00/page depending on county. Account required.',
  },

  // ── Henschen Pay ──────────────────────────────────────────────────────────
  {
    id: 'henschen_pay',
    displayName: 'Henschen & Associates Pay Portal',
    baseUrl: 'https://henschen-and-assoc.com',
    costPerPage: 0.50,
    automationSupported: true,
    statewide: false,
    coveredFIPS: [...HENSCHEN_FIPS_SET],
    authType: 'username_password',
    paymentMethods: ['credit_card', 'platform_wallet', 'stripe_passthrough'],
    typicalDeliveryMinutes: 5,
    cleansImages: true,
    notes: 'Henschen county pay portals for ~40 Hill Country / Central TX counties. Varies by county.',
  },

  // ── iDocket Subscriber ────────────────────────────────────────────────────
  {
    id: 'idocket_pay',
    displayName: 'iDocket Subscriber Account',
    baseUrl: 'https://idocket.com',
    costPerPage: 0.00, // included in subscription (est. $50–200/mo)
    automationSupported: true,
    statewide: false,
    coveredFIPS: [...IDOCKET_FIPS_SET],
    authType: 'subscription',
    paymentMethods: ['subscription_included', 'stripe_passthrough'],
    typicalDeliveryMinutes: 2,
    cleansImages: true,
    notes: 'iDocket subscriber account unlocks full image access. Subscription billing via Stripe.',
  },

  // ── LandEx ────────────────────────────────────────────────────────────────
  {
    id: 'landex',
    displayName: 'LandEx (National Land Records Platform)',
    baseUrl: 'https://www.landex.com',
    costPerPage: 0.50,
    automationSupported: true,
    statewide: true,
    coveredFIPS: [],
    authType: 'api_key',
    paymentMethods: ['platform_wallet', 'stripe_passthrough'],
    typicalDeliveryMinutes: 3,
    cleansImages: true,
    notes: 'LandEx provides API access to land records for many TX counties. REST API, $0.50–$2/page.',
  },

  // ── Fidlar Pay ────────────────────────────────────────────────────────────
  {
    id: 'fidlar_pay',
    displayName: 'Fidlar / Laredo Pay Account',
    baseUrl: 'https://laredo.fidlar.com',
    costPerPage: 0.75,
    automationSupported: true,
    statewide: false,
    coveredFIPS: [...FIDLAR_FIPS_SET],
    authType: 'username_password',
    paymentMethods: ['credit_card', 'platform_wallet', 'stripe_passthrough'],
    typicalDeliveryMinutes: 5,
    cleansImages: true,
    notes: 'Fidlar/Laredo pay portal for ~15 East TX + Panhandle counties. $0.75–$1/page.',
  },

  // ── CS LEXI / Accela ──────────────────────────────────────────────────────
  {
    id: 'cs_lexi',
    displayName: 'CS LEXI / Accela Land Records',
    baseUrl: 'https://cslexi.com',
    costPerPage: 1.00,
    automationSupported: true,
    statewide: false,
    coveredFIPS: [
      '48167', // Guadalupe
      '48029', // Bexar (supplemental)
      '48209', // Hays (supplemental)
      '48055', // Caldwell
    ],
    authType: 'username_password',
    paymentMethods: ['credit_card', 'stripe_passthrough'],
    typicalDeliveryMinutes: 5,
    cleansImages: true,
    notes: 'CS LEXI / Accela land records platform used by some Central TX counties.',
  },

  // ── GovOS County Direct ───────────────────────────────────────────────────
  {
    id: 'govos_direct',
    displayName: 'GovOS County Direct Checkout',
    baseUrl: 'https://govos.com',
    costPerPage: 1.00,
    automationSupported: true,
    statewide: false,
    coveredFIPS: [...KOFILE_FIPS_SET],
    authType: 'credit_card_guest',
    paymentMethods: ['credit_card', 'stripe_passthrough'],
    typicalDeliveryMinutes: 5,
    cleansImages: true,
    notes: 'GovOS / PublicSearch direct county checkout. Guest checkout available (no account). $1/page.',
  },

  // ── Kofile Pay (account) ──────────────────────────────────────────────────
  {
    id: 'kofile_pay',
    displayName: 'Kofile / GovOS PublicSearch Account',
    baseUrl: 'https://publicsearch.us',
    costPerPage: 1.00,
    automationSupported: true,
    statewide: false,
    coveredFIPS: [...KOFILE_FIPS_SET],
    authType: 'username_password',
    paymentMethods: ['credit_card', 'platform_wallet', 'stripe_passthrough'],
    typicalDeliveryMinutes: 3,
    cleansImages: true,
    notes: 'Kofile/GovOS account purchase. Account with payment on file required. $1/page.',
  },

  // ── TexasFile.com ─────────────────────────────────────────────────────────
  {
    id: 'texasfile',
    displayName: 'TexasFile.com',
    baseUrl: 'https://www.texasfile.com',
    costPerPage: 1.00,
    automationSupported: true,
    statewide: true,
    coveredFIPS: [],
    authType: 'username_password',
    paymentMethods: ['credit_card', 'platform_wallet', 'stripe_passthrough'],
    typicalDeliveryMinutes: 5,
    cleansImages: true,
    notes: 'TexasFile covers all 254 TX counties. $1/page. Universal fallback for paid access.',
  },

  // ── County Direct Pay ─────────────────────────────────────────────────────
  {
    id: 'county_direct_pay',
    displayName: 'County Clerk Direct Payment Portal',
    baseUrl: '',  // Set per-county
    costPerPage: 1.00,
    automationSupported: false, // Varies by county; some can be automated
    statewide: false,
    coveredFIPS: [],
    authType: 'credit_card_guest',
    paymentMethods: ['credit_card'],
    typicalDeliveryMinutes: 2880, // 2 days typical
    cleansImages: true,
    notes: 'Some counties accept direct credit card payment on their own portal. Automation varies.',
  },
];

// ── Platform lookup map ───────────────────────────────────────────────────────

const PLATFORM_MAP = new Map<PaidPlatformId, PaidPlatformDescriptor>(
  PAID_PLATFORM_CATALOG.map((p) => [p.id, p]),
);

// ── PaidPlatformRegistry ──────────────────────────────────────────────────────

/**
 * Registry of all paid document platforms for Texas county records.
 * Provides per-county access plans and platform availability summaries.
 */
export class PaidPlatformRegistry {

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Get a platform descriptor by ID.
   */
  static getPlatform(id: PaidPlatformId): PaidPlatformDescriptor | undefined {
    return PLATFORM_MAP.get(id);
  }

  /**
   * Get all platforms that cover a specific Texas county (by 5-digit FIPS).
   * Results are sorted by cost-per-page ascending (cheapest first).
   * Statewide platforms (TexasFile, LandEx, TxDOT, GLO) are always included.
   */
  static getPlatformsForCounty(countyFIPS: string): PaidPlatformDescriptor[] {
    const platforms = PAID_PLATFORM_CATALOG.filter(
      (p) => p.statewide || p.coveredFIPS.includes(countyFIPS),
    );
    // Sort: free first, then by cost ascending, then by automation capability
    return platforms.sort((a, b) => {
      if (a.costPerPage !== b.costPerPage) return a.costPerPage - b.costPerPage;
      // Automation-supported platforms rank higher
      if (a.automationSupported !== b.automationSupported) {
        return a.automationSupported ? -1 : 1;
      }
      return 0;
    });
  }

  /**
   * Generate a complete access plan for a county.
   * Describes free options (Tier 0/1) and all paid options (Tier 2+).
   */
  static getAccessPlan(
    countyFIPS: string,
    countyName: string,
  ): CountyAccessPlan {
    const clerkSystem = getClerkSystem(countyFIPS);

    const freeAccess = {
      hasWatermarkedPreview: KOFILE_FIPS_SET.has(countyFIPS),
      hasIndexOnly: ['countyfusion', 'tyler', 'henschen', 'idocket', 'fidlar', 'texasfile'].includes(clerkSystem),
      clerkSystem,
      previewSource: KOFILE_FIPS_SET.has(countyFIPS) ? 'Kofile/GovOS PublicSearch' : undefined,
    };

    const paidPlatforms = PaidPlatformRegistry.getPlatformsForCounty(countyFIPS);

    const automatedPlatforms = paidPlatforms.filter(
      (p) => p.automationSupported && p.costPerPage > 0,
    );
    const minimumCostPerPage = automatedPlatforms.length > 0
      ? Math.min(...automatedPlatforms.map((p) => p.costPerPage))
      : 1.00;

    // Recommend the cheapest automated platform that covers this county
    const recommendedPlatform = automatedPlatforms.length > 0
      ? automatedPlatforms[0]?.id ?? null
      : null;

    return {
      countyFIPS,
      countyName,
      freeAccess,
      paidPlatforms,
      minimumCostPerPage,
      hasAutomatedPaidOption: automatedPlatforms.length > 0,
      recommendedPlatform,
    };
  }

  /**
   * Get a summary of platform availability across all covered Texas counties.
   * Useful for admin dashboards and diagnostics.
   *
   * @param configuredPlatformIds  IDs of platforms for which credentials
   *                               are currently configured in the environment.
   */
  static getAvailabilitySummary(
    configuredPlatformIds: PaidPlatformId[] = [],
  ): PlatformAvailabilitySummary {
    // Approximate Texas county counts (all 254 TX counties)
    const totalCounties = 254;
    const configuredSet = new Set(configuredPlatformIds);

    return {
      totalCounties,
      coveredByFreePreview:   KOFILE_FIPS_SET.size,
      coveredByFreeIndex:     totalCounties - KOFILE_FIPS_SET.size,
      coveredByAutomatedPaid: totalCounties, // TexasFile covers all 254
      requiresManual:         0, // TexasFile is the ultimate fallback
      platforms: PAID_PLATFORM_CATALOG.map((p) => ({
        id:                    p.id,
        displayName:           p.displayName,
        countiesSupported:     p.statewide ? totalCounties : p.coveredFIPS.length,
        costPerPage:           p.costPerPage,
        automationSupported:   p.automationSupported,
        configuredForUse:      configuredSet.has(p.id),
      })),
    };
  }

  /**
   * Determine which paid platforms are configured based on environment variables.
   * Checks for presence of required credentials in process.env.
   */
  static getConfiguredPlatforms(): PaidPlatformId[] {
    const configured: PaidPlatformId[] = [];

    if (process.env.TEXASFILE_USERNAME && process.env.TEXASFILE_PASSWORD) {
      configured.push('texasfile');
    }
    if (process.env.KOFILE_USERNAME && process.env.KOFILE_PASSWORD) {
      configured.push('kofile_pay');
    }
    if (process.env.TYLER_PAY_USERNAME && process.env.TYLER_PAY_PASSWORD) {
      configured.push('tyler_pay');
    }
    if (process.env.HENSCHEN_PAY_USERNAME && process.env.HENSCHEN_PAY_PASSWORD) {
      configured.push('henschen_pay');
    }
    if (process.env.IDOCKET_PAY_USERNAME && process.env.IDOCKET_PAY_PASSWORD) {
      configured.push('idocket_pay');
    }
    if (process.env.FIDLAR_PAY_USERNAME && process.env.FIDLAR_PAY_PASSWORD) {
      configured.push('fidlar_pay');
    }
    if (process.env.GOVOS_ACCOUNT_USERNAME && process.env.GOVOS_ACCOUNT_PASSWORD) {
      configured.push('govos_direct');
    }
    if (process.env.LANDEX_API_KEY && process.env.LANDEX_ACCOUNT_ID) {
      configured.push('landex');
    }
    if (process.env.CSLEXI_USERNAME && process.env.CSLEXI_PASSWORD) {
      configured.push('cs_lexi');
    }
    // TxDOT and GLO are always available (no auth needed)
    configured.push('txdot_docs', 'glo_archives');

    return configured;
  }

  /**
   * Load platform credentials from environment variables.
   * Returns only platforms that have complete credentials configured.
   */
  static loadCredentialsFromEnv(): import('../types/document-access.js').PlatformCredentialMap {
    const creds: import('../types/document-access.js').PlatformCredentialMap = {};

    if (process.env.TEXASFILE_USERNAME && process.env.TEXASFILE_PASSWORD) {
      creds.texasfile = {
        username: process.env.TEXASFILE_USERNAME,
        password: process.env.TEXASFILE_PASSWORD,
      };
    }
    if (process.env.KOFILE_USERNAME && process.env.KOFILE_PASSWORD) {
      creds.kofile_pay = {
        username: process.env.KOFILE_USERNAME,
        password: process.env.KOFILE_PASSWORD,
        paymentOnFile: process.env.KOFILE_PAYMENT_ON_FILE === 'true',
      };
    }
    if (process.env.TYLER_PAY_USERNAME && process.env.TYLER_PAY_PASSWORD) {
      creds.tyler_pay = {
        username: process.env.TYLER_PAY_USERNAME,
        password: process.env.TYLER_PAY_PASSWORD,
      };
    }
    if (process.env.HENSCHEN_PAY_USERNAME && process.env.HENSCHEN_PAY_PASSWORD) {
      creds.henschen_pay = {
        username: process.env.HENSCHEN_PAY_USERNAME,
        password: process.env.HENSCHEN_PAY_PASSWORD,
      };
    }
    if (process.env.IDOCKET_PAY_USERNAME && process.env.IDOCKET_PAY_PASSWORD) {
      creds.idocket_pay = {
        username: process.env.IDOCKET_PAY_USERNAME,
        password: process.env.IDOCKET_PAY_PASSWORD,
      };
    }
    if (process.env.FIDLAR_PAY_USERNAME && process.env.FIDLAR_PAY_PASSWORD) {
      creds.fidlar_pay = {
        username: process.env.FIDLAR_PAY_USERNAME,
        password: process.env.FIDLAR_PAY_PASSWORD,
      };
    }
    if (process.env.GOVOS_ACCOUNT_USERNAME && process.env.GOVOS_ACCOUNT_PASSWORD) {
      creds.govos_direct = {
        accountUsername: process.env.GOVOS_ACCOUNT_USERNAME,
        accountPassword: process.env.GOVOS_ACCOUNT_PASSWORD,
      };
    }
    if (process.env.LANDEX_API_KEY && process.env.LANDEX_ACCOUNT_ID) {
      creds.landex = {
        apiKey:    process.env.LANDEX_API_KEY,
        accountId: process.env.LANDEX_ACCOUNT_ID,
      };
    }
    if (process.env.CSLEXI_USERNAME && process.env.CSLEXI_PASSWORD) {
      creds.cs_lexi = {
        username: process.env.CSLEXI_USERNAME,
        password: process.env.CSLEXI_PASSWORD,
      };
    }

    return creds;
  }

  /**
   * Return all platforms sorted by recommended priority for a given county.
   * Incorporates: county coverage, cost, automation capability, and configured status.
   */
  static getRankedPlatforms(
    countyFIPS: string,
    configuredPlatformIds: PaidPlatformId[],
  ): PaidPlatformDescriptor[] {
    const configured = new Set(configuredPlatformIds);
    const all = PaidPlatformRegistry.getPlatformsForCounty(countyFIPS);

    return all.sort((a, b) => {
      // 1. Configured platforms rank higher (not useful if not set up)
      const aConfigured = configured.has(a.id) ? 0 : 1;
      const bConfigured = configured.has(b.id) ? 0 : 1;
      if (aConfigured !== bConfigured) return aConfigured - bConfigured;

      // 2. Cheaper first
      if (a.costPerPage !== b.costPerPage) return a.costPerPage - b.costPerPage;

      // 3. Automated platforms rank higher
      if (a.automationSupported !== b.automationSupported) {
        return a.automationSupported ? -1 : 1;
      }

      // 4. Faster delivery first
      return a.typicalDeliveryMinutes - b.typicalDeliveryMinutes;
    });
  }
}

// ── Convenience exports ───────────────────────────────────────────────────────

export {
  PLATFORM_MAP,
};

// Re-export Kofile and Tyler FIPS sets for testing
export { KOFILE_FIPS_SET, TYLER_FIPS_SET };
