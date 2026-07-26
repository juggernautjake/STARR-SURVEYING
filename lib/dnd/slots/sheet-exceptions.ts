// lib/dnd/slots/sheet-exceptions.ts — read a character's recorded exceptions, whatever system it is.
//
// The three systems keep their choice ledgers in three different places (`build.choices`,
// `pf2Build.choices`, `igBuild.choices`) because each has its own slot model — S3 in the slot plan
// deliberately did NOT unify them, on the grounds that the two that existed already worked and a shared
// vocabulary invented before the third system's needs were known would be abstraction ahead of evidence.
//
// That decision has a cost, and this module is it: anything that wants "the exceptions on this sheet" has
// to know all three keys. Better one module that knows them than every badge, panel and card knowing them —
// which is exactly how the `variantKind === 'vanilla'` check ended up wrong in four separate places.
import type { SlotException } from './entitlement';
import { exceptionsIn, describeException } from './entitlement';
import { normalizeSystem } from '../systems';

/** Where each system keeps the ledger. A system absent here simply has no exceptions to find. */
const LEDGER: Record<string, string> = {
  'dnd5e-2014': 'build',
  'dnd5e-2024': 'build',
  pathfinder2e: 'pf2Build',
  'intuitive-games': 'igBuild',
};

/**
 * Every exception recorded on a sheet, for the system it belongs to.
 *
 * Defensive throughout — `data` is persisted jsonb that may predate the field, may have been hand-edited,
 * and (for a sheet transposed between systems) may carry a ledger belonging to a system it is no longer in.
 * A missing or malformed ledger yields no exceptions rather than throwing, which is the safe direction: the
 * badge falls back to plain "Vanilla" instead of the sheet failing to render.
 */
export function sheetExceptions(data: unknown, system: string): SlotException[] {
  const key = LEDGER[normalizeSystem(system)];
  if (!key || !data || typeof data !== 'object') return [];
  const block = (data as Record<string, unknown>)[key];
  if (!block || typeof block !== 'object') return [];
  return exceptionsIn((block as { choices?: unknown }).choices as { level?: number; exception?: unknown }[] | undefined);
}

/** The same, already worded for display: ["Magic Initiate (DM-granted, level 4)", …]. */
export function sheetExceptionLabels(data: unknown, system: string): string[] {
  return sheetExceptions(data, system).map(describeException);
}
