// app/admin/research/components/run-progress.ts — D1.
//
// The stage a run is in, worked out from the worker's status message. Pulled out of
// `ResearchRunPanel` (1,771 lines) because it is the one piece of that file that can be WRONG in a
// way a reader would notice — and it was.
//
// ── `Stage 3.5` REPORTED ITSELF AS STAGE 3 ──────────────────────────────────────────────────────
//
// The inference ran its checks in source order, and the stage-3 test came first:
//
//     if (/stage\s*3/i.test(message) || …) { … return 'extracting'; }
//     if (/stage\s*3\.5/i.test(message) || /reconcil/i.test(lower)) return 'validating_data';
//
// `/stage\s*3/` matches inside `"Stage 3.5"`, so the second line **could not be reached by stage
// number at all**. `worker/src/services/pipeline.ts:2023` posts exactly:
//
//     Stage 3.5: Geometric reconciliation…
//
// "reconciliation" contains none of `validat` / `summar` / `compil`, so the stage-3 block fell
// through to its default and the panel displayed **"Extracting Data"** for the whole of geometric
// reconciliation — a stage that can take minutes on a plat with many curves. The progress bar sat
// at the extraction step, and an operator watching it had no way to know the run had moved on.
//
// The `/reconcil/` half of that unreachable line would have caught it. It never got the chance.
//
// Specific before general is the rule this violated, and the fix is to order the checks that way
// rather than to make the stage-3 pattern cleverer: `3.5` is tested first, and the general `stage 3`
// test additionally refuses a decimal, so adding a `3.7` later cannot resurrect the same bug
// silently.

/** Worker pipeline stage names, in the order they are reached. */
export const MICRO_STAGES = [
  { id: 'compiling',        label: 'Compiling Resources',        stageNums: [0, 1] },
  { id: 'validating',       label: 'Validating Information',      stageNums: [1] },
  { id: 'analyzing',        label: 'Analyzing Resources',         stageNums: [2] },
  { id: 'extracting',       label: 'Extracting Data',             stageNums: [3] },
  { id: 'compiling_data',   label: 'Compiling Data',              stageNums: [3] },
  { id: 'validating_data',  label: 'Validating Data',             stageNums: [3, 4] },
  { id: 'resource_summary', label: 'Building Resource Summary',   stageNums: [5] },
  { id: 'final_summary',    label: 'Building Final Summary',      stageNums: [6] },
] as const;

export type MicroStageId = (typeof MICRO_STAGES)[number]['id'];

export function inferMicroStage(
  message: string | undefined,
  status: string | null,
  docCount: number,
): MicroStageId {
  if (!status || status === 'starting') return 'compiling';
  if (status === 'success' || status === 'partial' || status === 'complete') return 'final_summary';
  if (!message) return 'compiling';
  const lower = message.toLowerCase();

  if (/stage\s*0/i.test(message) || /stage\s*1/i.test(message) || /normaliz/i.test(lower)
    || /searching.*cad/i.test(lower)) return 'compiling';

  if (/stage\s*2/i.test(message) || /retrieving/i.test(lower)) {
    return docCount > 0 ? 'validating' : 'compiling';
  }

  // BEFORE the stage-3 test, not after it. `/stage\s*3/` matches inside "Stage 3.5", which is what
  // made this line dead and left reconciliation displaying as extraction.
  if (/stage\s*3\.5/i.test(message) || /reconcil/i.test(lower)) return 'validating_data';

  // `(?!\.\d)` so a future "Stage 3.7" does not quietly land here the way 3.5 did. Belt and braces
  // with the ordering above: either alone would fix today's bug, and the pair is what stops the
  // next one being reintroduced by a reorder.
  if (/stage\s*3(?!\.\d)/i.test(message) || /extract/i.test(lower) || /claude/i.test(lower)) {
    if (/validat/i.test(lower)) return 'validating_data';
    if (/summar/i.test(lower)) return 'resource_summary';
    if (/compil/i.test(lower)) return 'compiling_data';
    return 'extracting';
  }

  if (/stage\s*4/i.test(message) || /valid/i.test(lower) || /quality/i.test(lower)) return 'validating_data';
  return 'analyzing';
}

/**
 * Where the progress bar sits, as a percentage.
 *
 * Clamped to 6–96 while running: a bar pinned at 0 reads as "nothing is happening" and one at 100
 * reads as "finished". Only a genuine success reaches 100.
 *
 * The **ceiling binds; the floor does not.** With eight stages the first one already computes to
 * 13%, so `Math.max(6, …)` cannot change any value this function currently returns — replacing it
 * with `Math.max(0, …)` is an equivalent mutation and the tests correctly do not catch it. It stays
 * because it is the invariant the caller depends on, and it starts mattering the moment the stage
 * list gets shorter. Said out loud so nobody later reads a surviving mutant as a missing test.
 */
export function progressPercent(stage: MicroStageId, isSuccess: boolean): number {
  if (isSuccess) return 100;
  const index = Math.max(0, MICRO_STAGES.findIndex((s) => s.id === stage));
  return Math.min(96, Math.max(6, Math.round(((index + 1) / MICRO_STAGES.length) * 100)));
}
