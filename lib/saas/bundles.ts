// lib/saas/bundles.ts
//
// SaaS product bundles — the catalog the subscription system gates
// against (per docs/planning/in-progress/SUBSCRIPTION_BILLING_SYSTEM.md §3.1)
// and the route registry consumes (per docs/planning/in-progress/CUSTOMER_PORTAL.md §3.6).
//
// Pure data. No React imports. Consumed by:
//   - lib/admin/route-registry.ts (AdminRoute.requiredBundle)
//   - app/admin/components/nav/* (bundle-gated UI)
//   - app/api/* (server-side bundle checks)
//   - mobile app (gates tab visibility)

export type BundleId =
  | 'recon'
  | 'draft'
  | 'office'
  | 'field'
  | 'academy'
  | 'firm_suite';

export interface BundleMeta {
  id: BundleId;
  label: string;
  /** Short marketing tagline used in /admin/billing/upgrade prompts
   *  and in the pricing-page card. */
  tagline: string;
  /** Lucide icon name for surfaces that show a bundle badge. */
  iconName: string;
  /** Monthly price in USD cents for a single seat (or flat plans).
   *  Annual cycle = 20% off, computed at display time. */
  monthlyBaseCents: number;
  /** Per-seat overage price in cents (null = per-seat-only plan;
   *  for flat plans like Office, this is the overage price beyond
   *  the included seat count). */
  perSeatOverageCents: number | null;
  /** Seats included in the base price for flat plans; null for
   *  per-seat plans where every seat costs monthlyBaseCents. */
  includedSeats: number | null;
  /** Bundles that this bundle implicitly includes. Firm Suite
   *  unlocks every other bundle. */
  implies: BundleId[];
  /** Stripe price id for monthly billing. Hard-coded once the
   *  product is created in the Stripe dashboard; null until then. */
  stripePriceMonthly: string | null;
  /** Stripe price id for annual billing. */
  stripePriceAnnual: string | null;
  /** Stripe price id for seat overage (where applicable). */
  stripePriceSeatOverage: string | null;
}

/** §3.1 of SUBSCRIPTION_BILLING_SYSTEM.md — the catalog. Update
 *  Stripe price IDs after the operator creates the products in the
 *  Stripe dashboard. */
export const BUNDLES: Record<BundleId, BundleMeta> = {
  recon: {
    id: 'recon',
    label: 'Recon',
    tagline: 'Property research, document library, county-clerk adapters, AI research engine.',
    iconName: 'Microscope',
    monthlyBaseCents: 9900,
    perSeatOverageCents: null,        // per-seat plan
    includedSeats: null,
    implies: [],
    stripePriceMonthly: null,
    stripePriceAnnual: null,
    stripePriceSeatOverage: null,
  },
  draft: {
    id: 'draft',
    label: 'Draft',
    tagline: 'CAD editor, AI drawing engine, plot styles, version snapshots.',
    iconName: 'PenTool',
    monthlyBaseCents: 9900,
    perSeatOverageCents: null,
    includedSeats: null,
    implies: [],
    stripePriceMonthly: null,
    stripePriceAnnual: null,
    stripePriceSeatOverage: null,
  },
  field: {
    id: 'field',
    label: 'Field',
    tagline: 'Mobile data capture, receipts, mileage, clock-in/out.',
    iconName: 'MapPin',
    monthlyBaseCents: 4900,
    perSeatOverageCents: null,
    includedSeats: null,
    implies: [],
    stripePriceMonthly: null,
    stripePriceAnnual: null,
    stripePriceSeatOverage: null,
  },
  office: {
    id: 'office',
    label: 'Office',
    tagline: 'Jobs, employees, payroll, receipts, scheduling, internal messaging.',
    iconName: 'Building',
    monthlyBaseCents: 19900,
    perSeatOverageCents: 3900,        // $39/extra seat beyond 5
    includedSeats: 5,
    implies: ['field'],
    stripePriceMonthly: null,
    stripePriceAnnual: null,
    stripePriceSeatOverage: null,
  },
  academy: {
    id: 'academy',
    label: 'Academy',
    tagline: 'Learning hub, modules, exam prep, flashcards, fieldbook.',
    iconName: 'GraduationCap',
    monthlyBaseCents: 7900,
    perSeatOverageCents: null,
    includedSeats: null,
    implies: [],
    stripePriceMonthly: null,
    stripePriceAnnual: null,
    stripePriceSeatOverage: null,
  },
  firm_suite: {
    id: 'firm_suite',
    label: 'Firm Suite',
    tagline: 'Everything in Recon + Draft + Office + Field + Academy. Priority support.',
    iconName: 'Crown',
    monthlyBaseCents: 49900,
    perSeatOverageCents: 4900,        // $49/extra seat beyond 5
    includedSeats: 5,
    implies: ['recon', 'draft', 'office', 'field', 'academy'],
    stripePriceMonthly: null,
    stripePriceAnnual: null,
    stripePriceSeatOverage: null,
  },
};

/** Canonical order for UI display (pricing page, upgrade prompts).
 *  Firm Suite intentionally last — it's the "and one bundle to rule
 *  them all" tier. */
export const BUNDLE_ORDER: BundleId[] = [
  'recon', 'draft', 'field', 'office', 'academy', 'firm_suite',
];

/** Returns the effective set of bundle access for a subscription's
 *  `bundles` array, expanding any `implies` relations. Used as the
 *  source of truth for route gating + tab visibility.
 *
 *  Example: `expandBundles(['firm_suite'])` returns every bundle
 *  because Firm Suite implies them all. */
export function expandBundles(active: BundleId[]): BundleId[] {
  const seen = new Set<BundleId>();
  const stack = [...active];
  while (stack.length > 0) {
    const b = stack.pop()!;
    if (seen.has(b)) continue;
    seen.add(b);
    for (const implied of BUNDLES[b].implies) {
      if (!seen.has(implied)) stack.push(implied);
    }
  }
  return Array.from(seen);
}

/** Checks whether the given subscription bundles grant access to
 *  `required`. Returns true if `required` is one of the active
 *  bundles (after expansion) or `required` is null/undefined
 *  (route doesn't require a bundle). */
export function hasBundle(active: BundleId[], required: BundleId | null | undefined): boolean {
  if (!required) return true;
  return expandBundles(active).includes(required);
}

/** USD-cents → display string (e.g. 9900 → "$99.00"). */
export function formatBundlePrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Annual price = 12 × monthly with 20% discount. */
export function annualPriceCents(monthly: number): number {
  return Math.round(monthly * 12 * 0.8);
}
