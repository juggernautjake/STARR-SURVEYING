// lib/payments/sales-tax.ts — Texas sales tax on surveying work, computed and recorded.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────────────────────
//
// **Surveying is an enumerated taxable real property service in Texas.** Comptroller Publication 96-259
// (*Taxable Services*): "Pest control and extermination, garbage and other waste collection or removal,
// janitorial and custodial services…, landscaping and lawn maintenance… and **surveying** are taxable real
// property services." Rule 34 TAC §3.276 is the rule that covers surveying specifically.
//
// Before this module, `computeInvoiceTotals` took `tax_cents` as a number the office typed by hand, with
// the note *"we don't compute sales tax — the office knows the customer's jurisdiction better than the app
// does."* The jurisdiction half of that is true and is preserved below — the app does NOT own a rate table.
// The rest was the problem: no invoice recorded **which line items were taxable, at what rate, or why**. So
// a mistyped rate was silent, and an audit could not be answered from the invoices themselves.
//
// This module computes the tax from stated inputs and returns the reasoning alongside the number.
//
// ── THE THREE RULES THAT SHAPE EVERYTHING HERE ───────────────────────────────────────────────────────
//
// **1. Presume taxable.** An uncategorised line is taxed. Getting this backwards means under-collecting on
//    work the state considers taxable, which the business eats later with penalties; the opposite error is
//    visible to the customer immediately and refundable. So the default fails toward compliance, and every
//    presumption is REPORTED (`basis: 'presumed'`) rather than quietly applied.
//
// **2. An exemption without a certificate is not an exemption.** A homebuilder buying survey work for new
//    residential construction owes no tax — but only against written certification. So a claimed exemption
//    with `certificateOnFile: false` still gets taxed, and says why. This is the single most valuable rule
//    in the file: "the customer said they were exempt" is not a defence, a certificate is.
//
// **3. No invented rates.** Texas is 6.25% state plus local options up to 2%, and for a real property
//    service the rate follows the **jobsite**, not the office. There is no rate table here and no ZIP
//    lookup: the rate is an input, validated against the statutory floor and cap. An app that guessed
//    "probably 8.25%" would be wrong quietly and often, on the one number a customer checks.
//
// Pure: no DB, no network, no clock. The route computes with it and stores what it returns.

/** Texas state rate, in basis points. 6.25%. */
export const TX_STATE_RATE_BPS = 625;
/** The most local jurisdictions may add, in basis points. 2% — a statutory cap. */
export const TX_MAX_LOCAL_RATE_BPS = 200;
/** Therefore the highest legal combined rate: 8.25%. */
export const TX_MAX_COMBINED_RATE_BPS = TX_STATE_RATE_BPS + TX_MAX_LOCAL_RATE_BPS;

// ── What kind of work a line item is ────────────────────────────────────────────────────────────────

/**
 * Service categories, each carrying the Comptroller's own taxability.
 *
 * ONLY the categories §3.276 itself names carry a settled `taxable` value, and they are taken from the
 * rule's own two lists rather than paraphrased. §3.276 superseded the surveying portions of the older Rule
 * 3.356 in April 2022, so it — not the general "real property services" guidance — is the authority here.
 *
 * Everything else is `other` — presumed taxable and flagged `reviewed: false`. That is deliberate: real
 * invoices carry lines the rule does not settle (ALTA variants, expert testimony, research time,
 * reimbursable expenses, mobilisation), and inventing a taxability for them would be exactly the
 * confident-and-wrong behaviour this module exists to prevent. `other` means "a human still has to decide
 * this one", and the composer says so rather than hiding it in a total.
 */
export const SERVICE_CATEGORIES = [
  // ── Taxable, per §3.276's own list ────────────────────────────────────────────────────────────────
  { id: 'boundary', label: 'Boundary survey', taxable: true, reviewed: true },
  { id: 'easement', label: 'Easement survey', taxable: true, reviewed: true },
  { id: 'land_title', label: 'Land title survey', taxable: true, reviewed: true },
  { id: 'title', label: 'Title survey', taxable: true, reviewed: true },
  { id: 'right_of_way', label: 'Right-of-way survey', taxable: true, reviewed: true },
  { id: 'subdivision_plat', label: 'Subdivision plat', taxable: true, reviewed: true },
  // THE SUBTLE ONE, AND THE EASIEST TO GET WRONG. Staking is taxable when it establishes where a
  // structure sits RELATIVE TO THE PROPERTY BOUNDARIES — that is a boundary determination wearing a
  // construction hat. A `construction` survey that does not do that is not taxable, and the two live one
  // row apart in this list on purpose: they are the same crew, the same day, and different tax answers.
  {
    id: 'structure_staking',
    label: 'Staking / placement locating a structure relative to boundaries',
    taxable: true,
    reviewed: true,
  },

  // ── Not taxable when performed independently, per §3.276 ──────────────────────────────────────────
  { id: 'construction', label: 'Construction survey', taxable: false, reviewed: true },
  { id: 'design', label: 'Design survey', taxable: false, reviewed: true },
  { id: 'geodetic', label: 'Geodetic survey', taxable: false, reviewed: true },
  { id: 'hydrographic', label: 'Hydrographic survey', taxable: false, reviewed: true },
  { id: 'topographic', label: 'Topographic survey', taxable: false, reviewed: true },
  { id: 'seismic', label: 'Seismic survey', taxable: false, reviewed: true },
  { id: 'tree', label: 'Tree survey', taxable: false, reviewed: true },
  { id: 'engineering', label: 'Engineering services', taxable: false, reviewed: true },

  // ── Everything else ──────────────────────────────────────────────────────────────────────────────
  { id: 'other', label: 'Other — not yet categorised', taxable: true, reviewed: false },
] as const;

export type ServiceCategoryId = (typeof SERVICE_CATEGORIES)[number]['id'];

const CATEGORY_BY_ID = new Map<string, (typeof SERVICE_CATEGORIES)[number]>(
  SERVICE_CATEGORIES.map((c) => [c.id, c]),
);

export function isServiceCategory(v: unknown): v is ServiceCategoryId {
  return typeof v === 'string' && CATEGORY_BY_ID.has(v);
}

export function serviceCategory(id: string | null | undefined) {
  return CATEGORY_BY_ID.get(String(id ?? '')) ?? CATEGORY_BY_ID.get('other')!;
}

export function serviceCategoryLabel(id: string | null | undefined): string {
  return serviceCategory(id).label;
}

// ── Exemptions ──────────────────────────────────────────────────────────────────────────────────────

/**
 * The exemption claims this business actually encounters. Each requires DOCUMENTATION to be honoured —
 * see rule 2 at the top of the file, and `certificateOnFile`.
 *
 * `new_residential_construction` is the one specific to surveying: a homebuilder purchasing survey work in
 * connection with building a new residential structure owes no tax on it, but must certify that in writing
 * to the service provider. `resale` and `exempt_organization` are the standard certificate-backed claims
 * §3.276 addresses.
 */
export const EXEMPTION_KINDS = [
  { id: 'none', label: 'None — taxable sale', needsCertificate: false, documentName: '' },
  // §3.276's first statutory exclusion: a CONTRACTOR buying the survey as part of constructing a new
  // improvement to RESIDENTIAL real property. All three qualifiers matter — a contractor (not the
  // homeowner), new construction (not a remodel), residential (not commercial).
  {
    id: 'new_residential_construction',
    label: 'New residential construction (contractor purchase)',
    needsCertificate: true,
    documentName: 'written certification from the contractor',
  },
  // §3.276's second: a LANDMAN performing the survey as necessary to negotiate or secure land or mineral
  // rights for acquisition or trade.
  {
    id: 'landman',
    label: 'Landman securing land or mineral rights',
    needsCertificate: true,
    documentName: 'documentation of the landman purpose',
  },
  // §3.276 also governs resale and exemption certificates. NOTE the rule's specific trap, worth knowing
  // before anyone accepts one: a surveyor may NOT accept a resale certificate from an engineering firm
  // for taxable surveying acquired in order to provide NONTAXABLE engineering services.
  { id: 'resale', label: 'Resale', needsCertificate: true, documentName: 'resale certificate' },
  {
    id: 'exempt_organization',
    label: 'Exempt organisation',
    needsCertificate: true,
    documentName: 'exemption certificate',
  },
] as const;

export type ExemptionKind = (typeof EXEMPTION_KINDS)[number]['id'];

const EXEMPTION_BY_ID = new Map<string, (typeof EXEMPTION_KINDS)[number]>(
  EXEMPTION_KINDS.map((e) => [e.id, e]),
);

export function isExemptionKind(v: unknown): v is ExemptionKind {
  return typeof v === 'string' && EXEMPTION_BY_ID.has(v);
}

export function exemptionKind(id: string | null | undefined) {
  return EXEMPTION_BY_ID.get(String(id ?? '')) ?? EXEMPTION_BY_ID.get('none')!;
}

export interface ExemptionClaim {
  kind: ExemptionKind;
  /** Is the backing document actually in hand? Rule 2: without it, the sale is taxed. */
  certificateOnFile: boolean;
}

// ── Rate validation ─────────────────────────────────────────────────────────────────────────────────

export type RateProblem = 'not-an-integer' | 'below-state-rate' | 'above-legal-cap';

export interface RateRejected {
  ok: false;
  problem: RateProblem;
  message: string;
}

export interface RateAccepted {
  ok: true;
  bps: number;
}

/**
 * Validate a jobsite rate.
 *
 * Rejects rather than clamps. A rate above 8.25% is not legal in Texas and a rate below 6.25% cannot be
 * right either — both mean someone mistyped, and silently clamping to a legal-looking value would put a
 * plausible wrong number on a customer's invoice, which is the failure mode this whole module is against.
 * A rate of exactly 625 is valid: some jobsites carry no local tax at all.
 */
export function validateRateBps(raw: unknown): RateAccepted | RateRejected {
  // STRICT — no coercion. `Number(null)` is 0, which is an integer, so a coercing version reported a null
  // rate as "below the state rate": a confusing message for a missing value, and one that invites the
  // caller to think it sent something. Parsing a form field is the caller's job; deciding whether a rate is
  // legal is this function's.
  const n = typeof raw === 'number' ? raw : NaN;
  if (!Number.isInteger(n)) {
    return {
      ok: false,
      problem: 'not-an-integer',
      message: 'Tax rate must be a whole number of basis points (825 = 8.25%).',
    };
  }
  if (n < TX_STATE_RATE_BPS) {
    return {
      ok: false,
      problem: 'below-state-rate',
      message: `A Texas jobsite cannot be below the ${formatRate(TX_STATE_RATE_BPS)} state rate.`,
    };
  }
  if (n > TX_MAX_COMBINED_RATE_BPS) {
    return {
      ok: false,
      problem: 'above-legal-cap',
      message: `Texas caps local tax at ${formatRate(TX_MAX_LOCAL_RATE_BPS)}, so the combined rate cannot exceed ${formatRate(TX_MAX_COMBINED_RATE_BPS)}.`,
    };
  }
  return { ok: true, bps: n };
}

/** `825` → `"8.25%"`. Trailing zeros trimmed, so 625 reads "6.25%" and 700 reads "7%". */
export function formatRate(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/0+$/, '')}%`;
}

// ── Per-line taxability ─────────────────────────────────────────────────────────────────────────────

export interface TaxableLineInput {
  description?: string;
  total_cents?: number;
  /** Which kind of work this line is. */
  category?: string | null;
  /** Explicit override, when the office knows better than the category. Wins over the category. */
  taxable?: boolean | null;
}

/** How a line's taxability was decided — recorded on the invoice so the answer is traceable. */
export type TaxBasis = 'override' | 'category' | 'presumed';

export interface LineTaxability {
  taxable: boolean;
  basis: TaxBasis;
  category: ServiceCategoryId;
}

/**
 * Decide one line's taxability, and say how.
 *
 * Precedence: an explicit `taxable` override, then the category's settled answer, then presume taxable.
 * The override comes first because the categories cannot cover every real invoice line, and the office
 * needs a way to be right without waiting for this list to grow — but an override is recorded AS an
 * override, so a reviewer can find every line where a human overruled the category.
 */
export function lineTaxability(line: TaxableLineInput): LineTaxability {
  const cat = serviceCategory(line.category);
  if (typeof line.taxable === 'boolean') {
    return { taxable: line.taxable, basis: 'override', category: cat.id };
  }
  if (isServiceCategory(line.category) && cat.reviewed) {
    return { taxable: cat.taxable, basis: 'category', category: cat.id };
  }
  return { taxable: true, basis: 'presumed', category: cat.id };
}

// ── The computation ─────────────────────────────────────────────────────────────────────────────────

export interface SalesTaxLine extends LineTaxability {
  index: number;
  description: string;
  total_cents: number;
}

export interface SalesTaxResult {
  rate_bps: number;
  taxable_subtotal_cents: number;
  exempt_subtotal_cents: number;
  tax_cents: number;
  exemption: ExemptionClaim & {
    /** Did the claim actually reduce the tax? False when the certificate is missing. */
    honoured: boolean;
  };
  /** Every line, with the taxability decision that was made about it. */
  lines: SalesTaxLine[];
  /** Things a human should look at before this invoice goes out. Never fatal — the number is still right
   *  under the stated inputs; these are the places those inputs are shaky. */
  warnings: string[];
}

export interface SalesTaxInput {
  lines: ReadonlyArray<TaxableLineInput>;
  /** The jobsite's combined rate in basis points. Validate with `validateRateBps` first. */
  rateBps: number;
  exemption?: ExemptionClaim;
}

/**
 * Compute the tax, and return the reasoning with it.
 *
 * ROUNDING IS ON THE AGGREGATE, NOT PER LINE. The taxable lines are summed and the rate applied once.
 * Rounding each line separately and adding them drifts by a cent or two against the same invoice computed
 * as a whole — and the customer, their bookkeeper and the state all recompute it as a whole. One rounding
 * step means the invoice agrees with every recomputation of it.
 */
export function computeSalesTax(input: SalesTaxInput): SalesTaxResult {
  const claim: ExemptionClaim = input.exemption ?? { kind: 'none', certificateOnFile: false };
  const spec = exemptionKind(claim.kind);
  const warnings: string[] = [];

  // Rule 2 — a claim without its document does not exempt the sale.
  const honoured = claim.kind !== 'none' && (!spec.needsCertificate || claim.certificateOnFile);
  if (claim.kind !== 'none' && !honoured) {
    warnings.push(
      `${spec.label} was claimed but no ${spec.documentName || 'certificate'} is on file, so the sale is taxed. Collect the document or remove the claim.`,
    );
  }

  const lines: SalesTaxLine[] = input.lines.map((l, index) => {
    const cents = typeof l.total_cents === 'number' && Number.isFinite(l.total_cents)
      ? Math.max(0, Math.round(l.total_cents))
      : 0;
    const decision = lineTaxability(l);
    return {
      index,
      description: typeof l.description === 'string' ? l.description : '',
      total_cents: cents,
      // An honoured exemption zeroes the tax on the whole invoice; the per-line decision is still recorded
      // as it was, so removing the exemption later does not lose which lines were taxable.
      taxable: decision.taxable,
      basis: decision.basis,
      category: decision.category,
    };
  });

  const presumed = lines.filter((l) => l.basis === 'presumed' && l.total_cents > 0);
  if (presumed.length > 0) {
    warnings.push(
      `${presumed.length} line${presumed.length === 1 ? '' : 's'} ${presumed.length === 1 ? 'has' : 'have'} no service category, so ${presumed.length === 1 ? 'it is' : 'they are'} presumed taxable. Categorise ${presumed.length === 1 ? 'it' : 'them'} to be sure.`,
    );
  }

  const taxableSubtotal = honoured
    ? 0
    : lines.reduce((acc, l) => acc + (l.taxable ? l.total_cents : 0), 0);
  const exemptSubtotal = lines.reduce((acc, l) => acc + l.total_cents, 0) - taxableSubtotal;

  // One rounding step, on the aggregate. `Math.round` is half-up for positive values, which is how a
  // paper invoice is footed.
  const tax = Math.round((taxableSubtotal * input.rateBps) / 10000);

  return {
    rate_bps: input.rateBps,
    taxable_subtotal_cents: taxableSubtotal,
    exempt_subtotal_cents: exemptSubtotal,
    tax_cents: tax,
    exemption: { ...claim, honoured },
    lines,
    warnings,
  };
}

/**
 * One sentence a human can check the tax against, for the invoice and the audit trail.
 *
 * The point is that the arithmetic is legible: someone holding the invoice can verify the tax without
 * knowing anything about this codebase.
 */
export function describeSalesTax(result: SalesTaxResult, formatMoney: (cents: number) => string): string {
  if (result.exemption.honoured) {
    const spec = exemptionKind(result.exemption.kind);
    return `No tax — ${spec.label.toLowerCase()}, certificate on file.`;
  }
  if (result.taxable_subtotal_cents === 0) {
    return 'No tax — no taxable services on this invoice.';
  }
  const parts = [
    `${formatMoney(result.taxable_subtotal_cents)} taxable at ${formatRate(result.rate_bps)} = ${formatMoney(result.tax_cents)}`,
  ];
  if (result.exempt_subtotal_cents > 0) {
    parts.push(`${formatMoney(result.exempt_subtotal_cents)} not taxable`);
  }
  return `${parts.join('; ')}.`;
}
