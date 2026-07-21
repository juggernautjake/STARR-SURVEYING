# Intuitive Games: full library + sheet parity

**Status:** IN PROGRESS · started 2026-07-21
**Owner ask, verbatim:**
- *"Please just keep making sure that everything in the library that can be possibly built for pf2 is
  built and that it is all related to the character sheet and integrated and able to be modified and
  stuff"*
- *"Do the same for intuitive games"*
- *"Please build everything into the planning doc and build it in slices."*

So the target is the same standard for BOTH systems, and PF2 is the reference implementation
because it got there first: catalogued content, reachable from the sheet, editable, authorable, and
wired into the maths rather than merely displayed.

---

## The standard, stated once

A system is "done" by this measure when all six hold:

1. **Catalogued** — its content exists as typed data with a `source`, and a status object reports
   coverage honestly rather than implying completeness.
2. **Reachable** — a picker on the sheet and in the builder can add it. (Not just the AI. PF2 spent
   several slices with a catalog nothing in the UI could reach.)
3. **Gated** — a vanilla character is held to its class and level on EVERY write path; custom is
   allowed and flagged; the DM is never blocked and their grants land marked.
4. **Editable** — anything the character holds can be changed in place, marked ✎, without being
   re-judged as a fresh acquisition.
5. **Authorable** — brand-new homebrew can be created on the sheet, in the same shape as official
   content (Ground Rule 4), carrying no false claim to be official.
6. **Computing** — it moves real numbers through the roller, not just pixels.

## Where each system stands against it

| | 5e 2024 | PF2 | IG |
|---|---|---|---|
| Catalogued | ✅ | ⚠ partial, honestly reported | ✅ 566 entries, 7 of 27 kinds honestly partial |
| Reachable | ✅ | ✅ | ✅ builder + sheet pickers (IG-S3) |
| Gated | ✅ | ✅ | ✅ |
| Editable | ✅ | ✅ | ✅ (IG-S1/S2) |
| Authorable | ✅ | ✅ | ✅ (IG-S1/S2) |
| Computing | ✅ | ✅ | ⚠ numbers yes, weapon PROPERTIES no — and honestly so |

The last cell is the only one still short, and it is short on purpose. IG attack NUMBERS resolve
through the engine and always did; what does not reach a number is the nine weapon properties, and
IG-S4 established that not one of them can be wired without inventing a rule the source does not
state. See its slice note for the per-property reasons and the crit-rule conflict underneath two of
them.

The starting position, for contrast: IG could ADD catalogued content and remove it, but never CHANGE
what it held or author anything new, had no way to add or edit a weapon at all, and could only add
content from the builder.

---

## Slices

### IG-S1 — Edit + author ops ✅ SHIPPED 2026-07-21
`IG_EDIT_OPS` gains `update_power`, `update_feat`, `add_attack`, `update_attack`, `remove_attack`.
- **`customEffects` is a map beside the list**, not a field on the element — `powers` and `feats`
  are bare `string[]`, so there is no per-element object to hang text on. Same shape and reasoning
  as `offRules`, and purely additive so every stored IG character stays valid without migration.
- **Presence in that map IS the ✎ signal.** A separate boolean would be a second source of truth
  that could disagree with the text it describes.
- **Rename keeps position and category bucket.** Remove + re-add would reorder the list and could
  move a feat into the wrong general/combat bucket.
- **Markers travel across a rename**, so editing a DM-granted power cannot launder away the record
  of how it arrived.
- **An emptied override CLEARS** rather than storing a blank, so the element falls back to its
  catalogue text instead of rendering as having no rules at all.
- **An update never CREATES** — a typo must not conjure content past the gate.

### IG-S2 — Editor + authoring UI on the IG sheet ✅ SHIPPED 2026-07-21
`IGElementEditor` (one component, all three kinds) with per-element ✎ Edit, ✎ New for homebrew, and
a weapon editor, wired to the gated `ig-edit` route and rendering ✎ beside the existing ⚑.

Completed 2026-07-21 with the two things the first pass left:

- **The gate's refusal now reaches the player.** Every failure was swallowed, on the stated theory
  that "the unchanged sheet surfaces it". It does not — an unchanged sheet is indistinguishable
  from a slow one, so a refused edit read as the app ignoring you. `gateIgEdit` composes a genuinely
  useful sentence (names the element, the reason, and both ways forward) and it was being discarded.
  One `postOne` helper now backs both the single-op and sequence paths, so they cannot report
  failures differently — which is how one of them ends up reporting nothing. A later op failing
  mid-sequence says the element was created but its details were not, because add-then-update can
  genuinely half-apply and a confusing result is worth one extra clause to make finishable.
- **Authoring a power is predicted, not merely refused.** `canAuthorPowers = isDM || custom`
  mirrors `gateIgEdit` exactly, and the ✎ New button explains itself rather than failing on press.
  It gates **only** powers, because the server gates only `add_power` — IG feats have free-prose
  prerequisites and stances may legitimately be held off-list, both deliberately ungated. Disabling
  those here would be the UI inventing a restriction the rules do not have: the mirror image of a
  bleed, and just as wrong. `isDM` and the variant are passed as props from the page, derived the
  same server-side way the route derives them, so the hint cannot drift from the gate that decides.

### IG-S3 — Sheet pickers ✅ SHIPPED 2026-07-21
`IGContentPicker` replaces the bare `<select>` of names the sheet used to add powers and feats with
PF2's picker contract: show everything, grey the ineligible rather than hiding it, and treat the
greying as feedback timing only — the `ig-edit` route still re-derives variant and DM flag
server-side, so nothing in the request body decides whether the rules apply.

- **Feats carry NO computed eligibility verdict.** IG feat prerequisites are free English prose that
  cannot be parsed without inventing structure the source does not have, so feats show their
  prerequisite text and let the player judge. A check mark there would be the UI asserting a verdict
  the rules engine has explicitly declined to reach — authoritative-looking, and worse than nothing.
- **Power eligibility fails open**, for the same reason: IG parent classes genuinely carry no power
  list, so "no verdict" beats a blanket refusal.

### IG-S4 — Weapons reach the maths ✅ SHIPPED 2026-07-21
Traced, and the answer split in two.

**The numbers already computed, and now they are asserted.** `igAttackBonus` folds ability modifier +
proficiency (= level, IG has no proficiency table) + Weapon Focus + the misc bonus; `igDamageBonus`
folds the STR modifier on melee + Weapon Specialization + the misc bonus; `igResolveAttackInPlay`
adds stance and conditions; the sheet feeds both to `resolveD20Roll` and `rollDiceExpr`. Nothing
needed wiring. `__tests__/dnd/ig-attack-maths.test.ts` (26 cases) now asserts the RESOLVED TOTAL —
"natural 15 with the resolved +11 totals 26 and reads as a success against DC 20", "1d8+7 with a
pinned rng rolls 8 and 15 at its bounds" — rather than that a field renders, so "it computes" is
checked rather than remembered. `rollDiceExpr` takes its rng, so the die faces are pinned, not
sampled.

**The properties did not, and deliberately still do not.** `IGAttack.properties` was one free-text
string that the sheet printed in a table cell and nothing else ever read. `attack.ts` now parses it
against the nine published properties, carries each one's rules text onto the resolved attack, and
lists the uncomputed ones in `conditional` — the list the sheet already means as "in force, and I
will not decide it for you". An unrecognized entry is REPORTED, not dropped and not refused, because
homebrew is allowed its own properties (Ground Rule 4).

What was deliberately NOT done, and why, since this is the whole substance of the slice:

- **Not one of the nine is folded into a number**, and each carries its own reason in
  `IG_ATTACK_PROPERTIES[].why`. Four are range or damage-type rules with no number to move (IG has no
  geometry model and `damage` is a bare die string). Nonlethal belongs to the apply-damage path,
  which no longer knows which attack dealt it. Engineered names no skill, so the resolver cannot know
  which of the nine combat skills to raise. Double-Ended's "damage on both ends" does not say whether
  that is a second attack or a second roll.
- **The two crit properties are blocked on a genuine source conflict, not on missing data.**
  `system-rules.ts` describes IG resolution as an OPPOSED d20 critting at beat-by-20 for double
  damage; `rules.ts` and `roll.ts` implement a beat-the-DC-by-10 four-step ladder shared with PF2.
  Expanded Critical ("15+ instead of 20+") sides with the first. Wiring 15 into a ±10 ladder produces
  a number wrong under both readings, so nothing was wired and the conflict is recorded in
  `IG_ATTACK_MATH_GAPS` for the owner. Changing the ladder is a rules decision, not a slice.
- **Powerful Critical is unblocked the day crit damage exists.** IG does publish the base it triples
  (a critical success deals double damage) — but nothing applies that base, because the sheet rolls
  the d20 and the damage expression through separate buttons and the damage roll never learns what
  the attack scored. Tripling a doubling that does not happen is not a number.
- **The multi-property damage-dice loss was left alone.** IG says a multi-property weapon "loses
  damage dice for each property beyond the first" and never says the step size, and IG publishes no
  die ladder. The companion size table's "damage dice decreased once" SUGGESTS one step per property.
  Suggests is not states.
- **`igDamageBonus` decides melee-vs-ranged from `ability === 'STR'`, not from the weapon class**,
  which is wrong for a Heavy Ranged weapon fired off DEX that still adds STR to damage. It was left
  wrong on purpose: "Heavy Ranged" is not expressible as an `IGAttack.weaponType` at all, because the
  repo holds two disagreeing transcriptions of the weapon-class taxonomy (`IG_WEAPON_TYPES` treats
  Ranged as one class × three damage types; `IG_WEAPON_CLASS_DATA` has three ranged classes plus
  ammunition). Fixing the maths before the taxonomy would just move the wrongness.
- **`IGSheet`'s attack table still resolves with the BASE `igResolveAttack`**, so the displayed
  to-hit omits the condition penalty the roll then applies — the S11 "card says +7, rolls +5"
  problem, fixed for saves/skills/DR and still open for attacks. Not touched here because that file
  was being edited concurrently by another agent, and the roll itself is correct: `rollLine` adds the
  penalty to the base number it is handed, so there is no double-count. A test pins that invariant so
  whoever switches the display knows the roll path must stop adding it.

### IG-S5 — Catalog completeness audit ✅ SHIPPED 2026-07-21
`IG_CATALOG_STATUS` in `status.ts` — 27 kinds, every count derived from its array, `complete` honest
per kind, and each one naming the catalog group it is surfaced as. 566 entries across 47 groups; 20
kinds complete, 7 partial.

**The audit's actual finding was reachability, not depth.** Fourteen kinds were fully transcribed
into data files and emitted by NO catalog group, so nothing in the UI could offer them and no test
would have noticed — every test read the arrays directly. Backgrounds are the sharpest case: ten of
them, recognised by the provenance classifier, and the builder (which reads `igCatalog()`) could not
offer a single one. Also newly surfaced: weapon classes, weapon properties, armor, shields,
equipment packs, enchantments, companion types/features/aspects/sizes, damage types, cover, size
categories, redistribution materials.

- **`catalogKind` on every status entry is the load-bearing part.** It makes "is it REACHABLE?" a
  checkable property rather than a claim, and the test fails in both directions — a status key naming
  a kind the catalog does not emit, or a group emitted with no status entry behind it.
- **`IGCatalogKind` widens `ElementKind` rather than editing it.** `ElementKind` is the PROVENANCE
  vocabulary — kinds a held element is classified vanilla/custom/DM-granted as — and cover, damage
  types and gear tables are reference content nobody holds. Widening there would have made the
  provenance vocabulary mean less; widening here keeps it meaning exactly what it says.
- **A `complete: true` is checked, not trusted.** Powers is the biggest kind claiming completeness
  and its claim is specific (all 54 roster spells carry verbatim Description text AND Advanced AND
  Expert tiers), so the test verifies the depth rather than the flag.

Gaps RECORDED rather than filled — all seven partial kinds, in `IG_KNOWN_GAPS` next to the data:

| kind | why it is short |
|---|---|
| defensive powers | 6 catalogued, but the class tables grant three more (Mage Armor, Misdirection, Life Connection). Their text lives in `IG_POWERS`; merging is a content decision — are they spells or defensive powers? — and guessing it puts a power in the wrong slot. |
| weapon classes | the site's /weapons page is a declared WIP: it defines classes, properties and costs and lists **no named weapons at all**. There is no weapon roster to catalogue. |
| equipment | Outdoor Equipment, Tools, Refined Items, Sustenance and Materials exist on the site as **empty headers**; /tools explains the concept and lists no tools. |
| creatures | 87 bestiary names in 7 groups, **no statblocks** — the template enumerates what a companion can be without publishing stats for any of it. |
| companion features | 11 features + 7 aspects are complete; the site does not publish how a companion is DIRECTED in combat or its action economy, so the build options are done and the play rules are not. |
| size categories | 9 names, and the site publishes no per-size table for characters. The companion size table covers Tiny–Large only; the other five were not invented to fill the gap. |
| powers (unlisted) | 9 template names are off the current roster — five are defensive/class powers filed as spells, the rest look like renames ("Detect Thoughts" vs "Detect Thoughts/Emotions"). Surfaced under "Powers · Unlisted", not deleted and not silently merged. |

Two further gaps with nowhere else to live, also recorded:

- **The provenance classifier does not route `background` to IG.** `content.ts` KIND_NAMES holds a
  background list; `provenance.ts` `IG_KINDS` omits `background`, so `classifyElement` falls through
  to the untracked branch and calls ANY background name vanilla. It fails open — never a false flag —
  which is why it went unnoticed, but a custom background is not currently flagged custom. Left
  unfixed here because `provenance.ts` is outside this slice's lane.
- **IG has no `weapon` catalog in the ElementKind sense** and cannot, per the weapons-page WIP above.
  A weapon on an IG sheet is always player-authored and provenance treats it as untracked.

`status.ts` is consumed by the AI builder grounding, which now names the partial kinds in the prompt.
Without that, a kind we simply have not transcribed reads to the model as a kind the system does not
have — and it then either refuses a legitimate build or invents a replacement for content that
already exists on the site.

---

## PF2 remainder (tracked in `PF2_FULL_BUILDOUT_2026-07-20.md`)

The PF2 doc stays open on **catalog long-tail only** — 208 of ~1,500 spells, 805 feats. Its
infrastructure meets all six criteria above. That is authoring passes, not slices, and
`PF2_CATALOG_STATUS` reports every gap truthfully so nothing claims completeness it lacks.

## Where this leaves IG

All five slices are shipped. Five of the six criteria hold outright; **Computing** holds for every
number and not for weapon properties, and IG-S4 established that closing that last gap is not
engineering work — it needs the owner to settle the crit rule (±10 ladder or the ±20 opposed roll
`system-rules.ts` describes) and to reconcile the two weapon-class transcriptions. Both are questions
about what Intuitive Games says, which is why they are below rather than in a slice.

This doc therefore stays open on **source questions only**, the same posture as the PF2 doc: the
infrastructure is finished, and what remains is content the source has not published, has published
twice differently, or has published as an empty header.

### IG-S6 — two holes the audit exposed, closed ✅ SHIPPED 2026-07-21

Not planned slices. Both came out of IG-S5's audit and a browser pass, and both are the same
defect this project keeps meeting in new costumes: **content authored and tracked, with nothing
wired to consult it.**

- **An invented IG background passed as official** (`c5094eb5`). `background` was absent from
  `IG_KINDS` in `provenance.ts`, while IG's own `KIND_NAMES.background` listed all ten catalogued
  backgrounds and `igIsVanilla` classified them correctly. The shared layer never asked, so
  `classifyElement` fell through to the untracked-kind arm — which returns `vanilla` deliberately,
  so an unknown kind is never falsely flagged, and which is exactly wrong when the kind IS
  tracked. Net effect: a made-up background on a *vanilla* character read as official. The gate
  failing open in the one place it must fail closed.

  The guard asserts the RELATIONSHIP, not the list: every kind `IGContentKind` can classify must
  be routed by the shared layer. A test restating `IG_KINDS` by hand would have been just as wrong
  as `IG_KINDS` was. Behaviour change stated plainly in the commit: an IG character already
  holding an off-catalog background now reads custom, which is correct and is visible.

- **The builder offered two chips for one feat** (`468a8aa6`). IG publishes Armor Proficiency,
  Shield Proficiency and Weapon Training on BOTH feat pages with differently-worded effects, which
  `feats.ts` deliberately preserves. React's duplicate-key warning was the symptom; the bug was
  that `feats` is a bare `string[]`, so both chips wrote the same value and toggled in lockstep —
  the UI offering a choice the sheet cannot represent. Fixed by deduping at the option level,
  since storage is by name. The sheet's picker merges too but keeps BOTH published effects,
  attributed by category: it displays rules text, and the combat version is materially stronger,
  so silently keeping whichever was iterated first would misinform a player about what they took.

  Left unresolved and recorded: WHICH published effect applies is a content question. It belongs
  in the open questions below, and it is question 6.

## Open questions for the owner, recorded rather than guessed

1. **IG's crit rule, stated two ways in this repo.** `system-rules.ts` says IG resolves as an OPPOSED
   d20 with critical success at beat-by-20 (double damage); `rules.ts`/`roll.ts` implement
   beat-the-DC-by-10 on the four-step ladder shared with PF2. The Expanded Critical weapon property
   sides with the ±20 reading. Every IG roll, test and sheet currently uses the ±10 ladder. Two
   weapon properties and all crit DAMAGE are blocked on the answer.
2. **The weapon-class taxonomy, transcribed twice and disagreeing.** `IG_WEAPON_TYPES` is
   {Light, One-Handed, Two-Handed, Heavy, Ranged} × damage type; `IG_WEAPON_CLASS_DATA` is four melee
   classes plus three ranged classes and ammunition. "Heavy Ranged" — the one class with its own
   damage rule (adds STR) — is unrepresentable in the first, which is where the sheet stores it.
3. **Defensive powers vs powers.** Mage Armor, Misdirection and Life Connection are granted as
   subclass DEFENSIVE powers but their text lives in `IG_POWERS`. Which list owns them?
4. **Homebrew scope** — per-character (assumed, matching 2024) or promoted to a shared per-campaign
   library other characters can draw from?
6. **Three feats published twice, with different effects.** Armor Proficiency, Shield Proficiency
   and Weapon Training appear on both the general and combat feat pages. The combat wording is
   materially stronger in each case (Armor Proficiency: "proficient with all types of armor" vs
   merely removing the Reflex penalty). The sheet stores feats by name and so can hold only one.
   Which wording is current — or are they genuinely two feats that need distinct names?
7. **Archives of Nethys sourcing** — two PF2 tranches (classes, ancestries) were authored using AoN
   after I said I would avoid it, because my agent prompts did not carry that constraint. The facts
   are ORC-licensed mechanics and were paraphrased, but the boundary I stated was not enforced.
   Re-deriving gets more expensive as content layers on top.

## Done means — and where it actually landed

Original bar, with the honest outcome against each:

- **All six criteria hold for IG.** ✅ for five. **Computing** holds for every NUMBER — attack
  bonuses, damage, stance and condition effects all resolve through the engine, pinned by 26 tests
  asserting resolved totals rather than rendered fields. It does NOT hold for the nine weapon
  PROPERTIES, and IG-S4 established that this is not engineering work: four are range/damage-type
  rules with no number to move, one names no skill, one is ambiguously worded, and the two crit
  properties are blocked on the repo containing two contradictory statements of IG's crit rule
  (open question 1). Wiring any of them means inventing a rule the source does not state.
- `npx tsc --noEmit`, `npx eslint`, whole-repo `npx vitest run` ✅ green (1076 files / 15,365 tests
  at the last full run). `npm run build` ✅.
- Every slice committed ✅.

**This doc is CLOSED and moved to `completed/`.** Every engineering action item is shipped. What
remains is seven questions about what Intuitive Games *says* — content the source has not
published, has published twice differently, or has published as an empty header. Those are the
owner's to answer, not work anyone can do from here, and guessing at them is precisely what this
project has repeatedly refused to do. When the owner answers questions 1, 2, 3 or 6, the follow-up
work is small and well-specified above; open a new doc for it rather than reopening this one.
