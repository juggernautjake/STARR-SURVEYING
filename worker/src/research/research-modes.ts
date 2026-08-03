// worker/src/research/research-modes.ts — free first, paid on demand (plan S-11).
//
// The owner's requirement: a researcher picks a mode when starting a run.
//
//   FREE  every free source and county site. 20–30 minutes. If it does not answer the question,
//         the researcher escalates.
//   PAID  the paid sources as well. Available as an escalation, OR as the starting choice when the
//         researcher wants the best result immediately.
//
// ── FREE SOURCES RUN FIRST EVEN IN PAID MODE ────────────────────────────────────────────────────
//
// This is the rule that actually prevents waste, and it is an ORDERING rule, not a filter.
//
// Paying for a document that a free source was about to return is exactly what the owner asked to
// avoid. Filtering afterwards cannot fix it, because by then the money is gone. So a paid run is a
// free run followed by a paid pass, with every free document registered in the identity index in
// between.
//
// ── THE 20–30 MINUTE EXPECTATION IS A CONSTRAINT ────────────────────────────────────────────────
//
// It means the free pass has to run sources concurrently and report progress. A researcher watching
// a silent screen for twenty minutes will assume it has hung and kill it, and a killed run looks
// exactly like a run that found nothing.

import type { SourceCost } from './document-identity.js';

export type ResearchMode = 'free' | 'paid';

/** What a source can answer. A run needs different sources for different questions. */
export type SourceCapability =
  | 'conveyances'      // deeds, liens, easements — the county clerk indexes
  | 'original_survey'  // GLO land grants: the survey a legal description is written against
  | 'appraisal'        // CAD: owner, parcel, value, legal description
  | 'plats'            // recorded subdivision plats
  | 'historic_maps';   // period maps, Sanborn, for monuments that no longer exist

export interface ResearchSource {
  id: string;
  label: string;
  cost: SourceCost;
  capabilities: SourceCapability[];
  /** Counties this source serves. `'*'` means statewide. */
  counties: string[] | '*';
  /** Rough wall-clock budget, used to warn when a free pass cannot fit its window. */
  estimatedSeconds: number;
  /** Set when the source needs credentials we may not hold. */
  requiresAccount?: boolean;
}

/** The catalogue, as of 2026-08-02. Every free entry here was driven in a browser.
 *
 *  Costs are stated from the RESEARCHER's point of view: "free" means we can read the index and,
 *  where noted, retrieve documents without paying. A source that is free to search but charges for
 *  documents is still free for the free pass — it just cannot complete a purchase. */
export const SOURCE_CATALOGUE: ResearchSource[] = [
  // ── Free ────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'glo',
    label: 'Texas GLO land grants',
    cost: 'free',
    capabilities: ['original_survey'],
    counties: '*',
    estimatedSeconds: 60,
  },
  {
    id: 'kofile',
    label: 'Kofile / GovOS PublicSearch',
    cost: 'free',
    capabilities: ['conveyances', 'plats'],
    counties: ['Bell', 'Bexar', 'Brazos', 'Coleman', 'Collin', 'Denton', 'Grimes', 'Johnson',
      'Kendall', 'Leon', 'Madison', 'Medina', 'Milam', 'Montgomery', 'Nacogdoches', 'Nueces',
      'Potter', 'Tarrant', 'Travis', 'Walker'],
    estimatedSeconds: 120,
  },
  {
    id: 'tyler_eagle',
    label: 'Tyler Eagle Self-Service',
    cost: 'free',
    capabilities: ['conveyances'],
    counties: ['McLennan', 'Burnet', 'Hamilton', 'Hill', 'Mills', 'Erath', 'Navarro', 'Somervell', 'Williamson'],
    estimatedSeconds: 150,
  },
  {
    id: 'edoctec',
    label: 'eDocTec',
    cost: 'free',
    capabilities: ['conveyances'],
    counties: ['Coryell', 'Lampasas'],
    estimatedSeconds: 90,
  },
  {
    id: 'uslandrecords',
    label: 'Avenu 20/20 Perfect Vision',
    cost: 'free',
    capabilities: ['conveyances'],
    counties: ['Falls', 'Robertson'],
    estimatedSeconds: 120,
  },
  {
    id: 'aumentum',
    label: 'Harris Recording Solutions / Aumentum',
    cost: 'free',
    capabilities: ['conveyances'],
    counties: ['Bastrop'],
    estimatedSeconds: 120,
  },
  {
    id: 'idocmarket',
    label: 'iDocMarket',
    cost: 'free',
    capabilities: ['conveyances'],
    counties: ['Bosque'],
    estimatedSeconds: 90,
  },
  {
    id: 'cad',
    label: 'County appraisal district',
    cost: 'free',
    capabilities: ['appraisal'],
    counties: '*',
    estimatedSeconds: 90,
  },

  // ── Paid ────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'texasfile',
    label: 'TexasFile',
    cost: 'paid',
    capabilities: ['conveyances', 'plats'],
    counties: '*',
    estimatedSeconds: 180,
    requiresAccount: true,
  },
  {
    id: 'countyfusion',
    label: 'CountyFusion (per-county login)',
    cost: 'paid',
    capabilities: ['conveyances'],
    counties: ['Limestone'],
    estimatedSeconds: 150,
    requiresAccount: true,
  },
];

const norm = (c: string): string => c.replace(/\s+county$/i, '').trim().toLowerCase();

export function servesCounty(source: ResearchSource, county: string): boolean {
  if (source.counties === '*') return true;
  return source.counties.some((c) => norm(c) === norm(county));
}

export interface PlanStep {
  source: ResearchSource;
  /** Order within the run. Free steps always precede paid ones. */
  order: number;
  phase: 'free' | 'paid';
}

export interface ResearchPlan {
  mode: ResearchMode;
  county: string;
  steps: PlanStep[];
  freeSteps: number;
  paidSteps: number;
  /** Sum of the free phase's estimates, in seconds. */
  estimatedFreeSeconds: number;
  estimatedTotalSeconds: number;
  /** Capabilities no source in this plan can supply. */
  missingCapabilities: SourceCapability[];
  statement: string;
}

/** Everything a full boundary answer wants. Used to report what a plan cannot reach. */
export const DESIRED_CAPABILITIES: SourceCapability[] = ['conveyances', 'original_survey', 'appraisal'];

/** Build the ordered plan for a run.
 *
 *  In BOTH modes the free sources come first. In free mode the paid ones are simply absent; in paid
 *  mode they follow. That ordering is the whole anti-waste mechanism (plan S-14). */
export function buildPlan(
  county: string,
  mode: ResearchMode,
  catalogue: ResearchSource[] = SOURCE_CATALOGUE,
): ResearchPlan {
  if (!county?.trim()) throw new Error('[research-modes] A county is required to build a plan.');

  const serving = catalogue.filter((s) => servesCounty(s, county));
  const free = serving.filter((s) => s.cost === 'free');
  const paid = mode === 'paid' ? serving.filter((s) => s.cost === 'paid') : [];

  const steps: PlanStep[] = [
    ...free.map((source, i) => ({ source, order: i, phase: 'free' as const })),
    ...paid.map((source, i) => ({ source, order: free.length + i, phase: 'paid' as const })),
  ];

  const covered = new Set(steps.flatMap((s) => s.source.capabilities));
  const missingCapabilities = DESIRED_CAPABILITIES.filter((c) => !covered.has(c));

  const estimatedFreeSeconds = free.reduce((n, s) => n + s.estimatedSeconds, 0);
  const estimatedTotalSeconds = steps.reduce((n, s) => n + s.source.estimatedSeconds, 0);

  const parts = [
    `${county}: ${mode.toUpperCase()} run — ${free.length} free source(s)` +
      (mode === 'paid' ? ` then ${paid.length} paid` : '') + '.',
  ];
  if (missingCapabilities.length > 0) {
    // Said up front, because a researcher deciding whether to escalate needs to know what escalating
    // cannot fix.
    parts.push(`No source in this plan covers: ${missingCapabilities.join(', ')}.`);
  }
  if (mode === 'free' && serving.some((s) => s.cost === 'paid')) {
    parts.push(`Paid sources exist for this county and are NOT being used — escalate to reach them.`);
  }

  return {
    mode,
    county,
    steps,
    freeSteps: free.length,
    paidSteps: paid.length,
    estimatedFreeSeconds,
    estimatedTotalSeconds,
    missingCapabilities,
    statement: parts.join(' '),
  };
}

/** How many free sources may run at once.
 *
 *  The free pass has a 20–30 minute expectation and its sources are independent, so they run
 *  concurrently. Capped because each drives a browser and county portals are slow and rate-limited —
 *  hammering them is both rude and a good way to get blocked. */
export const FREE_CONCURRENCY = 4;

/** Will the free phase plausibly fit its window? */
export function fitsFreeWindow(plan: ResearchPlan, windowMinutes = 30, concurrency = FREE_CONCURRENCY): boolean {
  const wall = plan.estimatedFreeSeconds / Math.max(1, concurrency);
  return wall <= windowMinutes * 60;
}

export interface RunProgress {
  completed: number;
  total: number;
  currentPhase: 'free' | 'paid';
  /** Sources that failed, by id. A failed source is NOT a source that found nothing. */
  failed: string[];
}

/** A progress line a researcher can read.
 *
 *  A twenty-minute silent screen gets killed, and a killed run is indistinguishable from a run that
 *  found nothing — so progress is a correctness feature here, not decoration. */
export function describeProgress(p: RunProgress): string {
  const pct = p.total === 0 ? 0 : Math.round((p.completed / p.total) * 100);
  const base = `${p.currentPhase} phase — ${p.completed}/${p.total} source(s) done (${pct}%)`;
  if (p.failed.length === 0) return base + '.';
  return `${base}; ${p.failed.length} source(s) FAILED (${p.failed.join(', ')}) — these found nothing because they could not be read, not because the records are absent.`;
}

export interface EscalationAdvice {
  worthEscalating: boolean;
  reason: string;
}

/** Should the researcher escalate to paid after a free run?
 *
 *  Advice, not a decision — the researcher escalates. But the advice must not claim escalation will
 *  help when no paid source serves the county, or when the free pass failed for reasons paying
 *  cannot fix. */
export function adviseEscalation(
  county: string,
  freeDocumentsFound: number,
  failedSourceIds: string[],
  catalogue: ResearchSource[] = SOURCE_CATALOGUE,
): EscalationAdvice {
  const paidAvailable = catalogue.filter((s) => s.cost === 'paid' && servesCounty(s, county));

  if (paidAvailable.length === 0) {
    return {
      worthEscalating: false,
      reason: `No paid source serves ${county}. Escalating would cost money and search the same places.`,
    };
  }

  if (failedSourceIds.length > 0 && freeDocumentsFound === 0) {
    // The distinction that matters: the free pass did not report "nothing recorded", it reported
    // "could not read". Paying may help, but the free failure should be understood first.
    return {
      worthEscalating: true,
      reason:
        `The free pass found nothing, but ${failedSourceIds.length} source(s) FAILED (${failedSourceIds.join(', ')}) — ` +
        `so "nothing found" here means "not read", not "nothing recorded". Escalation may help, but re-running ` +
        `the failed free sources costs nothing and should be tried first.`,
    };
  }

  if (freeDocumentsFound === 0) {
    return {
      worthEscalating: true,
      reason: `Every free source for ${county} ran cleanly and found nothing. ${paidAvailable.map((s) => s.label).join(', ')} covers records the free sources do not.`,
    };
  }

  return {
    worthEscalating: true,
    reason:
      `The free pass found ${freeDocumentsFound} document(s). ${paidAvailable.map((s) => s.label).join(', ')} may hold more, ` +
      `and anything already retrieved will NOT be bought again.`,
  };
}
