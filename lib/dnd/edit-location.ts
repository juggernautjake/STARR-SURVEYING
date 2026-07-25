// lib/dnd/edit-location.ts — "what is this change, and where do I look for it?"
//
// The two-phase sheet assistant proposes a change before saving it, and a proposal is only useful if the
// player can check it: the reply has to say WHAT changes and WHERE on the sheet it will show up. The edit
// vocabulary already names its target (an ability, an attack, a feat, a condition…), so the mapping from
// op → sheet tab is deterministic — no model call, no guessing.
//
// Tab labels mirror app/dnd/_sheet/App.tsx's TABS so the text names a place that actually exists. Bespoke
// systems (PF2 / Intuitive Games) render their own sheets, so their ops map to those sheets' panels.
import type { SheetEdit } from './sheet-edits';

/** A sheet tab (or bespoke panel) label, as the user sees it. */
export type SheetLocation = string;

const OVERVIEW = 'Overview';
const ABILITIES = 'Abilities';
const COMBAT = 'Combat';
const ATTACKS = 'Attacks';
const SPELLS = 'Spells';
const FEATURES = 'Features';
const GEAR = 'Gear';

/** Where a single 5e-vocabulary edit shows up on the sheet. */
export function editLocation(edit: SheetEdit): SheetLocation {
  switch (edit.op) {
    case 'set_name':
    case 'set_meta':
    case 'set_level':
      return OVERVIEW;
    case 'set_ability':
    case 'set_save_proficient':
    case 'set_skill':
      return ABILITIES;
    case 'set_combat':
    case 'add_condition':
    case 'remove_condition':
      return COMBAT;
    case 'add_attack':
    case 'update_attack':
    case 'remove_attack':
    case 'rename_attack':
      return ATTACKS;
    case 'add_spell':
    case 'remove_spell':
    case 'rename_spell':
      return SPELLS;
    case 'add_feature':
    case 'remove_feature':
    case 'rename_feature':
    case 'add_feat':
      return FEATURES;
    case 'add_item':
    case 'update_item':
    case 'remove_item':
    case 'rename_item':
    case 'equip_item':
    case 'tag_item':
    case 'define_tag':
    case 'add_currency':
    case 'set_currency':
    case 'remove_currency':
      return GEAR;
    case 'add_resource':
    case 'rename_resource':
      return COMBAT;
    default:
      return OVERVIEW;
  }
}

/** A short human phrase for one edit — "raise Strength to 18", "add the Alert feat". */
export function describeEdit(edit: SheetEdit): string {
  const e = edit as SheetEdit & Record<string, unknown>;
  const op = String((edit as { op?: unknown }).op ?? '');
  const nameOf = (v: unknown) => String(v ?? '').trim() || 'it';
  switch (e.op) {
    case 'set_name': return `rename the character to ${nameOf(e.value)}`;
    case 'set_meta': return `set ${String(e.field)} to ${nameOf(e.value)}`;
    case 'set_level': return `set level to ${String(e.value)}`;
    case 'set_ability': return `set ${String(e.ability).toUpperCase()} to ${String(e.value)}`;
    case 'set_save_proficient': return `${e.value ? 'add' : 'remove'} the ${String(e.ability).toUpperCase()} save proficiency`;
    case 'set_skill': return `set ${nameOf(e.skill)} proficiency to ${nameOf(e.prof)}`;
    case 'set_combat': return `set ${String(e.field)} to ${String(e.value)}`;
    case 'add_attack': return `add the attack ${nameOf(e.name)}`;
    case 'update_attack': return `change the attack ${nameOf(e.name)}`;
    case 'remove_attack': return `remove the attack ${nameOf(e.name)}`;
    case 'rename_attack': return `rename the attack ${nameOf(e.name)} to ${nameOf(e.to)}`;
    case 'add_spell': return `add the spell ${nameOf(e.name)}`;
    case 'remove_spell': return `remove the spell ${nameOf(e.name)}`;
    case 'rename_spell': return `rename the spell ${nameOf(e.name)} to ${nameOf(e.to)}`;
    case 'add_feature': return `add the feature ${nameOf(e.name)}`;
    case 'remove_feature': return `remove the feature ${nameOf(e.name)}`;
    case 'rename_feature': return `rename the feature ${nameOf(e.name)} to ${nameOf(e.to)}`;
    case 'add_feat': return `add the ${nameOf(e.feat)} feat`;
    case 'add_item': return `add ${nameOf(e.name)} to the inventory`;
    case 'update_item': return `change ${nameOf(e.name)}`;
    case 'remove_item': return `remove ${nameOf(e.name)}`;
    case 'rename_item': return `rename ${nameOf(e.name)} to ${nameOf(e.to)}`;
    case 'equip_item': return `${e.value === false ? 'unequip' : 'equip'} ${nameOf(e.name)}`;
    case 'tag_item': return `tag ${nameOf(e.name)} as ${nameOf(e.tag)}`;
    case 'define_tag': return `define the tag ${nameOf(e.name)}`;
    case 'add_condition': return `apply the ${nameOf(e.name)} condition`;
    case 'remove_condition': return `clear the ${nameOf(e.name)} condition`;
    case 'add_currency': return `add the currency ${nameOf(e.name)}`;
    case 'set_currency': return `change the currency ${nameOf(e.currency)}`;
    case 'remove_currency': return `remove the currency ${nameOf(e.currency)}`;
    case 'add_resource': return `add the resource ${nameOf(e.name)}`;
    case 'rename_resource': return `rename the resource ${nameOf(e.name)} to ${nameOf(e.to)}`;
    default: return `apply a ${op.replace(/_/g, ' ')} change`;
  }
}

/** The distinct places a batch of edits will show up, in sheet order. */
export function editLocations(edits: SheetEdit[]): SheetLocation[] {
  const order = [OVERVIEW, ABILITIES, COMBAT, ATTACKS, SPELLS, FEATURES, GEAR];
  const seen = new Set(edits.map(editLocation));
  return order.filter((t) => seen.has(t));
}

/** "see the Attacks tab" / "see the Attacks and Gear tabs" — the where-to-look line of a proposal. */
export function whereToView(locations: SheetLocation[], opts: { bespoke?: boolean } = {}): string {
  if (!locations.length) return '';
  const noun = opts.bespoke ? (locations.length === 1 ? 'panel' : 'panels') : (locations.length === 1 ? 'tab' : 'tabs');
  const list = locations.length === 1
    ? locations[0]
    : `${locations.slice(0, -1).join(', ')} and ${locations[locations.length - 1]}`;
  return `see the ${list} ${noun}`;
}

/** Where a bespoke Pathfinder 2e edit shows up (its own sheet's panels). */
export function pf2EditLocation(op: string): SheetLocation {
  switch (op) {
    case 'apply_damage': case 'heal': case 'set_temp_hp': return 'Health';
    case 'set_dying': case 'set_wounded': return 'Death track';
    default: return 'Combat';
  }
}

/** Where a bespoke Intuitive Games edit shows up (its own sheet's panels). */
export function igEditLocation(op: string): SheetLocation {
  if (op.includes('stance')) return 'Stances';
  if (op.includes('condition')) return 'Conditions';
  if (op.includes('power')) return 'Powers';
  if (op.includes('feat')) return 'Feats';
  return 'Combat';
}

/** The full proposal blurb: what changes, then where to check it. */
export function proposalText(description: string, where: string): string {
  const d = description.trim().replace(/\s+$/, '');
  if (!where) return d;
  return `${d.replace(/\.$/, '')}.\n\nWhere to check it: ${where}.`;
}
