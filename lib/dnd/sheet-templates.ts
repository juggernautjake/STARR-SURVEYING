// lib/dnd/sheet-templates.ts — the browsable TEMPLATE (format) catalog.
//
// A character sheet has three orthogonal axes (see the multi-format planning doc): the SYSTEM (its
// rules), the SKIN (`sheet_type` — colour palette), and the TEMPLATE (`sheetLayout` — the FORMAT,
// where information sits and how it is arranged). This file is the template axis's answer to
// `sheet-styles.ts`: a small, server+client-safe catalog so both the API (to validate a chosen
// layout) and the picker UI can import it without pulling in the heavy `_sheet` engine.
//
// A template is a LAYOUT SHELL that arranges a system's panels — it holds no system data, so the
// SAME template works for every system once that system provides its panel set. The `builtFor` map
// records HONESTLY which (template × system) pairs are actually rendered today, so the picker never
// offers a format a system cannot yet render (the same honest-coverage discipline the spell/PF2
// catalog status objects use — an un-built combination is a recorded gap, not a broken option).
import type { CharacterSystem } from './systems';

/** The layout formats. Mirror of `SheetLayout` in `app/dnd/_sheet/types.ts`, kept here so this
 *  engine-free module can be imported by the API without the sheet React tree. */
export type TemplateId = 'classic' | 'codex' | 'dashboard' | 'play';

export interface SheetTemplate {
  id: TemplateId;
  label: string;
  /** One line for the picker card. */
  blurb: string;
  /** A tiny monospace wireframe for the picker preview — the template axis's answer to the skin
   *  swatch, so the FORMAT reads at a glance the way a colour does. */
  wireframe: string;
}

export const SHEET_TEMPLATES: SheetTemplate[] = [
  {
    id: 'classic',
    label: 'Classic',
    blurb: 'One section at a time, tabs across the top, stats in a header. Compact and phone-friendly.',
    wireframe: '▂▂▂▂▂▂\n[·|·|·]\n██████\n██████',
  },
  {
    id: 'codex',
    label: 'Codex',
    blurb: 'Stats down the left, tall tabs stacked on the right opening resizable sections you keep open at once.',
    wireframe: '▐█ ▏▂▂\n▐█ ▏██\n▐█ ▏▂▂\n▐█ ▏██',
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    blurb: 'Every section a card in a reflowing grid — see everything at once. Best on a wide screen.',
    wireframe: '▢▢ ▢▢\n▢▢▢ ▢\n▢ ▢▢▢',
  },
  {
    id: 'play',
    label: 'Play mode',
    blurb: 'Big tappable vitals and attacks front-and-centre, reference tucked into a drawer. Built for the table.',
    wireframe: '▉▉▉▉▉\n[▉][▉]\n▸ ref',
  },
];

const BY_ID = new Map(SHEET_TEMPLATES.map((t) => [t.id, t]));

/**
 * Which templates are actually BUILT and rendered for a given system today.
 *
 * This is the honest-coverage seam: the picker reads this, so it can only ever offer a format the
 * system can really render with real data. As slices land (Dashboard/Play for 5e, then the PF2 and
 * IG panel-sets), a system's list grows here — one line per newly-wired (template × system) pair.
 *
 * NOTE the shape: 5e (both editions) shares the `_sheet` engine, so they share a list. PF2 and IG
 * render their bespoke sheets and today have only their default (Classic) format until their panel
 * sets are extracted (slices T-5/T-6).
 */
const BUILT_FOR: Record<string, TemplateId[]> = {
  'dnd5e-2014': ['classic', 'codex', 'dashboard', 'play'],
  'dnd5e-2024': ['classic', 'codex', 'dashboard', 'play'],
  pathfinder2e: ['classic', 'codex', 'dashboard'],
  'intuitive-games': ['classic'],
  // System-ambiguous and under-construction systems use the shared engine's classic form.
  ambiguous: ['classic', 'codex', 'dashboard', 'play'],
};

/** The templates a system can render, in canonical order. Never empty — every system has Classic. */
export function templatesForSystem(system: CharacterSystem | string | undefined): SheetTemplate[] {
  const ids = BUILT_FOR[system ?? 'ambiguous'] ?? ['classic'];
  // Preserve the canonical SHEET_TEMPLATES order rather than the map's insertion order.
  return SHEET_TEMPLATES.filter((t) => ids.includes(t.id));
}

/** Is `layout` a template this system can actually render? Used to validate a PATCH and to fall a
 *  stored-but-now-unavailable layout back to Classic (e.g. a character transposed to a system that
 *  hasn't built that format yet). */
export function isTemplateBuiltFor(system: CharacterSystem | string | undefined, layout: unknown): layout is TemplateId {
  return typeof layout === 'string' && templatesForSystem(system).some((t) => t.id === layout);
}

/** A template by id, or undefined. */
export function sheetTemplate(id: string): SheetTemplate | undefined {
  return BY_ID.get(id as TemplateId);
}
