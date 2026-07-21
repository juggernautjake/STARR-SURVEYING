// lib/dnd/library-grant.ts — turning a library entry into sheet edits.
//
// The library shows content; this is how a piece of it gets onto a character. The pure core
// lives here so the route stays thin and the mapping is testable without a database.
//
// SECURITY SHAPE — the important decision. The client sends a REFERENCE ("the 2024 spell
// Fireball"), never a SheetEdit[]. If the API accepted edits directly, the edit vocabulary
// would become a client-controlled write primitive: anyone could POST `set_level: 20` or
// `set_ability` and skip every rule the library represents. Resolving the reference against
// the real catalogs server-side means a caller can only ever grant something that actually
// exists, exactly as it is published.

import type { SheetEdit } from './sheet-edits';
import { findSpellForSystem } from './spells';
import { spellEligibility } from './spells/eligibility';
import { findWeapon2024, findArmor2024, weaponPropertyLine } from './equipment/dnd5e-2024';
import { findWeapon2014, findArmor2014, weaponPropertyLine2014 } from './equipment/dnd5e-2014';

/** Whether this grant is bound by the character's own class-and-level rules, and if so, by what.
 *
 *  Deliberately a REQUIRED argument to `buildGrantEdits` with an explicit opt-out arm rather than
 *  an optional field: an optional one is omitted by accident and fails OPEN, which is exactly the
 *  hole this exists to close. A caller that isn't enforcing has to say so, and say why. */
export interface GrantRules {
  /** Do this character's class-and-level rules BIND the grant? False for a DM grant (legitimate)
   *  and for a custom character (the escape hatch the custom builder exists to provide). */
  enforce: boolean;
  /** Why not, when `enforce` is false. Recorded on the grant so an off-curve spell on a sheet is
   *  never indistinguishable from a normal class pick. */
  unboundReason?: 'dm-grant' | 'custom-character' | 'no-character-context';
  /** The character's real class, level and slot ceiling. Carried even when `enforce` is false —
   *  an unbound grant still needs it to DESCRIBE what it did ("not on the Wizard spell list"),
   *  which is the whole difference between marking a grant and merely permitting it. */
  character?: { className: string; level: number; knownSpells: string[]; maxSpellLevel?: number };
}

/** What kind of library content is being granted. */
export type GrantKind = 'spell' | 'weapon' | 'armor' | 'item' | 'feature' | 'condition';

export interface GrantRequest {
  kind: GrantKind;
  /** Display name of the entry, as shown in the library. */
  name: string;
  /** The game system the entry was read from — grants are system-scoped. */
  system: string;
  /** Per-kind options the chooser collects. */
  options?: {
    /** Spells: arrive prepared. */
    prepared?: boolean;
    /** Items: how many. */
    quantity?: number;
    /** Items: arrive equipped. */
    equipped?: boolean;
    /** Features/conditions: free-text detail the granter typed. */
    note?: string;
  };
}

export interface GrantResult {
  edits: SheetEdit[];
  /** Human-readable summary for the audit row and the UI confirmation. */
  summary: string;
}

export type GrantOutcome = GrantResult | { error: string };

export function isGrantError(o: GrantOutcome): o is { error: string } {
  return (o as { error?: string }).error !== undefined;
}

const KINDS: GrantKind[] = ['spell', 'weapon', 'armor', 'item', 'feature', 'condition'];

/** Resolve a library reference into the sheet edits that deliver it.
 *
 *  Returns an error rather than a best guess when the reference can't be resolved: granting
 *  a spell the catalog doesn't have would otherwise put an empty husk on someone's sheet
 *  that looks real and does nothing (Ground Rule 2 — never invented).
 *
 *  `rules` decides whether the character's own class and level constrain the grant. This route
 *  used to check NOTHING, which made it the simplest way to put Wish on a level-4 vanilla
 *  Wizard — the picker's rules were enforced in the picker, so going around the picker went
 *  around the rules (Area MV). */
/** A weapon reduced to what a GRANT needs, with each edition's own facts intact. */
interface GrantWeapon {
  name: string;
  damage: string | null;
  damageType: string | null;
  properties: string[];
  /** 2024 only. 2014 has no weapon mastery — the field is absent rather than empty, so a 2014
   *  grant cannot accidentally print "Mastery: undefined". */
  mastery?: string;
  propertyLine: string;
}

/** Armor reduced to what a grant needs. The two editions' armour tables are structurally
 *  identical — verified, not assumed — so this is a pass-through rather than a translation. */
interface GrantArmor {
  name: string;
  category: string;
  baseAC: number;
  dexCap: number | null;
  stealthDisadvantage: boolean;
}

/**
 * The equipment tables for a system (Ground Rule 1: a per-system dispatcher, never a widened
 * module). A system with no table returns finders that resolve nothing, which is the honest
 * outcome — the grant still succeeds, as a named item with no invented statistics.
 *
 * Pathfinder 2e and Intuitive Games deliberately get nothing here. Both have their own weapon and
 * armour models with different mechanics entirely (PF2 traits and runes, IG damage reduction), and
 * their own grant paths; handing them a 5e stat block was the bug this dispatcher replaces.
 */
function equipmentFor(system: string | null | undefined): {
  weapon: (name: string) => GrantWeapon | undefined;
  armor: (name: string) => GrantArmor | undefined;
} {
  if (system === 'dnd5e-2024') {
    return {
      weapon: (n) => {
        const w = findWeapon2024(n);
        return w && { name: w.name, damage: w.damage, damageType: w.damageType, properties: w.properties, mastery: w.mastery, propertyLine: weaponPropertyLine(w) };
      },
      armor: (n) => {
        const a = findArmor2024(n);
        return a && { name: a.name, category: a.category, baseAC: a.baseAC, dexCap: a.dexCap, stealthDisadvantage: a.stealthDisadvantage };
      },
    };
  }
  if (system === 'dnd5e-2014') {
    return {
      weapon: (n) => {
        const w = findWeapon2014(n);
        // NOTE the absent `mastery`: 2014 has no mastery property, and `WeaponDef2014` has no such
        // field by design, so the compiler stops a 2024 value being pasted in here.
        return w && { name: w.name, damage: w.damage, damageType: w.damageType, properties: w.properties, propertyLine: weaponPropertyLine2014(w) };
      },
      armor: (n) => {
        const a = findArmor2014(n);
        return a && { name: a.name, category: a.category, baseAC: a.baseAC, dexCap: a.dexCap, stealthDisadvantage: a.stealthDisadvantage };
      },
    };
  }
  return { weapon: () => undefined, armor: () => undefined };
}

export function buildGrantEdits(req: GrantRequest, rules: GrantRules): GrantOutcome {
  const name = (req.name ?? '').trim();
  if (!name) return { error: 'A name is required.' };
  if (!KINDS.includes(req.kind)) return { error: `Unknown grant kind: ${req.kind}` };

  const opts = req.options ?? {};

  switch (req.kind) {
    case 'spell': {
      // Resolved through the system dispatcher, so a 2014 sheet cannot be handed 2024 numbers.
      const def = findSpellForSystem(req.system, name);
      if (!def) {
        return { error: `“${name}” is not in the ${req.system} spell library, so it can't be granted with its real mechanics. Add it by hand on the sheet instead.` };
      }

      // The rules verdict — computed whenever we have a character to judge against, whether or
      // not it BINDS. Enforcing uses it to refuse; not enforcing uses it to mark.
      const ch = rules.character;
      const elig = ch
        ? spellEligibility(def, {
            system: req.system,
            className: ch.className,
            level: ch.level,
            extraSpells: ch.knownSpells,
            ...(ch.maxSpellLevel != null ? { maxSpellLevel: ch.maxSpellLevel } : {}),
          })
        : { ok: true, reason: undefined as string | undefined };

      // Refused outright — the same answer the picker gives, so the two routes cannot disagree
      // about what is legal.
      if (rules.enforce && !elig.ok) {
        return { error: `${def.name} is outside what this character can take: ${elig.reason}. This is a vanilla character — build a custom one, or have the DM grant it.` };
      }

      const offRules = elig.ok
        ? undefined
        : rules.unboundReason === 'dm-grant'
          ? `granted by the DM — ${elig.reason}`
          : elig.reason;
      // `add_spell` is a FLAT op and carries no damage/heal fields. Rather than drop the dice
      // silently — which would hand over a Fireball that rolls nothing — fold them into the
      // description so the numbers survive and the player can see them. The sheet's own editor
      // can promote them to structured damage; the picker inside the sheet still does that
      // directly. (Widening the op is the cleaner long-term fix; it needs the AI tool schema and
      // ai-scope's exhaustiveness guard updated in step, so it is deliberately not done here.)
      const dice = [
        ...(def.damage ?? []).map((d) => `${d.dice} ${d.type}`),
        ...(def.heal ? [`heals ${def.heal}`] : []),
      ].join(' + ');
      return {
        edits: [{
          op: 'add_spell',
          name: def.name,
          level: def.level,
          school: def.school,
          castTime: def.castTime,
          range: def.range,
          components: def.components + (def.material ? ` (${def.material})` : ''),
          duration: def.duration,
          concentration: def.concentration,
          ritual: def.ritual,
          description: dice ? `${def.summary} (${dice})` : def.summary,
          higher: def.higher,
          prepared: !!opts.prepared,
          attack: def.attack,
          save: def.save,
          ...(offRules ? { offRules } : {}),
        } as SheetEdit],
        summary: `Granted the spell ${def.name}${opts.prepared ? ' (prepared)' : ''}${offRules ? ` — off-rules: ${offRules}` : ''}.`,
      };
    }

    case 'weapon':
    case 'armor':
    case 'item': {
      const qty = Math.max(1, Math.floor(opts.quantity ?? 1));
      const kind = req.kind === 'item' ? 'gear' : req.kind;

      // Resolve against the real equipment tables where we can, so a granted Longsword arrives
      // with 1d8 slashing, Versatile and its MASTERY property — not a bare name the player has
      // to look up and type in. 2024 mastery is the part most easily lost (S6).
      //
      // SCOPED BY SYSTEM since 2026-07-21. These two calls ignored `req.system` entirely — which
      // is present and authoritative (the route deliberately takes the character's own system over
      // the client's claim). So a Pathfinder or Intuitive Games "Longsword" arrived carrying 5e
      // stats INCLUDING a Weapon Mastery property, a 2024 invention that exists in neither of
      // those games nor in 5e 2014. The `add_spell` arm seventy lines above already dispatched on
      // system correctly, with a comment explaining why; this arm simply never did.
      const gear = equipmentFor(req.system);
      const weapon = req.kind === 'weapon' ? gear.weapon(name) : undefined;
      const armor = req.kind === 'armor' ? gear.armor(name) : undefined;

      const base = { op: 'add_item' as const, name, kind, qty, equipped: !!opts.equipped };

      if (weapon) {
        return {
          edits: [{
            ...base,
            desc: opts.note || `${weapon.damage ?? '—'} ${weapon.damageType ?? ''}`.trim() + `. ${weapon.propertyLine}.`,
            weapon: {
              damage: { dice: weapon.damage ?? '', type: weapon.damageType ?? '' },
              // Mastery is appended ONLY where the edition has it. 2014 weapons carry no mastery,
              // and a `Mastery: undefined` chip on a 2014 sheet would be an invented rule.
              properties: weapon.mastery ? [...weapon.properties, `Mastery: ${weapon.mastery}`] : [...weapon.properties],
            },
          } as SheetEdit],
          summary: `Granted ${qty}× ${weapon.name} (${weapon.damage ?? 'no damage'} ${weapon.damageType ?? ''}`.trimEnd()
            + `${weapon.mastery ? `, mastery ${weapon.mastery}` : ''})${opts.equipped ? ' — equipped' : ''}.`,
        };
      }

      if (armor) {
        return {
          edits: [{
            ...base,
            desc: opts.note || `${armor.category === 'shield' ? `+${armor.baseAC} AC` : `Base AC ${armor.baseAC}`}${armor.stealthDisadvantage ? ', stealth disadvantage' : ''}.`,
            armor: {
              category: armor.category,
              baseAC: armor.baseAC,
              // The sheet's own AC maths reads modCap; the table's dexCap maps straight onto it.
              modCap: armor.dexCap,
              stealthDisadvantage: armor.stealthDisadvantage,
            },
          } as SheetEdit],
          summary: `Granted ${qty}× ${armor.name} (${armor.category === 'shield' ? `+${armor.baseAC} AC` : `base AC ${armor.baseAC}`})${opts.equipped ? ' — equipped' : ''}.`,
        };
      }

      // Not in the tables — still grantable, just without stats rather than invented ones.
      return {
        edits: [{ ...base, desc: opts.note ?? '' } as SheetEdit],
        summary: `Granted ${qty}× ${name}${opts.equipped ? ' (equipped)' : ''}.`,
      };
    }

    case 'feature': {
      // Feats are modelled as FEATURES on the sheet — there is no `add_feat` op, and inventing
      // one would fork the vocabulary the AI and the manual route already share.
      return {
        edits: [{
          op: 'add_feature',
          name,
          source: 'Library grant',
          body: [opts.note ?? `Granted from the ${req.system} library.`],
        } as SheetEdit],
        summary: `Granted the feature ${name}.`,
      };
    }

    case 'condition':
      return {
        edits: [{ op: 'add_condition', name } as SheetEdit],
        summary: `Applied the condition ${name}.`,
      };
  }
}
