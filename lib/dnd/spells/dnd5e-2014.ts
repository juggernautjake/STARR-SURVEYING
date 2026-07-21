// lib/dnd/spells/dnd5e-2014.ts — the D&D 5e 2014-edition spell catalog as structured data.
//
// This is the SIBLING of dnd5e-2024.ts, not a variant of it. The two editions are DIFFERENT
// SYSTEMS and the repo's Ground Rule 1 forbids merging them: a 2014 character sheet served
// 2024 spell numbers is quietly, invisibly wrong, and that class of bug is exactly what the
// per-system dispatcher in ./index.ts exists to prevent. Nothing here was copied from the 2024
// catalog — every record was derived from the 2014 sources listed below and carries 2014's own
// numbers even where they disagree with 2024's.
//
// LICENSING BASIS — SRD 5.1, released by Wizards of the Coast under CC-BY-4.0. Every spell in
// this file is an SRD 5.1 spell; the SRD's structured data (level, school, casting time, range,
// components, duration, class lists, dice, save abilities) is reproduced faithfully, and the
// effect text is PARAPHRASED in our own words rather than transcribed. Game mechanics are not
// copyrightable; a publisher's expression of them is, and we do not reproduce that expression.
// Numbers were cross-checked against Wizards' own free Basic Rules PDF for the 2014 printing.
// Deliberately NOT used: D&D Beyond, Roll20, or 5e.tools — licensed or contested redistribution.
//
// GROUND RULE 2 — NEVER INVENTED. Every field here traces to SRD 5.1. Where a spell's detail was
// uncertain, the FIELD IS OMITTED rather than guessed, and where a spell's SRD membership was
// uncertain, the SPELL IS ABSENT. This catalog feeds a builder that computes from it, so a wrong
// record is worse than a missing one. `SPELLS_2014_STATUS` states the coverage honestly: the SRD
// is a subset of the 2014 Player's Handbook, so absence here means "not in the SRD / not yet
// catalogued", never "this spell does not exist".
//
// `editionNote` marks spells whose 2014 form differs meaningfully from their 2024 rewrite —
// Chill Touch's 120-foot range, True Strike being a Divination cantrip rather than a weapon
// attack, Acid Splash's two-target shape, and so on. Those are precisely the differences a
// 2024 assumption carries silently into a 2014 sheet.

import type { SpellDef, SpellCatalogLevel } from './dnd5e-2024';

/** SRD 5.1, published by Wizards of the Coast under CC-BY-4.0. */
const SRD = 'SRD 5.1';

// ── Cantrips ────────────────────────────────────────────────────────────────
const CANTRIPS_2014: SpellDef[] = [
  { key: 'acid-splash', name: 'Acid Splash', level: 0, school: 'Conjuration', castTime: '1 action', range: '60 feet', components: 'V, S', duration: 'Instantaneous', classes: ['Sorcerer', 'Wizard'],
    summary: 'Target one creature, or two creatures that are within 5 feet of each other. Each makes a Dexterity save or takes 1d6 acid damage.', higher: 'Damage rises to 2d6 at 5th level, 3d6 at 11th, and 4d6 at 17th.',
    editionNote: '2014 is Conjuration and hits one or two adjacent creatures; 2024 is Evocation and covers a 5-foot-radius sphere.', save: { ability: 'dex', effect: 'no damage' }, damage: [{ dice: '1d6', type: 'acid' }], source: SRD },
  { key: 'chill-touch', name: 'Chill Touch', level: 0, school: 'Necromancy', castTime: '1 action', range: '120 feet', components: 'V, S', duration: '1 round', classes: ['Sorcerer', 'Warlock', 'Wizard'],
    summary: 'Ranged spell attack; on a hit, 1d8 necrotic damage and the target cannot regain hit points until your next turn starts. An undead target also has disadvantage on attacks against you until the end of your next turn.', higher: 'Damage rises to 2d8 at 5th level, 3d8 at 11th, and 4d8 at 17th.',
    editionNote: '2014 is a RANGED attack at 120 feet dealing 1d8; 2024 made it a melee spell attack dealing 1d10.', attack: true, damage: [{ dice: '1d8', type: 'necrotic' }], source: SRD },
  { key: 'dancing-lights', name: 'Dancing Lights', level: 0, school: 'Evocation', castTime: '1 action', range: '120 feet', components: 'V, S, M', material: 'a bit of phosphorus or wychwood, or a glowworm', duration: 'Up to 1 minute', concentration: true, classes: ['Bard', 'Sorcerer', 'Wizard'],
    summary: 'Create up to four hovering lights, or combine them into one Medium humanoid shape. Each sheds dim light in a 10-foot radius, and you can move them up to 60 feet as a bonus action.',
    editionNote: '2014 is Evocation and is not on the Druid list; 2024 lists it as Illusion and adds Druid.', source: SRD },
  { key: 'druidcraft', name: 'Druidcraft', level: 0, school: 'Transmutation', castTime: '1 action', range: '30 feet', components: 'V, S', duration: 'Instantaneous', classes: ['Druid'],
    summary: 'One minor nature effect: forecast the next 24 hours of weather, bloom a flower or seed pod, produce a harmless sensory effect in a 5-foot cube, or light or snuff a candle, torch, or small campfire.', source: SRD },
  { key: 'eldritch-blast', name: 'Eldritch Blast', level: 0, school: 'Evocation', castTime: '1 action', range: '120 feet', components: 'V, S', duration: 'Instantaneous', classes: ['Warlock'],
    summary: 'Ranged spell attack for 1d10 force damage.', higher: 'Two beams at 5th level, three at 11th, and four at 17th; roll each attack separately and you may split them between targets.', attack: true, damage: [{ dice: '1d10', type: 'force' }], source: SRD },
  { key: 'fire-bolt', name: 'Fire Bolt', level: 0, school: 'Evocation', castTime: '1 action', range: '120 feet', components: 'V, S', duration: 'Instantaneous', classes: ['Sorcerer', 'Wizard'],
    summary: 'Ranged spell attack for 1d10 fire damage. An unattended flammable object it hits catches fire.', higher: 'Damage rises to 2d10 at 5th level, 3d10 at 11th, and 4d10 at 17th.', attack: true, damage: [{ dice: '1d10', type: 'fire' }], source: SRD },
  { key: 'guidance', name: 'Guidance', level: 0, school: 'Divination', castTime: '1 action', range: 'Touch', components: 'V, S', duration: 'Up to 1 minute', concentration: true, classes: ['Cleric', 'Druid'],
    summary: 'A willing creature you touch may, once before the spell ends, add 1d4 to one ability check of its choice, rolling the die before or after the check. The spell then ends.', source: SRD },
  { key: 'light', name: 'Light', level: 0, school: 'Evocation', castTime: '1 action', range: 'Touch', components: 'V, M', material: 'a firefly or phosphorescent moss', duration: '1 hour', classes: ['Bard', 'Cleric', 'Sorcerer', 'Wizard'],
    summary: 'An object no larger than 10 feet in any dimension sheds bright light in a 20-foot radius and dim light 20 feet beyond. Covering it opaquely blocks the light. A hostile creature holding or wearing the object can make a Dexterity save to avoid the spell.', save: { ability: 'dex', effect: 'the spell fails against that creature' }, source: SRD },
  { key: 'mage-hand', name: 'Mage Hand', level: 0, school: 'Conjuration', castTime: '1 action', range: '30 feet', components: 'V, S', duration: '1 minute', classes: ['Bard', 'Sorcerer', 'Warlock', 'Wizard'],
    summary: 'A spectral hand you control with your action can manipulate objects, open unlocked doors and containers, and move up to 30 feet per use. It cannot attack, use magic items, or carry over 10 pounds.', source: SRD },
  { key: 'mending', name: 'Mending', level: 0, school: 'Transmutation', castTime: '1 minute', range: 'Touch', components: 'V, S, M', material: 'two lodestones', duration: 'Instantaneous', classes: ['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Wizard'],
    summary: 'Repair one break or tear no longer than 1 foot in any dimension. It can mend a magic item physically but cannot restore lost magic.', source: SRD },
  { key: 'message', name: 'Message', level: 0, school: 'Transmutation', castTime: '1 action', range: '120 feet', components: 'V, S, M', material: 'a short piece of copper wire', duration: '1 round', classes: ['Bard', 'Sorcerer', 'Wizard'],
    summary: 'Whisper to one creature in range; only it hears, and it can whisper back. The message bends around corners but is stopped by magical silence, 1 foot of stone, 1 inch of common metal, thin lead, or 3 feet of wood.', source: SRD },
  { key: 'minor-illusion', name: 'Minor Illusion', level: 0, school: 'Illusion', castTime: '1 action', range: '30 feet', components: 'S, M', material: 'a bit of fleece', duration: '1 minute', classes: ['Bard', 'Sorcerer', 'Warlock', 'Wizard'],
    summary: 'Create either a sound (whisper to scream) or the image of an object no larger than a 5-foot cube — not both. The image makes no sound, light, or smell. An Investigation check against your spell save DC reveals it.', source: SRD },
  { key: 'poison-spray', name: 'Poison Spray', level: 0, school: 'Conjuration', castTime: '1 action', range: '10 feet', components: 'V, S', duration: 'Instantaneous', classes: ['Druid', 'Sorcerer', 'Warlock', 'Wizard'],
    summary: 'One creature you can see makes a Constitution save or takes 1d12 poison damage.', higher: 'Damage rises to 2d12 at 5th level, 3d12 at 11th, and 4d12 at 17th.',
    editionNote: '2014 has a 10-foot range and is Conjuration; 2024 extends it to 30 feet and reclassifies it as Necromancy.', save: { ability: 'con', effect: 'no damage' }, damage: [{ dice: '1d12', type: 'poison' }], source: SRD },
  { key: 'prestidigitation', name: 'Prestidigitation', level: 0, school: 'Transmutation', castTime: '1 action', range: '10 feet', components: 'V, S', duration: 'Up to 1 hour', classes: ['Bard', 'Sorcerer', 'Warlock', 'Wizard'],
    summary: 'One minor trick: a harmless sensory effect; light or snuff a small flame; clean or soil up to 1 cubic foot; chill, warm, or flavor 1 cubic foot of nonliving material for 1 hour; make a mark or symbol for 1 hour; or create a hand-sized trinket or illusory image. Up to three non-instantaneous effects can run at once.', source: SRD },
  { key: 'produce-flame', name: 'Produce Flame', level: 0, school: 'Conjuration', castTime: '1 action', range: 'Self', components: 'V, S', duration: '10 minutes', classes: ['Druid'],
    summary: 'A harmless flame in your hand sheds bright light in a 10-foot radius and dim light 10 feet beyond. You can hurl it at a creature within 30 feet as a ranged spell attack for 1d8 fire damage, which ends the spell.', higher: 'Damage rises to 2d8 at 5th level, 3d8 at 11th, and 4d8 at 17th.', attack: true, damage: [{ dice: '1d8', type: 'fire' }], source: SRD },
  { key: 'ray-of-frost', name: 'Ray of Frost', level: 0, school: 'Evocation', castTime: '1 action', range: '60 feet', components: 'V, S', duration: 'Instantaneous', classes: ['Sorcerer', 'Wizard'],
    summary: 'Ranged spell attack for 1d8 cold damage; the target\'s speed drops by 10 feet until your next turn starts.', higher: 'Damage rises to 2d8 at 5th level, 3d8 at 11th, and 4d8 at 17th.', attack: true, damage: [{ dice: '1d8', type: 'cold' }], source: SRD },
  { key: 'resistance', name: 'Resistance', level: 0, school: 'Abjuration', castTime: '1 action', range: 'Touch', components: 'V, S, M', material: 'a miniature cloak', duration: 'Up to 1 minute', concentration: true, classes: ['Cleric', 'Druid'],
    summary: 'A willing creature you touch may, once before the spell ends, add 1d4 to one saving throw of its choice, rolling the die before or after the save. The spell then ends.',
    editionNote: '2014 requires a material component (a miniature cloak); the 2024 version drops it.', source: SRD },
  { key: 'sacred-flame', name: 'Sacred Flame', level: 0, school: 'Evocation', castTime: '1 action', range: '60 feet', components: 'V, S', duration: 'Instantaneous', classes: ['Cleric'],
    summary: 'One creature you can see makes a Dexterity save or takes 1d8 radiant damage. Cover gives it no benefit on the save.', higher: 'Damage rises to 2d8 at 5th level, 3d8 at 11th, and 4d8 at 17th.', save: { ability: 'dex', effect: 'no damage' }, damage: [{ dice: '1d8', type: 'radiant' }], source: SRD },
  { key: 'shillelagh', name: 'Shillelagh', level: 0, school: 'Transmutation', castTime: '1 bonus action', range: 'Touch', components: 'V, S, M', material: 'mistletoe, a shamrock leaf, and a club or quarterstaff', duration: '1 minute', classes: ['Druid'],
    summary: 'For 1 minute, a club or quarterstaff you hold uses your spellcasting ability instead of Strength for melee attack and damage rolls, its damage die becomes a d8, and it counts as magical.',
    editionNote: '2014 only changes the weapon\'s die to a d8 and keeps its own damage type, with no level scaling; 2024 makes it deal force damage and scale at 5th, 11th, and 17th level.', source: SRD },
  { key: 'shocking-grasp', name: 'Shocking Grasp', level: 0, school: 'Evocation', castTime: '1 action', range: 'Touch', components: 'V, S', duration: 'Instantaneous', classes: ['Sorcerer', 'Wizard'],
    summary: 'Melee spell attack for 1d8 lightning damage; the target cannot take reactions until its next turn starts. You have advantage on the attack if it wears metal armor.', higher: 'Damage rises to 2d8 at 5th level, 3d8 at 11th, and 4d8 at 17th.', attack: true, damage: [{ dice: '1d8', type: 'lightning' }], source: SRD },
  { key: 'spare-the-dying', name: 'Spare the Dying', level: 0, school: 'Necromancy', castTime: '1 action', range: 'Touch', components: 'V, S', duration: 'Instantaneous', classes: ['Cleric'],
    summary: 'A living creature at 0 hit points that you touch becomes stable. No effect on undead or constructs.',
    editionNote: '2014 is an action at touch range and is Cleric-only; 2024 makes it a bonus action with a 15-foot range and adds it to the Druid list.', source: SRD },
  { key: 'thaumaturgy', name: 'Thaumaturgy', level: 0, school: 'Transmutation', castTime: '1 action', range: '30 feet', components: 'V', duration: 'Up to 1 minute', classes: ['Cleric'],
    summary: 'One sign of supernatural power: treble your voice for 1 minute, make flames flicker or change color, cause harmless tremors, produce an instantaneous sound, fling a door or window open or shut, or alter your eyes. Up to three effects can run at once.', source: SRD },
  { key: 'true-strike', name: 'True Strike', level: 0, school: 'Divination', castTime: '1 action', range: '30 feet', components: 'S', duration: 'Up to 1 round', concentration: true, classes: ['Bard', 'Sorcerer', 'Warlock', 'Wizard'],
    summary: 'Point at a target to glimpse its defenses. On your next turn you have advantage on your first attack roll against it, provided the spell has not ended.',
    editionNote: 'Completely different spells across editions. 2014 is a Divination that spends your action to gain advantage on ONE attack next turn (concentration, 1 round). 2024 rebuilt it as an attack cantrip: you attack with a weapon using your spellcasting ability, dealing radiant damage in place of the weapon\'s normal type, scaling at 5th, 11th, and 17th level.', source: SRD },
  { key: 'vicious-mockery', name: 'Vicious Mockery', level: 0, school: 'Enchantment', castTime: '1 action', range: '60 feet', components: 'V', duration: 'Instantaneous', classes: ['Bard'],
    summary: 'A creature that can hear you (understanding is not required) makes a Wisdom save or takes 1d4 psychic damage and has disadvantage on its next attack roll before the end of its next turn.', higher: 'Damage rises to 2d4 at 5th level, 3d4 at 11th, and 4d4 at 17th.',
    editionNote: '2014 deals d4s; 2024 upgraded the die to d6.', save: { ability: 'wis', effect: 'no damage' }, damage: [{ dice: '1d4', type: 'psychic' }], source: SRD },
];
