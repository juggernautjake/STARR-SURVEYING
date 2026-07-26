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
- [~] **S6 — the escape hatch. Core + 5e shipped 2026-07-26; PF2/IG wiring is S6b/S6c.**
      `lib/dnd/slots/entitlement.ts` + `app/dnd/_ui/builder/TakeAnyway.tsx`, end to end on the 5e
      Foundations picker (picker → POST → gate → ledger → badge). 38 tests.

      **The plan's own vocabulary was wrong, and fixing it is the substance of this slice.** It proposed
      stamping `expanded`/`homebrew`/`dm-granted` as one union — but `lib/dnd/provenance.ts` already ships
      `'vanilla' | 'custom' | 'dm-granted'`, and folding them together conflates two axes that genuinely
      cross:
      · **content** — is this thing in the book? → `Provenance`, already shipped
      · **entitlement** — was this character allowed it *here*? → the new module
      A cross-class feat taken with the DM's blessing is *vanilla content* the character was *not entitled
      to*; a homebrew feat in a legal slot is the exact opposite. One union cannot say both — and the badge
      the owner asked for is about the second axis, on sheets whose every element may be straight out of the
      book. So `Entitlement` is its own type and `Provenance` is untouched.

      **What stops this undoing S1–S5.** A hatch that just turned the gate off would hand back the
      "ten feats at level 2" build the whole plan exists to prevent. Three properties, each tested:
      **(1)** it is opt-in *per pick* — anything not named still 400s; **(2)** the client sends only NAMES,
      never reasons, so the recorded objection is the gate's own and a crafted POST cannot launder a
      refusal into a flattering explanation; **(3)** it is not offered on a `custom` character, where the
      rules never bound and an "exception" badge would be noise.

      **The badge is derived from the merged ledger, never from the request.** Reading the request would
      make a rebuild that happens to contain no exceptions demote a character whose exception the level
      walker recorded — the badge would come and go depending on which surface saved last. Deriving also
      means removing the off-rules feat returns the character to plain vanilla instead of leaving a scar.

      **Two deliberate limits, so the UI doesn't promise what the server won't keep:**
      · The hatch covers **ineligible** picks only, not the "slots full" block — `gateDnd5eBuildFeats`
        judges eligibility and not the slot count, so a hatch over the count would offer an exception the
        server never records, leaving the pick unbadged. Enforcing the count server-side is its own change
        with its own risk to existing builds.
      · An exception on a feat **beyond the ladder** is recorded at `kind: 'other'` rather than dropped.
        Those feats own no ASI slot, and dropping the exception with them would let a character take an
        off-rules feat and still read "Vanilla" — the one outcome this slice exists to prevent.

      Q1 was never answered, so this ships on the assumption recorded below (**available always, marked,
      DM review surface shows it**) rather than blocking. Reversible: the offer is one function.
- [x] **S6b — the same hatch on PF2. Shipped 2026-07-26.** 19 tests. Reuses the 5e decision core rather than
      growing a second one — three systems drifting into three definitions of "vanilla" is the failure mode
      `rules-gate.ts` exists to prevent, and this is exactly the surface where it would happen.
      **PF2's gate covers SPELLS as well as feats**, so "recorded even though it fills no slot" is the
      ordinary case here rather than an edge: a refused spell never had a feat slot to sit in.
      **`PF2ChoiceKind` gained `'other'`**, which is the risky part and was checked before it was written —
      widening a union is where gates silently change behaviour (the `SheetVariantKind` lesson from S8a).
      It is inert because `pf2PlanLevelUp` looks choices up by (level, kind, track) and never asks for this
      one, and every `choice.kind` switch in the UI runs on OUTSTANDING choices, which the planner emits.
      Both properties are now tested, not just reasoned about: an off-slot exception leaves `outstanding`
      byte-identical, and the planner never emits the kind.
      **The hatch offers what the SEARCH surfaced**, not the whole catalog — with thousands of entries a
      complete "everything you can't have" list would be unusable, and the player is already looking at the
      thing they want.
- [x] **S6c — the same hatch on IG. Shipped 2026-07-26.** 19 tests. **All three systems now share one core**
      — pinned by a test that reads all three routes and all three ledger types, so a fourth system cannot
      quietly grow a fourth definition.
      **Scoped to POWERS**, because that plus the specialization is all `gateIgPicks` refuses.
      `igPowerEligibility` has no feat equivalent (IG feat prerequisites are unstructured prose) and IG's
      feat constraint is the per-level BUDGET, which the gate records nothing about — so a hatch over feats
      would promise an exception `ig-build` never stores. Mounted on the powers block specifically and NOT
      inside `Chips`, which stances and weapon types also use: both are deliberately uncapped, and a hatch
      there would offer escape from a constraint that does not exist.
      **The off-slot path is the COMMON case in IG**, not an edge — IG's level-1 picks have no schedule row
      (the scraped schedule starts at level 2) and are deliberately left unrecorded, so a level-1 exception
      would otherwise vanish and the character would still read "Vanilla".
      **A live bug fell out of this slice.** `powerReason` read `variantKind !== 'vanilla'` to decide whether
      to grey anything. When S8a added the third kind that became true for `altered-vanilla`, so the picker
      greyed NOTHING while `ig-build` went on refusing the same picks with a 400 — the builder and the save
      disagreeing about what is legal, which is exactly what that function's own comment promises cannot
      happen. Now `isRulesEnforcedKind`. **The test suite had pinned the buggy line as if it were the rule**,
      which is how it survived; it now pins the rule and asserts the two bound kinds behave identically.
- [~] **S7 — spells. The COUNT SOURCE shipped 2026-07-26; enforcement is still open.** 23 tests.
      `lib/dnd/spells/counts.ts` — `spellCountsFor` / `preparedCapFor`, the missing counterpart to
      `maxSpellLevelFor` (that answers "how HIGH can they cast?", this answers "how MANY do they get?").
      **The counts were already authored and already unused**, the same shape as the feat defect S1–S5 fixed:
      thirteen class files carry `cantripsKnown`/`spellsKnown`, `snapshotAtLevel` carries them onto every
      snapshot, and exactly one consumer read them — a progression *display* table that prints cantrips and
      never prints `spellsKnown` at all.
      **Four 2024 classes had their table trapped in prose.** Cleric, Druid, Paladin and Ranger carried
      "a fixed count from the X table: 4/5/6/…" in `preparedRule` and no array. Transcribed — and a test
      extracts the digits from each class's OWN sentence and compares, so the prose stays the source and a
      transcription slip cannot pass quietly.
      **Two modelling traps, both hit and corrected:**
      · `prepares: !!preparedRule` is wrong — the 2014 Bard's rule string literally reads *"Spells KNOWN
        (a Bard does not prepare)"*. The real rule is an edition difference (2024 has no known-spells
        casters at all), now stated in one function instead of guessed at each call site.
      · The `spellsKnown` type doc read "Omit for preparers", which was true of 2014 and had already been
        overtaken by the 2024 files it describes. Fixed the doc, not the data.
      **`preparedCap` is now a real number.** It has been rendered on the sheet since the panel was written
      and the only place in the repo that ever SET it was a hand-authored demo character — every real caster
      showed a bare count against nothing. A stored value still wins (DM override, homebrew class). Null for
      a 2014 preparer on purpose: that count is `level + ability modifier`, which class and level cannot
      know, and a wrong cap is worse than none.
      **Found by the orphan-module guard**, which failed the first version of this slice: the count source
      landed with no consumer. Exactly what that guard is for.
- [ ] **S7b — enforce the counts in the pickers.** The remaining half, and a genuine behaviour change:
      `SpellPicker` currently lets a level-1 Bard add all four cantrips and thirty more, and PF2's spell
      picker is deliberately uncapped (`PF2BuildPicks`'s own comment says so, citing S7). Capping starts
      refusing picks players have already made — several demo characters hold more spells than their class
      grants — so it needs the same `TakeAnyway` escape hatch feats got, and a decision about existing
      over-count sheets (Q5's "grandfather and mark" assumption applies here too). PF2 additionally has no
      per-class/per-tradition count at all: `pf2SpellSlots` is one derived full-caster table keyed on level.
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
- [x] **S8b — the badge NAMES its exceptions. Shipped 2026-07-26.** 16 tests. Two surfaces:
      the sheet's **build control** ("Altered vanilla — rules-legal except: Magic Initiate (DM-granted,
      level 4)") and the **VERSIONS card** (two named, then a count — the full list belongs on the sheet,
      not on a 210px card).
      `lib/dnd/slots/sheet-exceptions.ts` is the one module that knows all three ledger keys. S3 deliberately
      left the three slot models unshared; this is the cost of that decision, and one module paying it beats
      every badge and panel paying it — which is exactly how the `=== 'vanilla'` check ended up wrong in four
      separate places. It refuses to read another system's ledger, so a transposed sheet is not badged with
      exceptions belonging to a build it no longer is.
      **A fourth instance of the union-widening bug, found and fixed here.** `VariantToggle` derived
      `isCustom = variantKind === 'custom'` and treated everything else as vanilla — so an altered-vanilla
      sheet displayed **"Vanilla — rules-legal only"**, a flat denial of the fact, on the one control whose
      whole job is to say which build this is. (Running tally of this trap: the gates in S8a, IG's
      `powerReason` in S6c, this, and the `/variant` route below.)
      **The kind can no longer be hand-set into a lie.** `POST /variant` asking for plain `vanilla` on a
      sheet that still holds exceptions now resolves to `altered-vanilla` and says why. The badge is derived
      from the ledger everywhere else; this endpoint was the one place a human could have stamped a label
      the sheet disproves. Going `custom` is untouched — that is a real choice, not a claim data can refute.
      **Not done here:** the DM review surface (`SheetApprovalPanel`) still works purely on the orthogonal
      *content* axis (`summarizeCharacterProvenance`) and shows nothing for a book-legal feat taken out of
      slot. Adding entitlement to it is a genuine follow-up, listed below.
- [x] **S8c — the DM's review names exceptions too. Shipped 2026-07-26.** 10 tests.
      The gap was invisible by construction: `SheetApprovalPanel` lists content by PROVENANCE, and a
      cross-class feat taken through the hatch IS in the book — so it classified as plain `vanilla`, was
      counted in the "N vanilla" figure, and appeared nowhere in the itemised list. The one surface whose
      job is "show the DM what to look at" showed nothing about the exact thing S6 exists to record.
      Rendered as its own section with its own words (`OUT OF SLOT` / `DM-GRANTED`), **not** merged into the
      content list: these picks may be entirely book-legal, so a `CUSTOM` badge would be a false claim about
      them, and "did they take something they shouldn't have?" is a different question from "is any of this
      homebrew?". Each names the rules' own objection, not just the pick.
      **Deliberately NOT a submission blocker.** Whether a vanilla-only campaign should REFUSE a submission
      over an out-of-slot pick is a policy call for the campaign owner, and quietly making it one would
      start failing submissions that succeed today. Surfaced to the DM, who can already request changes.
      → **Q7 below.**
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
      it is hard to undo later.
- [x] **S13 — render the panel in a test, and it found a bug. Shipped 2026-07-26.**
      S11/S12's other coverage asserts the panel *calls* the right endpoints — the same kind of proof that has
      already failed twice here (the 5e build gate passed 9 source-anchored tests while refusing every legal
      build; a green 15k-test suite missed three rendering-condition bugs in one browser pass). So the markup
      was split out as `CampaignsPanel` — the fetching container returns `null` until its request resolves,
      which under this repo's node test environment renders *nothing*, making every assertion about it
      necessarily a grep — and `campaign-membership-panel.test.tsx` (16) renders the real states.
      **It immediately found one:** the "Add to a campaign" section was gated on `joinable.length`, but its
      rows are permission-filtered — so a viewer who may join none of them got a heading with nothing under
      it. Now gated on the filtered list, computed once so the heading and the rows cannot disagree.
      **This does not close the browser pass**, which is still owed for S11/S12: no effects run here, no CSS
      is applied, and nothing proves the panel sits sensibly on the page.
- [x] **S14 — the browser pass, run 2026-07-26.** Driven against a real dev server on a **free** port (3456 —
      the 3000–3009 zombie sockets are a known trap) with a locally-minted `dnd_session` cookie for a REAL
      fixture found in the live DB: user `…a7` owns **Jack** (`…c6`) *and* is a player in **Neon Odyssey**
      (`…c1`), which Jack is already on the roster of. No test data was created, and nothing was mutated.

      | check | result |
      |---|---|
      | `GET /characters/[id]/campaigns` authed | `{"member":[{"name":"Neon Odyssey","role":"player"}],"joinable":[],"isOwner":true}` — correct against live data |
      | …anonymous | **401** |
      | Campaigns panel on the sheet | renders: *"CAMPAIGNS · In Neon Odyssey. · Neon Odyssey · Take out"*, one button |
      | Console | **0 errors, 0 warnings** across every page visited |
      | 390px phone width | panel 375px, **no horizontal overflow**, the button visible and inside the viewport |
      | All three homebrew designers | *Draft with AI* + *Write it myself* both present; the form appears on click (8 / 5 / 14 fields for feat / subclass / class); the engine's refusal shows; **Save is disabled on a blank draft** — the class guard found in the previous slice, confirmed live |

      **Deliberately NOT clicked:** *Take out* (would remove a real character from a real campaign) and *Save
      to my character* (would write homebrew onto a real sheet). Render-and-read only, per the standing rule
      about mutating live data during an audit.
      **Not covered:** the *joinable* path and both S12 buttons, because the fixture has exactly one campaign
      and the character is already in it — exercising them needs a second campaign, which would mean creating
      live data. The render test covers those states; a live click still isn't proven.
      **A methodology note worth keeping:** three of my first assertions failed on `formAppeared` and the AI
      button, and the pages were fine — those labels are `text-transform: uppercase`, and `innerText` returns
      the *transformed* text, so `"Rules text"` never matches `"RULES TEXT"`. Case-insensitive matching is the
      fix; believing the first red result would have been a fabricated bug report.
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
   **S6 shipped on that assumption** rather than blocking on it — the alternatives are all narrowings of the
   same mechanism, and every one of them is a change to `unlockOffer`'s single return. Gating behind the
   requests board would additionally need an approval round-trip, which is a slice, not a config flip.
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
7. **Should a vanilla-only campaign REFUSE a submission that holds out-of-slot picks?** S8c shows them to
   the DM but does not block, because blocking would start failing submissions that succeed today and the
   policy is the campaign owner's to set. Three plausible answers: never block (today), block unless every
   exception is `dm-granted`, or block on any. The change is one predicate feeding `hasBlockingCustom`.
