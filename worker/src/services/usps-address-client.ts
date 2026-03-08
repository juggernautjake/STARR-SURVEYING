// worker/src/services/usps-address-client.ts
// Phase 16: USPS Address Validation Client
//
// Calls the USPS Web Tools Address Validation API to normalize and verify
// mailing addresses. Falls back gracefully when no USPS_USER_ID is configured.
//
// Also exports `normalizeTexasAddress()`, a zero-dependency normalizer that
// handles common Texas rural address patterns (FM roads, county roads, rural
// routes, highway addresses) without any network call.

import * as https from 'https';

// ── Public types ──────────────────────────────────────────────────────────────

export interface AddressInput {
  address1: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface NormalizedAddress {
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip5: string;
  zip4?: string;
  deliveryPoint?: string;
  carrierRoute?: string;
  /** Y=confirmed, S=secondary missing, D=default, N=invalid */
  dpvConfirmation?: 'Y' | 'S' | 'D' | 'N';
  isDeliverable: boolean;
  isCorrected: boolean;
  originalInput: AddressInput;
}

export interface TexasNormalizedAddress {
  address1: string;
  city: string;
  state: 'TX';
  county?: string;
  isRuralRoute: boolean;
  isHighwayAddress: boolean;
}

// ── USPS API helpers ──────────────────────────────────────────────────────────

const USPS_API_BASE = 'https://secure.shippingapis.com/ShippingAPI.dll';

function buildUspsXml(userId: string, addresses: AddressInput[]): string {
  const items = addresses
    .slice(0, 5)
    .map((addr, i) =>
      `<Address ID="${i}">` +
      `<Address1>${escapeXml(addr.address2 ?? '')}</Address1>` +
      `<Address2>${escapeXml(addr.address1)}</Address2>` +
      `<City>${escapeXml(addr.city ?? '')}</City>` +
      `<State>${escapeXml(addr.state ?? 'TX')}</State>` +
      `<Zip5>${escapeXml(addr.zip ?? '')}</Zip5>` +
      `<Zip4></Zip4>` +
      `</Address>`,
    )
    .join('');
  return `<AddressValidateRequest USERID="${escapeXml(userId)}">${items}</AddressValidateRequest>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1].trim() : '';
}

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function parseUspsResponse(xml: string, originals: AddressInput[]): NormalizedAddress[] {
  const addressBlocks = xml.match(/<Address ID="\d+">([\s\S]*?)<\/Address>/g) ?? [];

  return addressBlocks.map((block, i) => {
    const original = originals[i] ?? originals[0];
    const error = extractTag(block, 'Error');
    if (error || block.includes('<Error>')) {
      return {
        address1: original.address1,
        address2: original.address2,
        city: original.city ?? '',
        state: original.state ?? 'TX',
        zip5: original.zip ?? '',
        isDeliverable: false,
        isCorrected: false,
        originalInput: original,
      };
    }

    const address2 = extractTag(block, 'Address2'); // primary line in USPS response
    const address1 = extractTag(block, 'Address1'); // secondary (apt, suite)
    const city     = extractTag(block, 'City');
    const state    = extractTag(block, 'State');
    const zip5     = extractTag(block, 'Zip5');
    const zip4     = extractTag(block, 'Zip4');
    const dpv      = extractTag(block, 'DPVConfirmation') as NormalizedAddress['dpvConfirmation'];

    const normalizedLine1 = address2 || original.address1;
    const isCorrected =
      normalizedLine1.toUpperCase() !== original.address1.toUpperCase() ||
      city.toUpperCase() !== (original.city ?? '').toUpperCase();

    return {
      address1: normalizedLine1,
      ...(address1 ? { address2: address1 } : {}),
      city: city || original.city || '',
      state: state || original.state || 'TX',
      zip5: zip5 || original.zip || '',
      ...(zip4 ? { zip4 } : {}),
      ...(dpv ? { dpvConfirmation: dpv } : {}),
      isDeliverable: dpv === 'Y' || dpv === 'S',
      isCorrected,
      originalInput: original,
    };
  });
}

// ── USPSAddressClient ─────────────────────────────────────────────────────────

export class USPSAddressClient {
  private userId: string;

  constructor(userId?: string) {
    this.userId = userId ?? process.env.USPS_USER_ID ?? '';
  }

  get isConfigured(): boolean {
    return this.userId.length > 0;
  }

  /**
   * Verify and normalize a single address via USPS Web Tools.
   * Returns a best-effort result even when the API is unavailable.
   */
  async verify(address: AddressInput): Promise<NormalizedAddress> {
    if (!this.isConfigured) {
      return {
        address1: address.address1,
        address2: address.address2,
        city: address.city ?? '',
        state: address.state ?? 'TX',
        zip5: address.zip ?? '',
        isDeliverable: false,
        isCorrected: false,
        originalInput: address,
      };
    }

    try {
      const xml = buildUspsXml(this.userId, [address]);
      const url = `${USPS_API_BASE}?API=Verify&XML=${encodeURIComponent(xml)}`;
      const responseXml = await httpGet(url);
      const results = parseUspsResponse(responseXml, [address]);
      return results[0] ?? {
        address1: address.address1,
        city: address.city ?? '',
        state: address.state ?? 'TX',
        zip5: address.zip ?? '',
        isDeliverable: false,
        isCorrected: false,
        originalInput: address,
      };
    } catch {
      return {
        address1: address.address1,
        address2: address.address2,
        city: address.city ?? '',
        state: address.state ?? 'TX',
        zip5: address.zip ?? '',
        isDeliverable: false,
        isCorrected: false,
        originalInput: address,
      };
    }
  }

  /**
   * Verify up to 5 addresses in a single USPS API call.
   * USPS Web Tools enforces a hard limit of 5 addresses per batch request.
   */
  async verifyBatch(addresses: AddressInput[]): Promise<NormalizedAddress[]> {
    if (addresses.length === 0) return [];

    const batch = addresses.slice(0, 5);

    if (!this.isConfigured) {
      return batch.map(address => ({
        address1: address.address1,
        address2: address.address2,
        city: address.city ?? '',
        state: address.state ?? 'TX',
        zip5: address.zip ?? '',
        isDeliverable: false,
        isCorrected: false,
        originalInput: address,
      }));
    }

    try {
      const xml = buildUspsXml(this.userId, batch);
      const url = `${USPS_API_BASE}?API=Verify&XML=${encodeURIComponent(xml)}`;
      const responseXml = await httpGet(url);
      return parseUspsResponse(responseXml, batch);
    } catch {
      return batch.map(address => ({
        address1: address.address1,
        address2: address.address2,
        city: address.city ?? '',
        state: address.state ?? 'TX',
        zip5: address.zip ?? '',
        isDeliverable: false,
        isCorrected: false,
        originalInput: address,
      }));
    }
  }

  /**
   * Parse a freeform address string and verify it with USPS.
   * Returns null if the string cannot be parsed into address components.
   */
  async normalize(rawAddress: string): Promise<NormalizedAddress | null> {
    const parsed = parseRawAddress(rawAddress);
    if (!parsed) return null;
    return this.verify(parsed);
  }
}

// ── Raw address parser ────────────────────────────────────────────────────────

function parseRawAddress(raw: string): AddressInput | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Attempt to split "123 Main St, City, TX 78701"
  const parts = trimmed.split(',').map(p => p.trim());
  if (parts.length >= 3) {
    const address1 = parts[0];
    const city     = parts[1];
    const stateZip = parts[2].trim().split(/\s+/);
    const state    = stateZip[0] ?? 'TX';
    const zip      = stateZip[1] ?? '';
    return { address1, city, state, zip };
  }
  if (parts.length === 2) {
    return { address1: parts[0], city: parts[1], state: 'TX' };
  }
  // Single-part: treat the whole thing as address1
  return { address1: trimmed, state: 'TX' };
}

// ── normalizeTexasAddress ─────────────────────────────────────────────────────

/**
 * Zero-dependency Texas address normalizer.
 * Handles FM roads, county roads, rural routes, and highway addresses.
 * Falls back gracefully when USPS is not configured.
 */
export function normalizeTexasAddress(raw: string): TexasNormalizedAddress {
  let normalized = raw.trim();

  // Detect patterns before normalizing
  const isRuralRoute =
    /\bRR\s+\d+\b/i.test(normalized) ||
    /\bRURAL\s+ROUTE\b/i.test(normalized) ||
    /\bROUTE\s+\d+\s+BOX\b/i.test(normalized);

  const isHighwayAddress =
    /\bHWY\b/i.test(normalized) ||
    /\bHIGHWAY\b/i.test(normalized) ||
    /\bSH\s+\d+\b/i.test(normalized) ||
    /\bUS\s+\d+\b/i.test(normalized) ||
    /\bIH\s*-?\d+\b/i.test(normalized) ||
    /\bI-\d+\b/i.test(normalized);

  // FM roads: "FM 123 RD", "FM 123 ROAD", "FM123" → "FM 123 Rd"
  normalized = normalized.replace(/\bFM\s*(\d+)\s*(?:RD\.?|ROAD\.?)?/gi, (_, num) => `FM ${num} Rd`);

  // County roads: "CR 456" → "County Road 456", "CR456" → "County Road 456"
  normalized = normalized.replace(/\bCR\s*(\d+)\b/gi, 'County Road $1');

  // Rural routes: "RR 1 Box 123" stays, but normalize spacing
  normalized = normalized.replace(/\bRR\s+(\d+)\s+(?:BOX|BX)\s*(\d+)\b/gi, 'RR $1 Box $2');
  normalized = normalized.replace(/\bRURAL\s+ROUTE\s+(\d+)\s+(?:BOX|BX)\s*(\d+)\b/gi, 'RR $1 Box $2');

  // Highway: "HWY 190" → "Highway 190", "HWY190" → "Highway 190"
  normalized = normalized.replace(/\bHWY\s*(\d+)\b/gi, 'Highway $1');

  // State highway: "SH 21" → "SH 21" (keep as-is but normalize spacing)
  normalized = normalized.replace(/\bSH\s*(\d+)\b/gi, 'SH $1');

  // US highway: "US 190" stays, normalize spacing
  normalized = normalized.replace(/\bUS\s*-?\s*(\d+)\b/gi, 'US $1');

  // Interstate: "IH-35" → "IH-35", "IH 35" → "IH-35"
  normalized = normalized.replace(/\bIH\s*-?\s*(\d+)\b/gi, 'IH-$1');

  // Normalize common suffix abbreviations to title case
  normalized = normalized.replace(/\bST\b(?!\s*\d)/gi, 'St');
  normalized = normalized.replace(/\bAVE\b/gi, 'Ave');
  normalized = normalized.replace(/\bBLVD\b/gi, 'Blvd');
  normalized = normalized.replace(/\bDR\b(?!\s*\d)/gi, 'Dr');
  normalized = normalized.replace(/\bLN\b/gi, 'Ln');
  normalized = normalized.replace(/\bCT\b/gi, 'Ct');
  normalized = normalized.replace(/\bCIR\b/gi, 'Cir');
  normalized = normalized.replace(/\bPKWY\b/gi, 'Pkwy');
  normalized = normalized.replace(/\bTRL\b/gi, 'Trl');

  // Extract city from trailing comma-separated segment
  const parts = normalized.split(',').map(p => p.trim());
  const address1 = parts[0];
  const city     = parts[1] ?? '';

  // Extract county if present (e.g. "Bell County" suffix)
  let county: string | undefined;
  const countyMatch = normalized.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+County\b/);
  if (countyMatch) county = countyMatch[1];

  return {
    address1,
    city,
    state: 'TX',
    ...(county ? { county } : {}),
    isRuralRoute,
    isHighwayAddress,
  };
}
