// lib/dnd/provenance.ts — the custom-vs-vanilla provenance model (IG builder Slice 2).
//
// Every character element is flagged VANILLA (genuinely from the game system), CUSTOM (homebrew), or
// DM-GRANTED (a custom element the DM explicitly gave the player). Classification is deterministic: an
// element name is VANILLA when it appears in the system's vanilla content, else CUSTOM; DM-GRANTED is an
// explicit tag carried on the element. Pure — no services — so the builder, the DM review, and the
// vanilla-only-campaign submission gate all rely on the same guarantee.
import type { Character } from '@/app/dnd/_sheet/types';
import type { CharacterSystem } from './systems';
import { systemSpecies, systemClassNames, systemSkills, systemConditions } from './system-rules';
import { igIsVanilla, type IGContentKind } from './systems/intuitive-games/content';

export type Provenance = 'vanilla' | 'custom' | 'dm-granted';

/** The kinds of element provenance applies to (a superset of the shared catalog kinds + IG content). */
export type ElementKind =
  | 'ancestry' | 'class' | 'subclass' | 'background' | 'skill' | 'condition'
  | 'stance' | 'feat' | 'power' | 'spell' | 'defensive-power' | 'weapon-type' | 'movement-type'
  | 'weapon' | 'ability' | 'action' | 'creature-type' | 'other';

export interface TaggedElement {
  kind: ElementKind;
  name: string;
  source: Provenance;
  /** For dm-granted elements: who granted it (a user id or display name). */
  grantedBy?: string | null;
  /** Optional DM/AI-authored mechanics for a custom/granted element. */
  mechanics?: string | null;
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// Kinds handled by the Intuitive Games content library.
//
// This set MUST stay in step with `IGContentKind` in the IG content module. It fell out of step
// once already, and the failure was silent by construction: `background` was missing here while
// IG's own `KIND_NAMES.background` listed all ten catalogued backgrounds and `igIsVanilla` would
// have classified them correctly. The shared layer simply never asked. An untracked kind resolves
// to `vanilla` (see `vanillaNamesFor` — deliberately, so an unknown kind is never FALSELY flagged
// custom), so the effect was that a completely invented IG background passed as official on a
// vanilla character. A hole in the gate that fails open, in the one place the gate is supposed to
// fail closed.
//
// That is why this is a Set literal checked against `IGContentKind` by test, rather than a list
// someone remembers to update: the omission produced no type error, no test failure, and no
// visible symptom — only content sneaking through unflagged.
// Exported so the drift test can assert the RELATIONSHIP to `IGContentKind` rather than pin a
// hand-copied list — a test that restates the list would have been just as wrong as the list was.
export const IG_KINDS = new Set<ElementKind>(['stance', 'feat', 'power', 'spell', 'defensive-power', 'weapon-type', 'movement-type', 'creature-type', 'subclass', 'background']);

/**
 * The vanilla names for a (system, kind), or `null` when the system does not track that kind (so it can't
 * be proven custom — an untracked kind is treated as vanilla, never falsely flagged). Shared kinds
 * (ancestry/class/skill/condition) come from the rules catalog for ANY system; the IG-specific kinds come
 * from the Intuitive Games content library.
 */
function vanillaNamesFor(system: CharacterSystem, kind: ElementKind): string[] | 'tracked-by-ig' | null {
  switch (kind) {
    case 'ancestry': return systemSpecies(system);
    case 'class': return systemClassNames(system);
    case 'skill': return systemSkills(system).map((s) => s.name);
    case 'condition': return systemConditions(system);
    default:
      // IG-specific content kinds are only tracked for the intuitive-games system.
      if (system === 'intuitive-games' && IG_KINDS.has(kind)) return 'tracked-by-ig';
      return null; // untracked → cannot prove custom
  }
}

/**
 * Classify an element as VANILLA or CUSTOM for a system (never DM-GRANTED — that is an explicit tag).
 * An untracked (system, kind) can't be proven custom, so it resolves to VANILLA.
 */
export function classifyElement(system: CharacterSystem, kind: ElementKind, name: string): 'vanilla' | 'custom' {
  const nm = norm(name);
  if (!nm) return 'vanilla';
  const list = vanillaNamesFor(system, kind);
  if (list === null) return 'vanilla'; // untracked kind → don't flag
  if (list === 'tracked-by-ig') return igIsVanilla(kind as IGContentKind, name) ? 'vanilla' : 'custom';
  return list.map(norm).includes(nm) ? 'vanilla' : 'custom';
}

/** Tag an element: DM-GRANTED when `grantedBy` is provided, else the deterministic classification. */
export function tagElement(
  system: CharacterSystem,
  kind: ElementKind,
  name: string,
  opts: { grantedBy?: string | null; mechanics?: string | null } = {},
): TaggedElement {
  const source: Provenance = opts.grantedBy ? 'dm-granted' : classifyElement(system, kind, name);
  return { kind, name: String(name ?? '').trim(), source, grantedBy: opts.grantedBy ?? null, mechanics: opts.mechanics ?? null };
}

/** The kinded record an Intuitive Games build stores on the character so its stances/powers/feats keep their
 *  real kind for provenance (structural — no import of the builder, to avoid a cycle). */
interface IGBuildShape {
  ancestry?: string; className?: string; subclass?: string; defensivePower?: string; companionType?: string;
  stances?: string[]; powers?: string[]; feats?: string[]; weapons?: string[]; weaponTypes?: string[];
}

/** Pull the recognizable elements out of a character sheet so any character can be flagged. When the sheet
 *  carries an `igBuild` block (the Intuitive Games builder, Slice 7b), its stances/powers/feats/etc. are read
 *  with their correct kinds; otherwise the generic 5e-shaped extraction is used. Spells + custom skills are
 *  always read from the sheet. */
export function extractCharacterElements(char: Character): { kind: ElementKind; name: string }[] {
  const out: { kind: ElementKind; name: string }[] = [];
  const push = (kind: ElementKind, name: unknown) => { const s = String(name ?? '').trim(); if (s) out.push({ kind, name: s }); };
  const build = (char as { igBuild?: IGBuildShape })?.igBuild;
  if (build) {
    push('class', build.className ?? char?.meta?.className);
    push('ancestry', build.ancestry ?? char?.meta?.species);
    push('subclass', build.subclass ?? char?.meta?.subclass);
    for (const s of build.stances ?? []) push('stance', s);
    for (const pw of build.powers ?? []) push('power', pw);
    for (const f of build.feats ?? []) push('feat', f);
    for (const w of build.weapons ?? []) push('weapon', w);
    for (const wt of build.weaponTypes ?? []) push('weapon-type', wt);
    if (build.defensivePower) push('defensive-power', build.defensivePower);
    if (build.companionType) push('creature-type', build.companionType);
  } else {
    push('class', char?.meta?.className);
    push('ancestry', char?.meta?.species);
    push('subclass', char?.meta?.subclass);
    for (const a of char?.attacks ?? []) push('weapon', a?.name);
    for (const f of char?.features ?? []) push('feat', f?.name);
  }
  for (const s of char?.spells ?? []) push('spell', s?.name);
  for (const s of char?.customSkills ?? []) push('skill', (s as { name?: string })?.name);
  return out;
}

export interface ProvenanceSummary {
  elements: TaggedElement[];
  vanilla: TaggedElement[];
  custom: TaggedElement[];
  dmGranted: TaggedElement[];
  /** Custom elements that are NOT DM-granted — these are what a vanilla-only campaign blocks. */
  blocking: TaggedElement[];
  hasCustom: boolean;
  /** True when the character has custom content a vanilla-only campaign would block. */
  hasBlockingCustom: boolean;
}

/** Group a list of tagged elements by provenance and compute the blocking set. */
export function summarizeProvenance(elements: TaggedElement[]): ProvenanceSummary {
  const vanilla = elements.filter((e) => e.source === 'vanilla');
  const custom = elements.filter((e) => e.source === 'custom');
  const dmGranted = elements.filter((e) => e.source === 'dm-granted');
  const blocking = custom; // custom that isn't dm-granted
  return { elements, vanilla, custom, dmGranted, blocking, hasCustom: custom.length + dmGranted.length > 0, hasBlockingCustom: blocking.length > 0 };
}

/**
 * Flag every element of a character for its system, marking any whose name matches a DM-granted entry as
 * DM-GRANTED. `dmGranted` is the character's list of DM-granted elements (name + kind + optional mechanics).
 */
export function summarizeCharacterProvenance(
  char: Character,
  system: CharacterSystem,
  dmGranted: { kind?: ElementKind; name: string; grantedBy?: string | null; mechanics?: string | null }[] = [],
): ProvenanceSummary {
  const grantedByName = new Map(dmGranted.map((g) => [norm(g.name), g]));
  const extracted = extractCharacterElements(char).map((e) => {
    const g = grantedByName.get(norm(e.name));
    return tagElement(system, e.kind, e.name, g ? { grantedBy: g.grantedBy ?? 'DM', mechanics: g.mechanics ?? null } : {});
  });
  // Include DM-granted elements that aren't already present on the sheet (e.g. a granted item).
  const present = new Set(extracted.map((e) => norm(e.name)));
  for (const g of dmGranted) {
    if (!present.has(norm(g.name))) extracted.push(tagElement(system, g.kind ?? 'other', g.name, { grantedBy: g.grantedBy ?? 'DM', mechanics: g.mechanics ?? null }));
  }
  return summarizeProvenance(extracted);
}
