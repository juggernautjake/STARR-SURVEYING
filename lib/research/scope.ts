// lib/research/scope.ts — can this platform research this property, and how well?
//
// ── THE RUN THIS EXISTS FOR ─────────────────────────────────────────────────────────────────────
//
// Owner, 2026-08-31: *"if we are researching a property in a state we have not built the system for
// yet, then it should realize that and tell the user and not actually run the research."*
//
// Today it does not realise anything. Measured before this file was written:
//
//   · `getClerkByFIPS()` does `fips.replace(/^48/, '')` — 48 is the Texas state FIPS. The registry
//     is Texas-only by construction.
//   · An unrecognised county does not fail. Both registry lookups fall through to a TexasFile entry
//     with `fallback: true`, and the caller carries on.
//   · `state` is stored on every project (`'TX'` on the one live row) and is read by NOTHING that
//     gates a run.
//
// So a New Mexico address geocodes, routes to a Texas aggregator, and spends money finding nothing.
// The failure is not an error message anybody sees — it is a run that completes and reports on no
// property at all.
//
// ── WHY FOUR VERDICTS AND NOT TWO ───────────────────────────────────────────────────────────────
//
// "In scope / out of scope" cannot express the case that actually costs money. Of the 25 counties
// in `CLERK_REGISTRY`, **2 are implemented, 18 are stubs and 3 are unavailable**. A stub county is
// genuinely researchable — through the TexasFile aggregator, at roughly $1–3 a document. That is a
// different answer from "yes" and a different answer from "no", and collapsing it into either one
// is how an operator gets surprised by a bill or refused a run that would have worked.
//
// ── DERIVED, NEVER TYPED ────────────────────────────────────────────────────────────────────────
//
// Every verdict comes out of `CLERK_REGISTRY` and `TEXAS_COUNTIES`. There is deliberately no list
// of "supported counties" in this file: a second list beside the registry is G12 in the previous
// plan doc — four hand-written copies of one list — and it would go stale the first time somebody
// built an adapter and forgot this file. Adding a county to the registry moves it into scope, and
// that is the only edit.

import { getClerkByCountyName, type ClerkAdapterStatus, type ClerkSystem } from
  '@/worker/src/adapters/clerk-registry';
import { TEXAS_COUNTIES } from '@/worker/src/lib/county-fips';
import { normalizeCounty } from './county-input';

/**
 * The states this platform can research.
 *
 * One entry, and that is the honest state of the system rather than a placeholder. It is a list
 * rather than a constant because the shape of "add a state" should be visible: a state goes here
 * when it has a county registry and an adapter, and not before.
 */
export const SUPPORTED_STATES = [
  { code: 'TX', name: 'Texas' },
] as const;

export type ScopeVerdict =
  /** A county with an adapter we have built and tested. Run it. */
  | 'supported'
  /** A Texas county with no adapter of its own — the aggregator will be used, and it charges. */
  | 'degraded'
  /** A Texas county with no online records system at all. Nothing to run against. */
  | 'unavailable'
  /** Not one of `SUPPORTED_STATES`. The case the owner asked for. */
  | 'out-of-scope'
  /** Not enough information to decide yet — an empty form, not a refusal. */
  | 'unknown';

export interface ScopeResult {
  verdict: ScopeVerdict;
  /** Whether a run may start. `degraded` is true — it is a price, not a prohibition. */
  canRun: boolean;
  /** Whether the operator must confirm a cost first. */
  needsConfirmation: boolean;
  /** One sentence, written to be shown to a person, not logged. */
  message: string;
  /** What the operator can do about it. Empty when there is nothing to do. */
  nextStep: string;
  /** The county as the registry spells it, when it resolved to one. */
  county: string | null;
  state: string | null;
  adapter: { system: ClerkSystem; status: ClerkAdapterStatus } | null;
}

/** `TX`, `Texas`, `texas ` — all the same state. Anything else is not one of ours. */
export function normalizeState(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!s) return null;
  for (const st of SUPPORTED_STATES) {
    if (s === st.code.toLowerCase() || s === st.name.toLowerCase()) return st.code;
  }
  return s.toUpperCase();
}

const COUNTY_KEYS = new Set(TEXAS_COUNTIES.map((c) => normalizeCounty(c.name)));

const SUPPORTED_NAMES = SUPPORTED_STATES.map((s) => s.name).join(', ');

/**
 * The scope decision.
 *
 * ── ORDER MATTERS, AND THE STATE COMES FIRST ──────────────────────────────────────────────────
 *
 * Checking the county first would report "Sandoval is not a Texas county" for a New Mexico
 * property, which is true, useless, and points the operator at the wrong field. The state is the
 * coarser and more actionable fact, so it is answered first.
 */
export function checkScope(
  state: string | null | undefined,
  county: string | null | undefined,
): ScopeResult {
  const st = normalizeState(state);
  const countyTyped = (county ?? '').trim();

  const base = { county: null, state: st, adapter: null } as const;

  if (!st && !countyTyped) {
    return {
      ...base,
      verdict: 'unknown',
      canRun: false,
      needsConfirmation: false,
      message: 'Enter a state and county so the property can be checked against our coverage.',
      nextStep: '',
    };
  }

  if (!st) {
    return {
      ...base,
      verdict: 'unknown',
      canRun: false,
      needsConfirmation: false,
      message: 'No state on this project, so its coverage cannot be checked.',
      nextStep: `We currently research properties in ${SUPPORTED_NAMES}.`,
    };
  }

  if (!SUPPORTED_STATES.some((s) => s.code === st)) {
    return {
      ...base,
      verdict: 'out-of-scope',
      canRun: false,
      needsConfirmation: false,
      message: `We have not built research for ${st} yet, so this run will not start.`,
      nextStep: `Coverage today is ${SUPPORTED_NAMES}. This property needs to be researched by hand.`,
    };
  }

  if (!countyTyped) {
    return {
      ...base,
      verdict: 'unknown',
      canRun: false,
      needsConfirmation: false,
      message: 'No county on this project. County is what picks the clerk portal, so a run cannot be routed without it.',
      nextStep: 'Add the county the property sits in.',
    };
  }

  if (!COUNTY_KEYS.has(normalizeCounty(countyTyped))) {
    return {
      ...base,
      verdict: 'out-of-scope',
      canRun: false,
      needsConfirmation: false,
      message: `"${countyTyped}" is not one of Texas's 254 counties, so this run cannot be routed to a clerk.`,
      nextStep: 'Check the county spelling, or the state.',
    };
  }

  const entry = getClerkByCountyName(countyTyped);
  const adapter = { system: entry.system, status: entry.status };
  const named = entry.fallback ? countyTyped : entry.county;

  if (entry.status === 'unavailable') {
    return {
      verdict: 'unavailable',
      canRun: false,
      needsConfirmation: false,
      message: `${named} County has no online records system we can reach, so an automated run would return nothing.`,
      nextStep: entry.notes ?? 'Records for this county have to be pulled at the courthouse.',
      county: named,
      state: st,
      adapter,
    };
  }

  if (entry.status === 'implemented') {
    return {
      verdict: 'supported',
      canRun: true,
      needsConfirmation: false,
      message: `${named} County is fully supported — we have a tested adapter for its clerk system.`,
      nextStep: '',
      county: named,
      state: st,
      adapter,
    };
  }

  // `stub` — the aggregator route. Runnable, and it charges.
  return {
    verdict: 'degraded',
    canRun: true,
    needsConfirmation: true,
    message: `${named} County has no adapter of its own yet, so documents come from the TexasFile `
      + 'aggregator and are charged per document.',
    nextStep: 'Set a spend limit before starting, or run it as a batch job where the limit applies.',
    county: named,
    state: st,
    adapter,
  };
}

/**
 * The shape the API returns when it refuses.
 *
 * A bare `{ error: 'out of scope' }` gives the browser nothing to render and the operator nothing
 * to do. Every field here is on the screen somewhere.
 */
export interface ScopeRefusal {
  error: string;
  scope: {
    verdict: ScopeVerdict;
    message: string;
    nextStep: string;
    county: string | null;
    state: string | null;
    supportedStates: string[];
  };
}

export function scopeRefusal(result: ScopeResult): ScopeRefusal {
  return {
    error: result.message,
    scope: {
      verdict: result.verdict,
      message: result.message,
      nextStep: result.nextStep,
      county: result.county,
      state: result.state,
      supportedStates: SUPPORTED_STATES.map((s) => s.name),
    },
  };
}
