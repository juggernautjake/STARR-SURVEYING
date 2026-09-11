// lib/receptionist/quote.ts — a phone estimate from the website's own calculator.
//
// Owner, 2026-09-11: "I don't have an issue with the AI attempting to give quotes after having
// taken down all of the necessary info, but it should use the formula from the website … and it
// should firmly tell the customer and reiterate that any quote that it gives is subject to change
// once a live representative has reviewed the query information."
//
// So this does not invent a formula. It maps what a caller can answer on the phone onto the same
// `SURVEY_TYPES[...].calculatePrice` the /pricing calculator runs, fills every field the caller
// could not answer with the calculator's own "unknown" option (or its middle option where there is
// no unknown), applies the same rush and low/high multipliers, and returns a range. The range is
// wider than the website's because more is unknown; the disclaimer is not optional.
import { SURVEY_TYPES } from '@/app/components/surveyConfigs';
import { ESTIMATE_LOW_MULTIPLIER, ESTIMATE_HIGH_MULTIPLIER, type FormField } from '@/app/components/surveyCalculatorTypes';

export interface QuoteRequest {
  /** One of the calculator's survey ids: boundary, alta, topographic, elevation, construction, subdivision, asbuilt, mortgage, easement, legal_description. */
  service: string;
  /** Acres, as the caller said it. Mapped onto the calculator's size buckets. */
  acres?: number;
  /** residential_urban | residential_rural | commercial_subdivision | commercial_rural | agricultural | vacant */
  propertyType?: string;
  corners?: number;
  hasResidence?: boolean;
  /** open | scattered | moderate | dense | thick_brush */
  vegetation?: string;
  /** flat | gentle | moderate | steep | very_steep */
  terrain?: string;
  waterway?: boolean;
  /** fence | sale | dispute | personal | city_subdivision */
  purpose?: string;
  /** One-way miles from Belton. Defaults to 20 when unknown. */
  milesFromBelton?: number;
  rush?: boolean;
}

export interface QuoteResult {
  service: string;
  serviceName: string;
  low: number;
  high: number;
  assumed: string[];
  spoken: string;
}

const SIZE_BUCKETS: Array<[number, string]> = [[0.25, '0.1'], [0.5, '0.375'], [1, '0.75'], [2, '1.5'], [5, '3.5'], [10, '7.5'], [20, '15'], [40, '30'], [80, '60'], [160, '120'], [Infinity, '200']];
export function sizeBucket(acres: number): string {
  for (const [max, v] of SIZE_BUCKETS) if (acres < max) return v;
  return '200';
}

export function cornersBucket(n: number): string {
  if (n <= 4) return '4';
  if (n === 5) return '5';
  if (n === 6) return '6';
  if (n <= 8) return '7';
  if (n <= 12) return '10';
  return '15';
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** Fill a field the caller could not answer: the calculator's own "unknown" if it has one, else the middle option. */
function defaultFor(field: FormField): string {
  if (field.type === 'number') return field.id === 'travelDistance' ? '20' : '0';
  const opts = field.options ?? [];
  const unknown = opts.find((o) => o.value === 'unknown');
  if (unknown) return unknown.value;
  const none = opts.find((o) => o.value === 'none' || o.value === 'no' || o.value === '0');
  if (none) return none.value;
  const mid = opts[Math.floor(opts.length / 2)];
  return mid?.value ?? '';
}

export function quoteFor(req: QuoteRequest): QuoteResult | null {
  const cfg = SURVEY_TYPES.find((t) => t.id === req.service);
  if (!cfg) return null;
  const v: Record<string, string> = {};
  const assumed: string[] = [];
  const given: Record<string, string | undefined> = {
    acreage: req.acres != null ? sizeBucket(req.acres) : undefined,
    propertySize: req.acres != null ? sizeBucket(req.acres) : undefined,
    corners: req.corners != null ? cornersBucket(req.corners) : undefined,
    propertyCorners: req.corners != null ? cornersBucket(req.corners) : undefined,
    propertyType: req.propertyType,
    hasResidence: req.hasResidence == null ? undefined : req.hasResidence ? 'yes' : 'no',
    vegetation: req.vegetation,
    terrain: req.terrain,
    waterwayBoundary: req.waterway == null ? undefined : req.waterway ? 'yes' : 'no',
    purpose: req.purpose,
    travelDistance: req.milesFromBelton != null ? String(Math.max(0, Math.round(req.milesFromBelton))) : undefined,
  };
  for (const f of cfg.fields) {
    const g = given[f.id];
    const valid = g != null && (f.type === 'number' || (f.options ?? []).some((o) => o.value === g));
    if (valid) v[f.id] = g as string;
    else {
      v[f.id] = defaultFor(f);
      if (f.required) assumed.push(f.label.toLowerCase());
    }
  }
  let price = cfg.calculatePrice(v);
  if (req.rush) price *= 1.25;
  price = Math.max(price, cfg.minPrice);
  // A phone estimate carries more unknowns than the web form, so widen the band the site uses.
  const low = roundTo(price * ESTIMATE_LOW_MULTIPLIER * 0.95, 50);
  const high = roundTo(price * ESTIMATE_HIGH_MULTIPLIER * 1.1, 50);
  const spoken = `Based on what you've told me, a ${cfg.name.toLowerCase()} like that usually runs somewhere between ${dollars(low)} and ${dollars(high)}. That's a rough estimate from our online calculator, not a quote. Hank will review everything and send a written proposal, and the final price can change from that.`;
  return { service: cfg.id, serviceName: cfg.name, low, high, assumed, spoken };
}

export function dollars(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** The disclaimer, verbatim, for the prompt and for tests. */
export const QUOTE_DISCLAIMER = 'rough estimate from our online calculator, not a quote';
