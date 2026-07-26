# Slot-driven character building — vanilla by default, custom by explicit choice

**Status:** IN PROGRESS · started 2026-07-26 · owner-directed
**Owner directive (2026-07-26):**

> "If we are building a character level by level, I have noticed on at least some of the character
> editors/builders that at every level we get access to all spells and feats and just about everything. It has
> this mechanic where the user can just click on all of the feats and stuff, and they can click on as many as
> they want. We shouldn't be able to give 10 different feats to a character at level 2, without it being a
> total custom build. The assumption is that the character is generally going to be built with the
> default/vanilla options per level, but we should have an option for them to customize their character however
> they want too. […] only the correct level by level options for each class in each system are available in the
> builder/editor by default, but we will have buttons that the user can click to add other feats or custom
> stuff. […] There should be an option to add a different feat, which will allow us to add any feat in the
> system, or a totally custom feat. This should be per level, and per class, and for each system."

Plus, from the same conversation: *"make sure that all of the preferences are per system"* (done — see
`SETTINGS_PER_SYSTEM_RULES_VARIANTS`, S-6) and *"make sure the dice rollers are all set up correctly for each
system"* (slice 9 below).

## The one idea

**A character sheet is a set of SLOTS, each owned by a level, each holding exactly one choice.** Everything
else follows: what to offer (that slot's legal options), how many (one), when to ask (at its level), and what
"custom" means (a slot filled from outside its legal set, marked as such).

Today three of the four systems model the *content* well and the *slots* barely at all: they show a catalog
and count what you clicked. That is why a level-2 character can hold ten feats.

## Measured baseline — what each system does TODAY

Everything here was verified against the code on 2026-07-26, not inferred from the older docs (two of which
were stale about exactly this area).

### D&D 5e 2024 / 2014 — `Dnd5eManualBuilder` (Foundations) + `LevelBuilder` (walker)

| | state |
|---|---|
| Foundations feat picks | **Capped** at `dnd5eFeatSlotsAtLevel` — `full = !on && feats.length >= featSlots` — and each pick is eligibility-gated (slice 3) and server-gated (slice 22). So 5e is the one system that already refuses an 11th feat. |
| Per-level attribution | **Shipped 2026-07-26 (slice 1 below).** Foundations now writes its picks into `build.choices` as `{level, kind:'asi', featKey}`, so the walker sees them as filled. |
| Walker prompts | **Broken for 8 of 13 2024 classes** (measured): `barbarian/fighter/monk/rogue` prompt **no ASI at any level**; `bard/sorcerer/warlock/wizard` prompt **only level 4** of their four. `cleric/druid/paladin/ranger/pugilist` are complete. **2014 is complete for all 13.** Cause: `planLevelUp` prompts from `choice` ANNOTATIONS on class features, while `asiLevels` is authored separately — the two disagree. Baseline pinned in `builder-choices-ledger.test.ts`. |
| Spells | Foundations doesn't collect them; the sheet's spell panel is free-form. No per-level "you learn 2 cantrips + 3 first-level spells" structure. |

### Pathfinder 2e — `PF2CharacterBuilder` + `pf2-levels`

| | state |
|---|---|
| Feats | `pf2LevelBreakdown(className, level)` **already computes the real feat TRACKS per level** (class/ancestry/skill/general) and the UI displays `"{n} chosen · {owed} owed by level {L}"` — but `onToggle` is an unbounded push. **You can take 30 feats at level 1.** The information needed to slot them exists and is thrown away. |
| Spells | Same shape: `PF2BuildPicks kind="spell"` toggles freely, no per-level slot count. |
| Eligibility | `gatePf2Picks` refuses illegal picks server-side (vanilla only) — so the *legality* of each pick is enforced, the *count and attribution* are not. |

### Intuitive Games — `IGCharacterBuilder` + `IGLevelBuilder`

| | state |
|---|---|
| Stances / powers / feats / weapon types | Flat `Chips` multi-selects over the **entire catalog**, `toggle()` with no cap and no level. The worst case of the three. |
| Eligibility | `igPowerEligibility` supplies a *reason tooltip* per power; `gateIgPicks` refuses illegal ones server-side for vanilla characters. Again: legality yes, count/attribution no. |
| Schedule | `IG_LEVEL_SCHEDULE` (scraped) **does** say what each level grants — the data is there, unused by the Foundations chips. |
| Champion | The one genuine content gap: `Champion` is in the taxonomy but has no `IG_CLASS_DETAILS` entry, so its powers/specializations fall back to free text. **This is pending on Brendan's site, not missing from our scrape** — every other subclass (Freebooter, Marksman, Sohei, Arcanist, Magician, Shaman, Archon, Beastmaster, Eldritch Binder…) has `powers[]` + `specializations[]` verbatim from the site. |

### The pattern

All four systems already know the *legal set* per level (`asiLevels`, `pf2LevelBreakdown`,
`IG_LEVEL_SCHEDULE`) and all four already refuse *illegal* picks server-side. **What is missing everywhere is
the slot: a bounded, level-owned container that holds one choice.** So this is mostly a wiring and UI job over
data that exists — not new rules authoring (which matters: Ground Rule 3 means we cannot invent slots either).

## The target shape

One shared vocabulary, per-system providers:

```
SlotSpec   { id, level, kind, label, help, source }      // what is owed, from the system's own schedule
SlotFill   { slotId, choice, provenance }                 // what fills it
provenance = 'vanilla' | 'expanded' | 'homebrew' | 'dm-granted'
```

- **`vanilla`** — chosen from that slot's legal set. The default path, and the only one a vanilla character
  can use (`vanilla = hard block` is this repo's existing rule).
- **`expanded`** — a real, catalogued option from the same system that this slot would not normally offer
  (the cross-class feat the DM allowed). Flagged, never silent.
- **`homebrew`** — authored content (the existing `/build/feat` + `/build/class` + `/build/subclass` designers
  already produce this and already persist + resolve).
- **`dm-granted`** — the DM put it there; marked as such, following `unboundReason: 'dm-grant'`.

Per slot the UI is: the legal options (radio-style, one pick) → then a quiet **`+ Add a different …`** button
that opens the wider set in three tiers: *anything in this system* → *homebrew* → *write your own*. Each tier
above `vanilla` stamps its provenance and shows a mark on the sheet, exactly as `provenance.ts` and
`markIgOffRules` already do for content.

## Slices

Each slice ends green (`tsc --noEmit`, `vitest run __tests__/dnd`, `eslint`) and is committed on its own. UI
slices are driven in the browser before being called done — this repo's standing rule.

- [x] **S1 — 5e: Foundations writes the ledger the walker reads.** `lib/dnd/statgen/builder-choices.ts`
      (`builderChoicesFor` + `mergeBuilderChoices`), wired into `dnd5e-build`. Kills the double-ask, makes a
      feat pick level-attributed, and dissolves the "ASI slot ownership" question. 20 tests. **Shipped
      2026-07-26** (`66c17799`).
- [ ] **S2 — 5e: the ladder drives the prompts, not the annotations.** Make `planLevelUp` derive its ASI
      prompts from `def.asiLevels` (falling back to annotations for anything else), so all 13 classes prompt
      every ladder level. Fixes the measured 8-of-13 gap and makes "a class with a ladder but no prompt"
      unrepresentable. Rewrite the baseline guard's expectations to "every class, every level".
- [ ] **S3 — the shared slot vocabulary.** `lib/dnd/slots/` — `SlotSpec`/`SlotFill`/provenance + a pure
      `fillSlot`/`clearSlot`/`unfilled` core, with the 5e ladder as its first provider. No UI yet; a provider
      and its tests only.
- [ ] **S4 — PF2: slot the feat tracks.** `pf2LevelBreakdown` already returns the tracks; turn each into a
      `SlotSpec` and make `PF2BuildPicks` a one-per-slot picker instead of an unbounded toggle. This is the
      single biggest behavioural win in the plan (30 feats at level 1 → 1 per track per level).
- [ ] **S5 — IG: slot the schedule.** Drive the Foundations chips from `IG_LEVEL_SCHEDULE` per level instead
      of the flat catalog: one stance where the level grants a stance, one power where it grants a power.
- [ ] **S6 — the escape hatch, once, shared.** `+ Add a different …` per slot: system catalog → homebrew →
      write-your-own, stamping `expanded`/`homebrew`/`dm-granted`. Wired into all three pickers from one
      component so the tiers cannot drift apart per system.
- [ ] **S7 — spells get the same treatment.** Per-level known/prepared counts per system (5e's cantrips +
      spells known, PF2's spell slots by tradition), same slot model, same escape hatch.
- [ ] **S8 — the sheet shows provenance.** Anything not `vanilla` carries its mark where the player and the
      DM can see it, and the DM review surface lists it. (`provenance.ts` + the requests board already do most
      of this — this slice is about the slot-filled path reaching them.)
- [ ] **S9 — dice rollers per system.** Owner-flagged. `diceRollerStyle`/`recordMode` are read only by the
      full 5e roller nodes (`DiceTray`/`SigilStack`/`RollBoard`/`ImpactRoller` via `rollerFor`); the bespoke
      sheets mount `rollerStageFor`, whose stages read only the `RollFeed`. So the roller *template* picker
      works everywhere but those two settings do nothing on PF2/IG. Either wire the stages to read them or
      give each system its own roller settings — decide with the owner (Q4 below).
- [ ] **S10 — IG Champion.** Fill `IG_CLASS_DETAILS` for Champion when the owner supplies its
      powers/specializations, and the free-text fallback becomes a real picker. Blocked on Brendan's site.

## Questions for the owner

1. **Does an `expanded` pick cost the character its "vanilla" badge?** My assumption: no — the *character*
   stays vanilla-with-exceptions and only the element is marked, because that is what `markIgOffRules` and
   `dm_granted` already do. The alternative (any expansion flips the whole character to custom) is simpler to
   explain but loses the distinction between "one DM-approved feat" and "a homebrew build".
2. **Should `+ Add a different …` be available to a player without the DM, in a campaign?** Options: always
   (marked), only outside a campaign, or gated behind a DM approval request (the requests board already
   exists). My assumption: always available and marked, with the DM review surface showing it.
3. **5e has no class-specific feat lists** the way PF2 has class feats — 2024 sorts feats into origin /
   general / fighting-style / epic-boon tracks and gates them by prerequisite. Is "only the correct options"
   for 5e = *that slot's track + prerequisites met* (which is what slice 3 already enforces)? Or do you want
   per-class curated shortlists on top?
4. **Dice rollers (S9):** should PF2/IG honour the 5e roller settings (`diceRollerStyle`, `recordMode`), or
   should each system get its own roller preferences? Wiring the shared stages is the cheaper path.
5. **Retrofitting existing characters.** A character already holding 10 feats at level 2 — leave it alone
   (grandfathered, marked custom), or show the DM a "this exceeds its slots" notice? My assumption:
   grandfather and mark, never silently delete a player's content.
