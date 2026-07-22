// lib/dnd/roller-templates.ts — the ROLLER-TEMPLATE catalog (RO-2).
//
// The dice roller has its OWN template axis, chosen per page INDEPENDENTLY of the sheet template
// (owner 2026-07-22): a character can be on the Codex sheet but roll with the Dice Core roller. Where
// `sheet-templates.ts` catalogs the sheet FORMATS, this small engine-free module catalogs the four
// roller presentations so both the `/roller` API (to validate a choice) and the on-roller picker can
// import it without pulling in the `_sheet` React tree.
//
// Unlike sheet templates, EVERY roller template works for EVERY system: a roller template is a pure
// PRESENTATION of the same roll data (the resolution stage + controls differ; the maths do not), so
// there is no per-system `builtFor` gate here — all four are always offered.

/** The four roller presentations. `core` = Dice Core (DiceTray), `sigil` = Sigil Stack, `board` =
 *  Roll Board, `impact` = Impact Roller. */
export type RollerTemplateId = 'core' | 'sigil' | 'board' | 'impact';

export interface RollerTemplate {
  id: RollerTemplateId;
  label: string;
  /** A single glyph for the on-roller picker chip — the roller axis's answer to the skin swatch. */
  glyph: string;
  /** One line describing how THIS roller is controlled/resolves, so the four read as distinct
   *  experiences rather than reskins. */
  blurb: string;
}

export const ROLLER_TEMPLATES: RollerTemplate[] = [
  { id: 'core', label: 'Dice Core', glyph: '⬡', blurb: 'A compact console — tap a stat, dice resolve in a central core. The all-rounder.' },
  { id: 'sigil', label: 'Sigil Stack', glyph: '◈', blurb: 'The roll assembles as a stack of sigils; advantage/disadvantage stack visibly.' },
  { id: 'board', label: 'Roll Board', glyph: '▤', blurb: 'A broad board that lays every die out in a row — best when you roll fistfuls.' },
  { id: 'impact', label: 'Impact', glyph: '✦', blurb: 'Big, table-facing result with a heavy tumble-and-land — built for Play mode.' },
];

const BY_ID = new Map(ROLLER_TEMPLATES.map((t) => [t.id, t]));

/** The sensible DEFAULT roller for each sheet template, so a character that has never picked a roller
 *  keeps exactly the roller its sheet template shipped with (no regression). The on-roller picker then
 *  lets them override it per page. Keys are `SheetLayout` values (undefined → classic → core). */
export const DEFAULT_ROLLER_FOR_LAYOUT: Record<string, RollerTemplateId> = {
  classic: 'core',
  codex: 'sigil',
  dashboard: 'board',
  play: 'impact',
};

/** Is `id` one of the four roller templates? Used to validate a `/roller` PATCH. */
export function isRollerTemplate(id: unknown): id is RollerTemplateId {
  return typeof id === 'string' && BY_ID.has(id as RollerTemplateId);
}

/** A roller template by id, or undefined. */
export function rollerTemplate(id: string): RollerTemplate | undefined {
  return BY_ID.get(id as RollerTemplateId);
}

/** The effective roller template for a character: their explicit choice if valid, else the default for
 *  their current sheet layout, else `core`. One place so the picker, the API and the sheet agree. */
export function resolveRollerTemplate(chosen: unknown, sheetLayout: unknown): RollerTemplateId {
  if (isRollerTemplate(chosen)) return chosen;
  const layout = typeof sheetLayout === 'string' ? sheetLayout : 'classic';
  return DEFAULT_ROLLER_FOR_LAYOUT[layout] ?? 'core';
}
