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
  (the cross-class feat the DM allowed). Flagged, never silent — **and it changes the CHARACTER's badge, not
  just the element's** (owner, 2026-07-26; see below).
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
- [x] **S2 — 5e: the ladder drives the prompts, not the annotations. Shipped 2026-07-26.**
      `snapshotAtLevel` now derives an `asi` pending choice from `def.asiLevels` for any level not already
      annotated. All 13 classes in both editions now prompt exactly their authored ladder: Fighter goes from
      **no ASI prompt at any level** to 4/6/8/12/14/16, Wizard from *only 4* to 4/8/12/16, and the five
      already-correct classes are untouched (the annotation still wins, so no double prompt). The measured
      8-of-13 gap is closed, and "a class with a ladder but no prompt" is now unrepresentable — which is the
      part that stops it coming back with the next class someone authors. The whole suite stayed green
      (4818), which is worth noting for a change that ADDS prompts: nothing was relying on the silence.
- [ ] **S3 — the shared slot vocabulary — DEFERRED until a third system needs it.** Reordered after S4
      shipped: 5e and PF2 each turned out to have a working slot model of their own already
      (`asiLevels` + `RecordedChoice`; `pf2LevelBreakdown` + `PF2RecordedChoice`), and both fixes were about
      *feeding* those models rather than replacing them. Extracting a shared `lib/dnd/slots/` before IG (S5)
      shows what it actually needs would be abstraction ahead of evidence — and the two builder-choices
      modules are near-identical twins on purpose, so the shape is already visible when it's time.
- [x] **S4 — PF2: slot the feat tracks. Shipped 2026-07-26.**
      `lib/dnd/systems/pathfinder2e/builder-choices.ts` — `pf2FeatSlots` / `pf2FeatSlotCount` (from the
      tested schedule, so it cannot drift from what the walker prompts), `pf2BuilderChoicesFor` (assigns
      picks earliest-first, carrying the TRACK) and `mergePf2BuilderChoices`. Three effects:
      **(1)** `PF2BuildPicks` now takes a `limit` and blocks further picks once the slots are used, so the
      "7 owed by level 12" caption is finally the cap it always claimed to be — a level-1 character can no
      longer take thirty feats; **(2)** `pf2-build` records the picks in `pf2Build.choices`, so the walker
      stops re-asking for every one; **(3)** each feat is attributed to a (level, track), which is what S6's
      escape hatch and S8's "altered vanilla" badge need to point at.
      An already-selected pick is never blocked, or a full list could never be undone. 17 new tests.
      **Note:** the picker's `limit` is deliberately absent for SPELLS — their per-level known/prepared
      counts are S7, and capping them at the feat number would be worse than not capping them.
- [x] **S5 — IG: slot the schedule. Shipped 2026-07-26.**
      `lib/dnd/systems/intuitive-games/builder-choices.ts` — `igSlots` (player-choice gains only, so granted
      things like improved stances and the manifestation never become prompts), `igFeatBudget`/
      `igPowerBudget`, `igBuilderChoicesFor`, `mergeIgBuilderChoices`. The chips now carry a budget and show
      `(2/4)`, `ig-build` records the picks in `igBuild.choices` so the walker stops re-asking, and a
      **level-2 character's feat budget is 2, not the whole catalog** — the owner's exact example.
      18 new tests.
      **The one unverified number, isolated on purpose.** Powers are exact: the site states *"Subclass —
      choose one at level 1, granting a single class power of your choice"* and the schedule carries the
      rest (the level-6 *unique* power is granted, not chosen, so it is not a slot). Feats are exact from
      level 2 up — one per level — but the schedule starts at 2 and level 1 is described as including
      "starting feats" **without a count**. So the feat budget allows exactly one level-1 feat and errs
      PERMISSIVE: a cap one too generous still bounds the list, while one too tight blocks a legal build.
      → **Q6 below.**
      **Stances and weapon types stay uncapped**, deliberately: a stance comes from the BACKGROUND and level
      5 *improves* stances rather than granting another, so there is no per-level number to enforce and
      inventing one would be worse than none. Pinned by a test.
      Two of my own errors, corrected inline rather than quietly: I first filed the level-1 pick against
      level 2 (which would have made the walker skip a real level-2 prompt), and I first expected the
      unique power to be a choice.
- [ ] **S6 — the escape hatch, once, shared.** `+ Add a different …` per slot: system catalog → homebrew →
      write-your-own, stamping `expanded`/`homebrew`/`dm-granted`. Wired into all three pickers from one
      component so the tiers cannot drift apart per system.
- [ ] **S7 — spells get the same treatment.** Per-level known/prepared counts per system (5e's cantrips +
      spells known, PF2's spell slots by tradition), same slot model, same escape hatch.
- [x] **S8a — "altered vanilla" is a real state. Shipped 2026-07-26.**
      `SheetVariantKind` is now `'vanilla' | 'altered-vanilla' | 'custom'`, with `variantKindLabel` giving
      each a distinct label and the variant badge rendering **"Altered vanilla"** as neither of the other two.
      **The dangerous part was the gates, not the type.** Every one of them asked `kind === 'vanilla'` to
      decide whether the rules bind — and adding a third value silently makes that test FALSE for the new
      kind, so an altered-vanilla character would have stopped being gated at all. That is the exact opposite
      of "make it clear something is not the usual", and it is the standard cost of widening a union.
      So enforcement is now asked as `isRulesEnforcedKind(kind)` — *is this custom?* — at all six deciding
      sites (the three build routes, `FeatPicker`, `SpellPicker`, `PF2ContentPicker`), with a test that fails
      if any of them regresses to the equality check. `unboundReasonFor` centralises the DM-grant /
      custom-character distinction, and altered vanilla is deliberately NOT "unbound": its exceptions are
      named individually rather than blanket-allowed. The seven bespoke-sheet props that hard-coded
      `'vanilla' | 'custom'` now take the shared type, so the new kind cannot be flattened on the way in.
      15 new tests; `variantKind` still fails SAFE (an unknown value reads as vanilla).
- [ ] **S8b — the badge NAMES its exceptions.** "Altered vanilla: Magic Initiate (DM-granted, level 4)" on
      the sheet and in the DM's review — a badge that says something changed without saying what is the same
      problem in a nicer font. Needs the per-slot provenance S6 records, so it follows S6.
- [x] **S11 — take a character into and out of a campaign, clearly. Shipped 2026-07-26.**
      A **Campaigns** panel on the character's own page: which campaigns it is in, **Take out** for each, and
      **Take in** for any campaign the caller belongs to. `lib/dnd/campaign-membership.ts` is the pure
      decision core (`membershipView` / `canLeaveCampaign` / `canJoinCampaign` / `membershipSummary`), read by
      BOTH the new read-only `GET /api/dnd/characters/[id]/campaigns` and the panel, so a button cannot appear
      where the server refuses. 18 tests.
      **The capability was already there; the affordance wasn't.** `DELETE .../characters/[characterId]` has
      always allowed the character's OWNER as well as the DM — but its only caller was `CampaignHub`, the
      DM's roster. And `campaignsForCharacter` was used for permission checks only, so nothing ever *told* a
      player which campaigns their character was in.
      **One real asymmetry had to be closed to make this honest.** `join-character` was hard-restricted to
      `DEMO_CAMPAIGN_ID`, so "take out" worked for any campaign while "take in" worked for exactly one — the
      panel's Join button would have 403'd everywhere else. The security property it was protecting is
      unchanged and now stated directly: **a caller with no role in the target campaign is refused**, so
      nobody can push a character into a stranger's game; you still may only add your OWN character; and the
      demo stays self-joinable because it is open-access by design. The pre-existing gate test was rewritten
      to assert the property rather than its old implementation.
      **Deliberately no new mutation route:** the panel calls the two endpoints that already carry the
      authorization, because a third copy of "may this caller do that" is how they drift.
      **Not yet browser-driven** — this repo's rule is that a UI slice isn't done until it is, so that pass is
      owed (alongside S12, which adds the as-is/variant choice to the same panel).
- [x] **S12 — join as THIS character, or as a variant. Shipped 2026-07-26.**
      The Campaigns panel now offers **Take in** and **Take in as a variant** per campaign. Both pieces
      already existed and nothing joined them up: `fork` (git-like lineage, makes the new slot active) and
      `set-campaign` (writes `ActiveSlotMeta.campaignId`, which drives the Campaign tag and was otherwise
      mostly unused). The variant is named after the campaign so the VERSIONS list reads legibly, and this is
      now the home for "my home-game character is level 9, but this new table starts at 3".
      **Join happens FIRST, deliberately.** The realistic failure is the 20-version cap, and join-then-fork
      leaves the player in the campaign with a clear "the separate variant could not be made" — the thing they
      asked for survives. Fork-first would risk the opposite: a stray variant for a campaign they never
      joined. Pinned by a test that asserts the call ORDER, not just that both calls exist.
      Two plainly-labelled buttons rather than a dropdown, because this is the moment the choice matters and
      it is hard to undo later. **Browser pass still owed** (with S11).
- [ ] **S9 — dice rollers per system.** Owner-flagged. `diceRollerStyle`/`recordMode` are read only by the
      full 5e roller nodes (`DiceTray`/`SigilStack`/`RollBoard`/`ImpactRoller` via `rollerFor`); the bespoke
      sheets mount `rollerStageFor`, whose stages read only the `RollFeed`. So the roller *template* picker
      works everywhere but those two settings do nothing on PF2/IG. Either wire the stages to read them or
      give each system its own roller settings — decide with the owner (Q4 below).
- [ ] **S10 — IG Champion.** Fill `IG_CLASS_DETAILS` for Champion when the owner supplies its
      powers/specializations, and the free-text fallback becomes a real picker. Blocked on Brendan's site.

## Character-level status — ANSWERED by the owner 2026-07-26

> "If a vanilla character takes an outside of class feat or something like that, they become a custom
> character. Or we need a tag that is like 'altered vanilla' or something like that. We need it to be clear
> that something is not the usual."

So the character's own badge moves — a marked element is not enough. Three states, and the middle one is new:

| badge | meaning | how you get it |
|---|---|---|
| **Vanilla** | every slot filled from its legal set | the default path |
| **Altered vanilla** | built to the rules *except* for specific, named exceptions | one or more `expanded` / `dm-granted` picks |
| **Custom** | not claiming to be a rules-legal build | homebrew class/subclass, off-schedule content, a build that exceeds its slots |

"Altered vanilla" is the state the current model cannot express: today `variantKind` is `vanilla | custom`
(`system-variants.ts`), and every gate reads it as a binary. The badge must say **what** was altered, not just
that something was — a sheet that reads "Altered vanilla" and doesn't name the two feats responsible is the
same problem in a nicer font. Slice S8 carries that.

## Questions still open for the owner

1. **Should `+ Add a different …` be available to a player without the DM, in a campaign?** Options: always
   (marked "altered vanilla"), only outside a campaign, or gated behind a DM approval request (the requests
   board already exists). My assumption: always available and marked, with the DM review surface showing it.
3. **5e has no class-specific feat lists** the way PF2 has class feats — 2024 sorts feats into origin /
   general / fighting-style / epic-boon tracks and gates them by prerequisite. Is "only the correct options"
   for 5e = *that slot's track + prerequisites met* (which is what slice 3 already enforces)? Or do you want
   per-class curated shortlists on top?
4. **Dice rollers (S9):** should PF2/IG honour the 5e roller settings (`diceRollerStyle`, `recordMode`), or
   should each system get its own roller preferences? Wiring the shared stages is the cheaper path.
5. **Retrofitting existing characters.** A character already holding 10 feats at level 2 — leave it alone
   (grandfathered, marked custom), or show the DM a "this exceeds its slots" notice? My assumption:
   grandfather and mark, never silently delete a player's content.
6. **How many feats does an IG character start with at level 1?** The site's schedule covers levels 2–10
   (one feat per level) and describes level 1 as including "starting feats" without a number, so S5 allows
   exactly one and errs permissive. If the real answer is zero, or two, it is a one-line change in
   `igFeatBudget` — and it is the only number in the slot work that isn't source-verified.
