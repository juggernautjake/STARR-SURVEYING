// lib/hub/widgets/approvals/pick-mode.ts
//
// consolidation Slice 3 (2026-05-30) — pure helper for the unified
// Approvals widget. `pickDefaultMode` picks the tab that has the most
// items so the surveyor lands on the busiest queue without clicking.
// Dependency-free → unit-tested in node.

export type ApprovalMode = 'hours' | 'receipts' | 'time-off';

export interface ApprovalCounts {
  hours: number;
  receipts: number;
  timeOff: number;
}

/** The order applied when two counts tie. Hours first because field
 *  crews submit weekly and tend to dominate the queue. */
const TIE_BREAKER: ReadonlyArray<ApprovalMode> = ['hours', 'receipts', 'time-off'];

/** Pick the mode with the largest count; ties broken by TIE_BREAKER
 *  order. Returns 'hours' when every count is zero. */
export function pickDefaultMode(counts: ApprovalCounts): ApprovalMode {
  const lookup: Record<ApprovalMode, number> = {
    hours: Math.max(0, counts.hours | 0),
    receipts: Math.max(0, counts.receipts | 0),
    'time-off': Math.max(0, counts.timeOff | 0),
  };
  let winner: ApprovalMode = 'hours';
  let best = -1;
  for (const mode of TIE_BREAKER) {
    if (lookup[mode] > best) {
      best = lookup[mode];
      winner = mode;
    }
  }
  return winner;
}

/** Compact "[N] hours · [M] receipts · [K] time-off" string for the
 *  tiny / small bucket renderings. */
export function summarizeCounts(counts: ApprovalCounts): string {
  return `${counts.hours} hours · ${counts.receipts} receipts · ${counts.timeOff} time-off`;
}
