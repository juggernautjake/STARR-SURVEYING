// Per-system descriptor for the Codex identity column (CX-2).
//
// WHY THIS FILE EXISTS AT ALL. The identity column shows a fixed, ordered stack of blocks —
// portrait, identity, health, defence, abilities, rest. Every one of those is a place where a
// 5e assumption could be rendered onto a character of another system: "Inspiration" on a
// Pathfinder sheet, "Race" on a 2024 sheet, death saves on a system that has none. The rest of
// this platform spends real effort preventing exactly that (see CX-16/CX-17 in the plan doc),
// and a new surface that hard-codes a 5e-shaped list would quietly become the next bleed.
//
// So the column renders FROM THIS DESCRIPTOR, never from an inline conditional. Adding a system
// means adding an entry here, and the compiler names the fields you have to decide.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE HONEST-OMISSION RULE, which is the important decision in this file.
//
// This `_sheet` engine is 5e-shaped by construction: its `Character` carries death saves, hit
// dice, Inspiration and a six-ability array. Pathfinder 2e and Intuitive Games characters each
// render a BESPOKE sidecar sheet (`PF2Sheet`, `IGSheet`) that holds their real maths, and the
// shared engine renders alongside it.
//
// That gives two possible readings of "make the column system-adaptive", and only one is right:
//
//   ✗ Render PF2's Hero Points and IG's stances in the shared column.
//     This is the tempting one and it is wrong. The 5e-shaped `Character` has nowhere to store
//     them, so the control would write to nothing, or to a field invented for the purpose that
//     the system's OWN sheet does not read. A player would toggle a Hero Point here and find it
//     absent on the PF2 sheet a scroll away. A control that displays but does not compute is the
//     precise failure this project has repeatedly named and refused.
//
//   ✓ SUPPRESS what the system does not have, and point at the sheet that does hold it.
//     A 5e-only block simply does not render for PF2/IG, and the column carries a line saying
//     where that system's own numbers live. Nothing is invented; nothing silently lies.
//
// So `heroPoints`/`stances` are deliberately NOT fields here. Their absence is the decision, and
// this comment is the record of it — otherwise the next person reads the descriptor, sees no
// Hero Points, and "fixes" it by adding a control backed by nothing.
import { SYSTEM_AMBIGUOUS } from '@/lib/dnd/systems'

/** Which identity-column blocks a system supports, and what it calls things. */
export interface CodexDescriptor {
  /** What this system calls a character's people. 2014 says Race; 2024 renamed it to Species;
   *  Pathfinder says Ancestry. Rendering the wrong word is a small error that reads to a player
   *  as the sheet not knowing which book they are using. */
  speciesLabel: string
  /** 5e's Inspiration toggle (2024: "Heroic Inspiration"). Backed by `char.inspiration`. */
  inspiration: boolean
  /** Death saving throws. 5e only — PF2 uses Dying/Wounded, IG has its own damage-save model,
   *  and neither is representable in this engine's `deathSuccess`/`deathFail` pair. */
  deathSaves: boolean
  /** Hit dice spent on a short rest. 5e's recovery model specifically. */
  hitDice: boolean
  /** Passive Perception. 5e derives it (10 + Wis check bonus); PF2 has no passive DC of this
   *  shape, and IG resolves perception actively. */
  passivePerception: boolean
  /** Concentration on a spell. 5e's rule; PF2 uses Sustain, which is an action, not a state. */
  concentration: boolean
  /** Labels for the two recovery buttons, or null where the system's recovery is not a
   *  short/long pair this engine can drive. */
  rests: { short: string; long: string } | null
  /** Set when this system has a bespoke sheet holding numbers this shared engine cannot model.
   *  Rendered as a pointer in the column, so an absent block reads as "it lives over there"
   *  rather than "this sheet forgot". */
  bespokeSheetNote: string | null
}

/** 5e's shape, shared by both editions except for the species wording. */
const DND5E_BASE = {
  inspiration: true,
  deathSaves: true,
  hitDice: true,
  passivePerception: true,
  concentration: true,
  rests: { short: '☾ Short Rest', long: '★ Long Rest' },
  bespokeSheetNote: null,
} as const

/**
 * Systems whose mechanics this engine genuinely models, versus systems it renders alongside.
 *
 * The PF2/IG entries are deliberately SPARSE rather than rich — see the honest-omission rule in
 * this file's header. Their `bespokeSheetNote` is not an apology; it is the accurate statement
 * of where those numbers live.
 */
const DESCRIPTORS: Record<string, CodexDescriptor> = {
  'dnd5e-2014': { ...DND5E_BASE, speciesLabel: 'Race' },
  'dnd5e-2024': { ...DND5E_BASE, speciesLabel: 'Species' },
  pathfinder2e: {
    speciesLabel: 'Ancestry',
    // Every 5e-specific block off. PF2 has Hero Points, a four-step proficiency ladder, a
    // three-action economy and Dying/Wounded — all of them modelled properly by PF2Sheet and
    // none of them representable in this engine's fields.
    inspiration: false,
    deathSaves: false,
    hitDice: false,
    passivePerception: false,
    concentration: false,
    rests: null,
    bespokeSheetNote:
      'Hero Points, the three-action economy, Dying/Wounded and PF2 proficiency live on the Pathfinder sheet on this page — they are not shown here because this column would have to invent them.',
  },
  'intuitive-games': {
    speciesLabel: 'Species',
    inspiration: false,
    deathSaves: false,
    hitDice: false,
    passivePerception: false,
    concentration: false,
    rests: null,
    bespokeSheetNote:
      'Stances, powers and IG’s damage-save model live on the Intuitive Games sheet on this page — they are not shown here because this column would have to invent them.',
  },
}

/**
 * The descriptor for a system, or the conservative fallback for one we have no entry for.
 *
 * The fallback deliberately turns 5e's extras OFF rather than on. A system-ambiguous character,
 * or one of the under-construction systems in `GAME_SYSTEMS`, is not known to have Inspiration
 * or death saves — and showing a control the system may not have is a worse failure than
 * omitting one it does. `speciesLabel` falls back to the neutral 'Species' because the field
 * itself always exists; only its name varies.
 */
export function codexDescriptorFor(system: string | undefined): CodexDescriptor {
  const key = system ?? SYSTEM_AMBIGUOUS
  return (
    DESCRIPTORS[key] ?? {
      speciesLabel: 'Species',
      inspiration: false,
      deathSaves: false,
      hitDice: false,
      passivePerception: false,
      concentration: false,
      rests: null,
      bespokeSheetNote: null,
    }
  )
}

/** The systems with a real entry — used by the coverage test, so a new available system that
 *  nobody wrote a descriptor for is caught rather than silently getting the fallback. */
export function describedSystems(): string[] {
  return Object.keys(DESCRIPTORS)
}
