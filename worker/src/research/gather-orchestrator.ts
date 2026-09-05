// worker/src/research/gather-orchestrator.ts — the Gather run's acquisition engine (plan G4 + G5)
//
// ── WHAT THIS IS ────────────────────────────────────────────────────────────────────────────────
//
// The Gather run's whole job: work the acquisition want-list (G3) and get each document as cheaply as
// possible. The cost-management determination is **free-first, TexasFile gap-fills, capped +
// refundable** — so for every want this engine:
//
//   1. tries FREE sources first (county site / capture) — anything found here costs $0;
//   2. only if free found nothing, and TexasFile is toggled on and its $10 earmark still has room,
//      buys it from TexasFile (G2 gating), spending real wallet money ≤ the remaining $10;
//   3. records the outcome so the run can report what it got, from where, and for how much.
//
// The two side effects — "find it free" and "buy it from TexasFile" — are INJECTED. That keeps this
// engine pure orchestration: the ordering, the free-first rule, the $10 gate and the refund
// settlement are all unit-testable with fakes, and the real implementations (county capture,
// `buyDocument` → file-for-Review) are wired in by the run without changing the logic here.

import { buildWantList, type Want, type SubjectInput, type AdjoinerInput } from './acquisition-wantlist.js';
import {
  type GatherBudget,
  type AddonSettlement,
  remainingTexasfileAllowance,
  settleTexasfileAddon,
} from './gather-budget.js';

export type WantOutcome =
  | 'free'            // satisfied by a free source ($0)
  | 'texasfile'       // bought from TexasFile
  | 'missing'         // neither free nor TexasFile could get it
  | 'skipped_budget'  // TexasFile had it but the $10 earmark was spent
  | 'skipped_off'     // free failed and TexasFile is toggled off
  | 'stopped';        // the run hit a hard stop (cost cap or the 1-hour wall clock) before this want

/** What a free source did for one want. */
export interface FreeResolveResult {
  found: boolean;
  source?: string;
  /** The filed document's id/label, if the free source filed one. */
  ref?: string | null;
}

/** What a TexasFile buy did for one want. */
export interface TexasBuyResult {
  bought: boolean;
  costUsd: number;
  ref?: string | null;
  /** 'budget' when the buy was refused for cost; anything else is a not-found / technical reason. */
  reason?: string;
}

export interface GatherWantResult {
  want: Want;
  outcome: WantOutcome;
  costUsd: number;
  source: string | null;
  ref?: string | null;
  note?: string;
}

export interface GatherAcquisitionResult {
  results: GatherWantResult[];
  texasFileSpend: number;
  texasFileFilesFound: number;
  /** The $10 earmark settlement: charged if TexasFile found anything, else refunded. */
  settlement: AddonSettlement;
  /** Wants satisfied from any source (free or TexasFile). */
  satisfied: number;
  /** Wants nothing could get. */
  missing: number;
}

export interface RunGatherInput {
  subject: SubjectInput;
  adjoiners?: AdjoinerInput[];
  budget: GatherBudget;
  /** Try to satisfy a want from free sources. */
  resolveFree: (want: Want) => Promise<FreeResolveResult>;
  /** Buy a want from TexasFile, spending no more than `maxUsd` (the remaining earmark). */
  buyFromTexasFile: (want: Want, maxUsd: number) => Promise<TexasBuyResult>;
  /**
   * The run's hard-stop signal. The cost watchdog (fires the instant spend crosses the cap) and the
   * 1-hour wall-clock watchdog both abort this. Once aborted, the gather loop stops attempting wants
   * and marks the rest `stopped` — so a hard stop is honoured to within one in-flight want, not a
   * whole want-list. Optional so tests and simple callers can omit it.
   */
  signal?: AbortSignal;
  /** Optional progress sink. */
  log?: (message: string) => void;
}

/**
 * Walk the want-list free-first, TexasFile-gap-fill, and settle the $10 earmark. Never throws for a
 * single want — a resolver/buyer that rejects records that want as `missing` and the run continues.
 */
export async function runGatherAcquisition(input: RunGatherInput): Promise<GatherAcquisitionResult> {
  const wants = buildWantList({ subject: input.subject, adjoiners: input.adjoiners });
  const log = input.log ?? (() => {});
  const results: GatherWantResult[] = [];
  let texasFileSpend = 0;
  let texasFileFilesFound = 0;

  for (const want of wants) {
    // 0. Hard stop first — the cost cap or the 1-hour wall clock aborts this signal. Do not start
    //    another want (a free lookup or, worse, a paid buy) once the run has been told to stop.
    if (input.signal?.aborted) {
      results.push({ want, outcome: 'stopped', costUsd: 0, source: null, note: 'run hit its hard stop' });
      continue;
    }

    // 1. Free first — the money-saver.
    let free: FreeResolveResult = { found: false };
    try {
      free = await input.resolveFree(want);
    } catch (e) {
      log(`free source threw for "${want.label}": ${errText(e)}`);
    }
    if (free.found) {
      log(`${want.label}: found free${free.source ? ` (${free.source})` : ''}`);
      results.push({ want, outcome: 'free', costUsd: 0, source: free.source ?? 'free', ref: free.ref ?? null });
      continue;
    }

    // 2. TexasFile gap-fill — only if enabled and the earmark has room.
    if (!input.budget.texasfileOn) {
      results.push({ want, outcome: 'skipped_off', costUsd: 0, source: null, note: 'TexasFile off' });
      continue;
    }
    // The free lookup above can itself span the cap; do not open a paid buy on a stopped run.
    if (input.signal?.aborted) {
      results.push({ want, outcome: 'stopped', costUsd: 0, source: null, note: 'run hit its hard stop' });
      continue;
    }
    const remaining = remainingTexasfileAllowance(input.budget, texasFileSpend);
    if (remaining <= 0) {
      log(`${want.label}: TexasFile earmark spent — skipped`);
      results.push({ want, outcome: 'skipped_budget', costUsd: 0, source: null, note: 'earmark spent' });
      continue;
    }

    let buy: TexasBuyResult = { bought: false, costUsd: 0 };
    try {
      buy = await input.buyFromTexasFile(want, remaining);
    } catch (e) {
      log(`TexasFile buy threw for "${want.label}": ${errText(e)}`);
    }
    if (buy.bought) {
      texasFileSpend += buy.costUsd;
      texasFileFilesFound += 1;
      log(`${want.label}: bought from TexasFile ($${buy.costUsd})`);
      results.push({ want, outcome: 'texasfile', costUsd: buy.costUsd, source: 'texasfile', ref: buy.ref ?? null });
    } else {
      const budgetRefused = buy.reason === 'budget';
      results.push({
        want,
        outcome: budgetRefused ? 'skipped_budget' : 'missing',
        costUsd: 0,
        source: null,
        note: buy.reason ?? 'not found',
      });
    }
  }

  const settlement = settleTexasfileAddon({ filesFound: texasFileFilesFound, addon: input.budget.texasfileAddon });
  const satisfied = results.filter((r) => r.outcome === 'free' || r.outcome === 'texasfile').length;
  const missing = results.filter((r) => r.outcome === 'missing').length;

  log(
    `Gather complete: ${satisfied}/${results.length} satisfied (${results.filter((r) => r.outcome === 'free').length} free, ` +
      `${texasFileFilesFound} TexasFile), $${texasFileSpend.toFixed(2)} wallet; ` +
      (input.budget.texasfileOn
        ? settlement.charged > 0
          ? `$${settlement.charged} add-on charged.`
          : `$${settlement.refunded} add-on refunded.`
        : 'TexasFile off.'),
  );

  return { results, texasFileSpend, texasFileFilesFound, settlement, satisfied, missing };
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
