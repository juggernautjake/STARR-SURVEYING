# Intuitive Games: vanilla characters obey the rules too

**Status:** ✅ COMPLETE · 2026-07-20 (S1–S4 shipped; PF2 + builder-UI filtering deferred with reasons)
**Goal:** extend the vanilla/custom enforcement just shipped for D&D 2024
(`completed/VANILLA_RULES_ENFORCEMENT_2026-07-20.md`) to the Intuitive Games system — but only as
far as IG's content model can HONESTLY support, and no further.

## Why this is a separate doc

The 5e work closed four routes. Surveying the other two bespoke systems afterwards found:

| System | Rule data | Gate | Verdict |
|---|---|---|---|
| **IG** | class → powers is structured (`content.ts` `IG_CLASS_DETAILS`) | none | **buildable** |
| **PF2** | no feat catalog, and `PF2_EDIT_OPS` has no content-adding op at all | none | **nothing to close** |

PF2 is deliberately out of scope: it isn't an unguarded door, it's a wall. `edit.ts` exposes only
damage/heal/condition/attribute ops — the AI literally cannot add a feat or spell to a PF2
character. Building a gate there means first authoring a `PF2_FEATS` catalog with levels and
tracks. That is content work, not enforcement work, and inventing it would break Ground Rule 3.

**Also worth recording:** IG/PF2 AI edits return from their own dispatch branches
(`ai-edit/route.ts` :192 and :208) *before* the shared mechanics path where `gateEdits` runs
(:279). Even if they didn't, `findSpellForSystem` and `resolveFeat` are 2024-only, so the existing
gate would no-op on them. The gate is structurally 5e-only; this doc adds IG's own.

## What IG can and cannot enforce — established from the content, not assumed

**CAN:**
- **Powers are class-scoped.** `IG_CLASS_DETAILS[].powers` is a real per-subclass list.
- **Specializations start at level 4.** `IG_PROGRESSION_NOTE` states it outright ("Specializations
  begin at Level 4, greater specializations at Level 8").

**CANNOT — and gating these anyway would make the builder wrong in the worse direction:**
- **Stances are NOT class-locked.** `IG_LEVEL_1` lists a trait option as "an ancestry option, 2
  Ability Score Boosts, a skill proficiency, two weapon-group proficiencies, **or a new stance**".
  A character legitimately holds stances beyond their `grantedStance`. Gating them would refuse a
  choice the rules grant. **Explicitly out of scope.**
- **Feat prerequisites are prose.** `feats.ts` carries `prerequisites: string | null` as free
  English ("Training in Spellcraft and having learned a single spell that has an Advanced spell
  ability"). Unparseable without inventing structure.
- **Per-level power schedule.** The site summarises it ("unique powers arrive at Level 6") without
  publishing a per-level table. No table, no gate.

## Ground rules (inherited, plus one)

1. Vanilla = hard block. Custom = allowed + flagged. DM = never blocked, always marked.
2. Legitimate exceptions are rules, not loopholes — model them or the gate refuses legal play.
   **IG's version of this is the Freebooter's `Dabbler` specialization, which literally reads
   "gain subclass powers from other classes".** A Dabbler with off-list powers is playing
   correctly. This is the direct analogue of a 5e subclass expanded list.
3. **NEW: fail OPEN where the data is absent, not closed.** The 5e core fails closed on a missing
   class because a 5e class list is complete — absence means bad input. IG is the opposite: the
   parent classes (Fighter, Conduit) genuinely carry no `powers` list, because the site documents
   the specifics on the subclasses. Failing closed there would block every power for a character
   who has simply not picked a subclass yet. Absence of data must mean "cannot judge", never
   "refuse".

---

## Slices

### S1 — IG eligibility core ✅ SHIPPED 2026-07-20
`lib/dnd/systems/intuitive-games/eligibility.ts` + 17 tests. `igPowerEligibility` and
`igSpecializationEligibility`, both pure.
- **Fails OPEN**, unlike its 5e sibling, and this is the load-bearing decision. Fighter and
  Conduit genuinely carry no `powers` list; failing closed would block every power for anyone who
  hasn't picked a subclass. Tested directly against the real `IG_CLASS_DETAILS` entry.
- **Dabbler is modelled as a rule.** It widens the legal set to every class's powers — but does
  not remove the check, so a Dabbler still can't hold something that is not a class power at all.
- **Parent-class starting powers are inherited** (an Arcanist keeps Elemental Blast).
- Specializations match on the leading NAME, since they are stored with a prose gloss
  ("Sniper (double weapon range, bonus damage)").
- Two tests assert that `igStanceEligibility` and `igFeatEligibility` do **not** exist, so the
  omissions read as decisions — anyone adding one has to delete a test that explains why not.

### S1 — IG eligibility core (original plan)
`lib/dnd/systems/intuitive-games/eligibility.ts`, pure + tested:
- `igPowerEligibility(power, ctx) → { ok, reason }` — on the class/subclass list, the parent
  class's list, or the class's `startingPower`. Dabbler widens it to every class's powers.
- `igSpecializationEligibility(spec, ctx)` — must be on the class's list AND level ≥ 4.
- Both fail open when the class is unknown or carries no list.
- Specializations are stored with prose annotations ("Dabbler (gain subclass powers from other
  classes)") — match on the leading name, not the whole string.

### S2 — Gate the IG edit paths ✅ SHIPPED 2026-07-20
`lib/dnd/systems/intuitive-games/rules-gate.ts`. `gateIgEdit` called in **both** `ai-edit`
(before `applyIgEdit`) and the manual `ig-edit` route — gating only the AI would have made "use
the manual control instead" a way around the rules, which is the same shape of hole as gating
only the picker was on the 5e side. 19 tests.
- **Only content-ADDING ops are gated.** Damage, healing, conditions and stance changes pass
  untouched: they are play, not character construction, and refusing them would break the sheet
  mid-combat — a far worse failure than an off-list power. Each is pinned by a test.
- Two older tests were updated (`ig-ai.test.ts`, `ig-edit.test.ts`) — they pinned the exact
  pre-gate call shape.

### S4 — The builder path ✅ SHIPPED 2026-07-20
`gateIgPicks` in the `ig-build` route. 7 tests.
- **The existing submission gate does NOT cover this**, which is why the slice is warranted. The
  build route's own header says custom picks are flagged and enforcement happens at submission —
  true, but that gate uses `igIsVanilla`, which is *name-in-catalog only*. A Druid power on an
  Arcanist is genuine book content, so it classifies as vanilla and passes submission untouched.
  "Is this from the book" and "may this character have it" are different questions. Both checks
  are needed; neither substitutes for the other. A test pins the distinction.
- **`knownPowers` is deliberately NOT seeded from `picks.powers`** — every power in a build is
  under review, so treating them as already-held would make every build vacuously legal.

### S3 — Mark and surface on the IG sheet ✅ SHIPPED 2026-07-20
Initially recorded as blocked on "a model decision worth making deliberately". On re-reading, that
was over-deferred: of the two options one is clearly lower-risk, which makes it an implementation
call rather than a product one.

`IGCharacter.offRules?: Record<string, string>` — a map beside the list, **not** a widening of
`powers` to `{ name, offRules? }[]`. The map is purely ADDITIVE: every IG character already in the
database stays valid and no migration is needed, where the array change would touch the builder,
the sheet, the digest and provenance in one go. The cost is that the marker lives beside the
element rather than on it; for an optional annotation that is the right trade.

`markIgOffRules` is pure and immutable like every other IG edit, and is called by all three
routes, so the marker is stored rather than living only in a chat reply that vanishes on reload.
`OffRulesMark` (the same ⚑ as 5e) renders it on the IG sheet. 8 tests.
- **An empty reason CLEARS the entry** rather than storing a blank. A level-up can make
  previously-off-rules content legal, and a blank string would linger as a truthy-but-meaningless
  flag rendering an unexplained ⚑.
- **The field is dropped entirely when empty**, so an ordinary character's stored data is
  unchanged by this feature existing.
- Caught during the slice: the field first landed on `IGCompanion`, which also has a `powers:
  string[]`. The typechecker found it immediately.

---

## Done means — all verified 2026-07-20

- ✅ A vanilla level-1 Arcanist cannot be given a Druid power by the AI, by the manual edit route,
  or at build time; a custom one can, marked; a DM can, marked as granted.
- ✅ A Freebooter with Dabbler CAN take other classes' powers — no legal choice blocked.
- ✅ A character on a parent class with no power list is not blocked from everything.
- ✅ Stances remain ungated, with tests saying why, so the exemption reads as a decision.
- ✅ Off-rules content is stored on the sheet and rendered with ⚑, same glyph as 5e.
- ✅ `npx tsc --noEmit`, `npx eslint`, whole-repo `npx vitest run` (14,653 passing), `npm run build`.

## Status: COMPLETE — S1–S4 shipped

Enforcement now covers every route that can put content on an IG character, and off-rules content
is marked where it renders.

### Explicitly deferred, with reasons

1. **PF2 gets no gate.** It has no feat or spell catalog and no content-adding op at all — a wall,
   not an unguarded door. Building one means authoring a `PF2_FEATS` catalog with levels and
   tracks first; that is content work, and inventing it would break Ground Rule 3. **Cost clearly
   exceeds value while nothing can add PF2 content in the first place.**
2. **The IG builder UI is not filtered.** The gate refuses an illegal build with a message naming
   exactly what to change, so this is a UX gap and not a correctness one — a player can compose an
   illegal build and only learn at save. The 5e side greys ineligible rows in place; IG should
   eventually match. Deferred because the correctness property is already held by the server, and
   the builder UI is one of the components the repo requires be driven in a browser to change
   safely.
3. **Not driven in a browser.** Every layer is unit-tested, linted and building, but nobody has
   clicked through the IG builder or sheet on a live logged-in character. This needs an
   authenticated session, so it belongs with the level-1-to-20 walkthrough already deferred to the
   owner in `pending/DND_FINAL_QA_WALKTHROUGH.md` rather than being re-litigated here.
