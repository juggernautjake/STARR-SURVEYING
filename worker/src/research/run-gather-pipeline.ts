// worker/src/research/run-gather-pipeline.ts — the Gather run, composed (plan GATHER_AND_REVIEW_SPLIT)
//
// This is the entrypoint that turns the pieces built for the split into one runnable Gather pass:
//
//   • the budget model     — gatherBudget (base floor $7 + a refundable $10 TexasFile earmark),
//   • the want-list        — buildWantList, walked inside runGatherAcquisition,
//   • free-first + the cap — runGatherAcquisition (tries `resolveFree`, then TexasFile for gaps),
//   • the real buyer       — makeTexasFileWantBuyer (Want → purchaseDocument → file-for-Review),
//   • the hard stops       — the run's AbortSignal, honoured inside the engine.
//
// It performs NO AI analysis (that is the separate analyze run). The two effects that touch the
// outside world — `resolveFree` (free county capture) and the TexasFile buyer — are injectable so the
// composition is unit-tested with fakes; the default buyer is the real adapter-backed one.

import type { SubjectInput, AdjoinerInput, Want } from './acquisition-wantlist.js';
import { gatherBudget, type GatherBudget } from './gather-budget.js';
import {
  runGatherAcquisition,
  type GatherAcquisitionResult,
  type FreeResolveResult,
  type TexasBuyResult,
} from './gather-orchestrator.js';
import { makeTexasFileWantBuyer } from './texasfile-want-buyer.js';
import { mayRunBuyDocuments, shouldGatherDocuments, type RunSettings } from './run-settings.js';

export interface RunGatherPipelineInput {
  projectId: string;
  county: string;
  subject: SubjectInput;
  adjoiners?: AdjoinerInput[];
  settings: RunSettings;
  /** The run's hard-stop signal (cost cap / 1-hour wall clock). */
  signal?: AbortSignal;
  /** Try free county sources for a want. Injected — the HTTP dispatch supplies the real capture. */
  resolveFree: (want: Want) => Promise<FreeResolveResult>;
  /** Injected for tests; defaults to the real adapter-backed TexasFile buyer. */
  buyFromTexasFile?: (want: Want, maxUsd: number) => Promise<TexasBuyResult>;
  log?: (message: string) => void;
}

export interface RunGatherPipelineResult extends GatherAcquisitionResult {
  budget: GatherBudget;
  /** Whether TexasFile was enabled for this run (paid allowed + toggle on). */
  texasfileOn: boolean;
}

/** Decide whether TexasFile is on for this run: paid documents must be permitted by the settings. */
export function texasfileEnabledFor(settings: RunSettings): boolean {
  return mayRunBuyDocuments(settings).allowed;
}

/** Build the two-budget gather plan from a run's settings: the TexasFile budget (min $10, from
 *  `maxCostUsd`) when TexasFile is on, and the other-sources budget (min $2). */
export function gatherBudgetForSettings(settings: RunSettings): GatherBudget {
  return gatherBudget({
    texasfileOn: texasfileEnabledFor(settings),
    texasfileBudgetUsd: settings.maxCostUsd,
  });
}

/**
 * Run the Gather pass: walk the want-list free-first, fill gaps from TexasFile within the TexasFile
 * budget, honour the hard stops, and return the per-want outcomes + spend. Never runs AI.
 */
export async function runGatherPipeline(input: RunGatherPipelineInput): Promise<RunGatherPipelineResult> {
  const log = input.log ?? (() => {});

  // An `analyze` run must never gather; this entrypoint is for gathering only. Guard rather than
  // silently do the wrong thing.
  if (!shouldGatherDocuments(input.settings)) {
    log('runGatherPipeline called for an analyze run — nothing gathered.');
    const budget = gatherBudgetForSettings(input.settings);
    return {
      results: [], texasFileSpend: 0, texasFileFilesFound: 0,
      satisfied: 0, missing: 0, budget, texasfileOn: budget.texasfileOn,
    };
  }

  const budget = gatherBudgetForSettings(input.settings);
  const buyFromTexasFile =
    input.buyFromTexasFile ?? makeTexasFileWantBuyer({ county: input.county, projectId: input.projectId });

  log(
    budget.texasfileOn
      ? `Gather run: TexasFile budget $${budget.texasfileBudgetUsd} + other-sources $${budget.otherBudgetUsd}.`
      : `Gather run: other-sources $${budget.otherBudgetUsd} (TexasFile off).`,
  );

  const result = await runGatherAcquisition({
    subject: input.subject,
    adjoiners: input.adjoiners,
    budget,
    resolveFree: input.resolveFree,
    buyFromTexasFile,
    signal: input.signal,
    log,
  });

  return { ...result, budget, texasfileOn: budget.texasfileOn };
}
