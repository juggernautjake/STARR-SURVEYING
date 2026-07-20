# D&D 2024 — the complete library, tagged, searchable, and wired to the sheet

**Status:** IN PROGRESS · started 2026-07-20
**Goal:** every part of the 2024 ruleset — spells, classes, feats, species, backgrounds,
conditions, weapons, armour, items, and the core mechanics — defined in the library, carrying
real metadata and visible tags, findable by name/type/filter, reachable by the AI, and fully
integrated into the character sheet with the right mechanics at the right level, resolved
against the player's own stats.

Plus a separate, immediate fix the owner asked for in the same breath: **character art must not
auto-publish to the campaign gallery**, and **deleting art must truly delete it**.

Work in **slices, in order**. Each slice ends green: `npx tsc --noEmit`, `npx vitest run
__tests__/dnd`, **and `npm run build`** (a route-export mistake once reached main because
`tsc` alone does not catch Next's generated route types). Commit and push per slice.

---

## Ground rules

These are inherited from the platform and are not negotiable.

1. **Paraphrase, never transcribe.** Content is "concise MECHANICAL FACTS + numbers
   (paraphrased, not verbatim rulebook prose), each attributed to its source book"
   (`lib/dnd/system-rules.ts`). Game mechanics are not copyrightable; the book's expression of
   them is. **A "spell block" here therefore means the complete mechanical block** — level,
   school, casting time, range, components, material, duration, concentration, ritual, class
   lists, damage/save/attack, higher-level scaling — **plus a paraphrased effect summary.** It
   does not mean the book's descriptive text. A test enforces a summary length ceiling because
   a creeping word count is the signal someone has started transcribing.
2. **Never invented (Ground Rule 2).** An entry whose details we are unsure of is LEFT OUT and
   reported as "not yet catalogued", never guessed. This data drives a builder that COMPUTES
   from it; a wrong casting time is worse than a missing spell.
3. **Systems never leak.** Everything is keyed by system and reached through a dispatcher.
   2014 and 2024 are different systems.
4. **Source verification.** See the open risk below — this doc cannot honestly claim
   "complete" until the content is checked against a source rather than recall.

---

## ✅ Source verification — first pass done 2026-07-20

The owner supplied sources: `dnd2024.wikidot.com`, `aidedd.org/spell/` (391 spells, 2024-only),
and a spreadsheet. aidedd's index carries the full mechanical block per spell, so it was
extracted and diffed field-by-field against all 383 catalogued entries.

**It found 20 real errors, now corrected** — vindicating the caution above:
- **Concentration on the whole 2024 smite line was wrong** (Searing, Thunderous, Wrathful,
  Blinding, Staggering Smite, Hail of Thorns, Lightning Arrow) — 2024 dropped it and recall
  carried the 2014 behaviour across every one. A *systematic* recall error, not typos, which is
  exactly the failure mode that hides from integrity tests. Animal Shapes likewise; Enthrall
  gained concentration and was missing it.
- **Seven school errors:** Stoneskin (Abj→Trans), Wall of Force (Abj→Evoc), Otiluke's Resilient
  Sphere (Abj→Evoc), Banishing Smite (Abj→Conj), Giant Insect (Trans→Conj), Glibness
  (Trans→Ench), Power Word Heal (Abj→Ench).
- **Five range errors:** Banishment 60→30 ft, Witch Bolt 30→60, Giant Insect 30→60, Conjure Fey
  90→60, Grasping Vine 30→60.

Re-audit after correction: **0 mismatches across 383 spells.**

**Second pass, same day — both lists closed.** The catalog now holds **405 spells: 388 sourced
`PHB 2024`, 17 re-sourced `Earlier 5e sourcebook (not in the 2024 PHB)`.** The 23 additions took
every mechanical field from aidedd's index rather than recall — including the entire **Summon
line** (beast, fey, undead, aberration, construct, elemental, celestial, dragon, fiend), which
the 2024 PHB leans on heavily and recall had missed completely. Feeblemind was **removed**, not
re-sourced: 2024 replaced it with Befuddlement, and offering both would hand a player a spell
their edition no longer has. Tests pin the Summon line's presence, Feeblemind's absence, and
that both source strings are legitimate.

Historic note (resolved):

Still open: **26 spells present in aidedd and absent here** (the whole Summon line — beast, fey,
undead, aberration, construct, elemental, celestial, dragon, fiend — plus Friends, Ice Knife,
Mind Spike, Vitriolic Sphere, Arcane Vigor, Fount of Moonlight, Power Word Fortify, Shining
Smite, Beast Sense, Cordon of Arrows, Dragon's Breath, Speak with Plants, Rary's Telepathic
Bond, Befuddlement, and a few named FR spells). And **18 entries here that aidedd's 2024 list
does not carry** (Absorb Elements, Thunder Step, Branding Smite, Feeblemind, Crown of Stars,
Soul Cage, Mental Prison, Far Step, Snare, Cause Fear, Psychic Scream, Mass Polymorph,
Abi-Dalzim's, Invulnerability, Mighty Fortress, Temple of the Gods, Tenser's Transformation,
Whirlwind) — these are 2014/Xanathar's/Tasha's spells that did not make the 2024 PHB, so their
`source: PHB 2024` is wrong and must be re-sourced or removed. **Feeblemind specifically was
replaced by Befuddlement in 2024.** Both lists are the next slice.

**D&D Beyond is deliberately not used as a source.** Programmatically pulling from a platform
whose terms prohibit it is a constraint on the assistant's conduct, independent of the owner's
private, non-commercial use. Three independent sources cross-checked is in any case a stronger
method than one authority — where they disagree, that disagreement is the signal.

## ⚠ Open risk: completeness cannot be self-certified

The catalog stands at **383 spells** of roughly 400, authored from model recall. Recall is good
for the commonly-played core and degrades on niche entries — and the failure mode is not a
missing spell (visible, honest) but a *plausible wrong number* (invisible, and it silently
computes). The same applies to the remaining content types.

**This doc's definition of done requires a verification pass against a real source** — SRD 5.2
(CC-BY-4.0, covers the 2024 ruleset and is safe to copy from) or the owner's own PHB. Until
that happens, `SPELL_CATALOG_STATUS.complete` stays `false` and the UI keeps saying so.
**Owner input needed:** point at a source, or accept "broad coverage, honestly labelled".

---

## Slices

### S1 — Campaign gallery: opt-in publishing + true deletion ✅ (started 2026-07-20)
Character art currently flows straight into the campaign gallery. It should live on the
character's own gallery and be **published deliberately**.
- `dnd_media` gains a publish flag; character uploads default to unpublished.
- The campaign gallery reads only published rows.
- A publish/unpublish control on each tile in the character gallery (owner/DM only).
- Deletion: confirm prompt (exists), row deleted (fixed 2026-07-19), **storage object removed**
  (fixed 2026-07-19) — verify end-to-end and make sure nothing renders a deleted image.

### S2 — Tag + metadata model for every library entry ✅ SHIPPED 2026-07-20
`lib/dnd/library-tags.ts` + 18 tests. Tags are DERIVED from fields the entry already carries —
never hand-maintained, because a hand-authored tag rots the moment someone edits the underlying
field and the filters then quietly lie. Groups: type, level, school, class, casting, duration,
range, effect, damage, source. `effect` is the valuable one and the only bucket no single field
carries — it is computed from the structured resolution (deals damage / healing / attack roll /
saving throw / utility). Faceting semantics are OR-within-group, AND-across-groups; AND-within
would make selecting two levels return nothing, the classic faceted-search bug.
Original plan for reference:
One vocabulary, applied to all content types, so filtering is uniform.
- `LibraryTag` shape: `{ key, label, group }` with groups like `type`, `school`, `level`,
  `class`, `damage`, `range`, `duration`, `rarity`, `source`.
- Derive tags automatically where the data already implies them (a spell's school/level/classes
  are tags; a weapon's properties are tags) so tagging is a projection, not hand-maintenance.
- Visible tag chips on entries; the same tags carried into `dnd_system_entries.data` for the AI.

### S3 — Clickable rules terms with tooltips ✅ SHIPPED 2026-07-20
`lib/dnd/term-index.ts` + `app/dnd/_ui/TermText.tsx` + 22 tests. Any condition, damage type,
spell, feat, mechanic or glossary term in body text is bolded and clickable, opening a short
explanation with an ✕, click-away, Escape, and a Read-more deep-link. Abbreviations are DERIVED
(glossary `short`, condition `note`, spell `summary`, feat benefit) — hand-writing several
hundred blurbs would drift from the content immediately. Damage types were the one category
with nothing to project from, so they are defined here. Matcher pins: longest-term-first
("Magic Missile" beats "Magic"), whole-words-only ("action" not inside "reaction"), no
self-linking, no overlaps, casing preserved. A test caught the first version handing 5e
conditions to unrelated systems.
Wired into SpellDetail; remaining surfaces (library entries, glossary bodies) follow.

### S4 — Search + filter UI ✅ SHIPPED 2026-07-20
`app/dnd/_ui/SpellBrowser.tsx` + 6 tests. Free-text over name/school/effect, plus faceted
filters built from the derived tag vocabulary so the facets can never drift from the data.
Facet counts are computed against the OTHER active filters, so a count never promises results
that clicking it won't produce. Visible tag chips on each entry, clickable terms via TermText,
and the give-to-character button inline. Runs client-side — 405 spells is small enough that
filtering is instant with no round trip. Renders nothing for a system with no catalog.
Original plan:
- Extend `LibrarySearch` to filter by tag groups, not just free text.
- Facets: content type, level, school, class, damage type, casting time, concentration/ritual.
- Result counts per facet; clear-all; deep-linkable query state.

### S4 — Spells: finish and verify
- Close the remaining ~17 to the full PHB list.
- Verification pass against a source (see open risk).
- Every spell carries structured `attack` / `save` / `damage` / `heal` so it rolls.

### S6 — Weapons, armour, and equipment ✅ SHIPPED 2026-07-20
`lib/dnd/equipment/dnd5e-2024.ts` + 15 tests. All 38 weapons and 13 armours with damage, damage
type, properties, weight, cost, DEX caps, strength requirements and stealth flags — **and every
weapon's 2024 MASTERY property** (Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex) with what
each does. Mastery did not exist in 2014 and is the single most likely thing for a carried-over
assumption to drop silently; a test asserts every weapon has one. Wired into the grant path, so
a granted Longsword arrives as 1d8 slashing, Versatile, Mastery: Sap — not a bare name. Unknown
items still grant WITHOUT stats rather than invented ones.

### S12 — Public library: readable without an account ✅ SHIPPED 2026-07-20
Narrower than expected: `/dnd` is already public by default (`DND_REQUIRE_LOGIN` unset) and the
library pages never demanded a session, so shared links already worked. What was actually
needed and is now done:
- **Middleware** exempts `/dnd/library` even when `DND_REQUIRE_LOGIN=1`, so shared links survive
  the day that switch is flipped rather than breaking silently.
- **Signed-out menu** is exactly Library + "Log in / Create account". Everything that CREATES
  something is hidden — "＋ Character" previously rendered signed-out and would have dead-ended
  a visitor who tapped it. Reading is open, creating is gated.
- **Relabelled** from "Sign in" to "Log in / Create account": a first-time visitor arriving on a
  shared link needs to know they can make an account, not just sign into one they lack.
- **Give-to-character** now tells a signed-out reader what to do instead of showing an empty
  character list that looks broken.
6 tests pin all of it. The library's AI chat already handles 401 by reporting the error, so it
degrades rather than crashing — left as is.

Original plan:
The owner wants library pages shareable by URL: anyone opening the link reads the whole thing
without signing in. Building a character or a campaign still requires an account — the gate
moves from *reading* to *creating*.
- Every `/dnd/library` route (index, `[key]`, and any deep link) accessible signed-out.
- The signed-out navbar dropdown carries exactly two things: **Log in / Create account** and
  **Library**. Signed-in keeps the existing menu with Library in it.
- A Library link must be present on the login page itself and on every `/dnd` page.
- Care needed: the library's grounded AI chat and the give-to-character button both require a
  session. Signed-out they should be hidden or invite sign-in rather than erroring — a dead
  button on a page you shared is worse than no button.
- Check `middleware.ts` and the `/dnd` auth wrapper for what currently forces a session; the
  D&D area is already "PUBLIC by direct link" for some routes, so this may be narrower than it
  looks.
**Not started.**

### S11 — Intuitive Games: complete system + full sheet maths (owner 2026-07-20)
The owner asked for IG to be brought to the same standard as 2024: every weapon, item, armour,
spell/power, stance, condition, ability, feat, occupation and ancestry present in the library,
and the IG character sheet doing **all** the calculations — spell and weapon mechanics wired
into real rolls and attacks, stances fully accounted for, and the arithmetic hooked up end to
end rather than displayed for the player to apply by hand.
Substantial existing base to build on: `lib/dnd/systems/intuitive-games/` already holds content,
feats (151), powers, stances, companions, spell tiers and a taxonomy, and the library page
renders them. The gaps are (a) auditing each content type for completeness against
intuitivegames.net, and (b) the sheet's derived maths — IG uses DR rather than AC and stances
that modify rolls, so the ledger needs IG-shaped targets. Verify content against the source site
per Ground Rule 3, exactly as the 2024 spells were verified.
**⚠ CORRECTION (same day).** The first cut of `resolve.ts` re-derived stance and condition
effects from `modifiers.ts` — but the sheet's ROLL path already folded them correctly via
`lib/dnd/{stances,conditions}/intuitive-games.ts`. That made it a THIRD implementation of the
same rules, the exact split-brain this repo already carries between `engine/armor.ts` and
`derive-ac.ts`. Rewritten to DELEGATE to those canonical functions; a test now asserts the
delegation, so a fix to stance logic lands in the roll and the display together instead of
drifting apart. The genuinely-missing piece was narrower than it first appeared — see below.

**Slice 1 of 3 ✅ SHIPPED 2026-07-20 — the maths is hooked up.**
`lib/dnd/systems/intuitive-games/resolve.ts` + 14 tests. The gap was not missing data:
`modifiers.ts` already modelled every stance and condition, and `rules.ts` already computed
attack bonuses, saves and skills — **the two never met.** A Shaken character saw "−2 to rolls"
as a NOTE while their attack bonus on the sheet stayed unchanged, and a Defensive stance at
level 5 granted DR that appeared in no number anywhere. Everything was displayed for the player
to apply by hand, which is the one thing a character sheet exists to prevent.
Now folded in: condition flat penalties reach attacks, saves AND skills; stance advantage /
disadvantage resolves against attacks and the right save; Advanced Offensive adds half level to
damage; Advanced Defensive adds half level to DR on top of gear; advantage and disadvantage
cancel rather than stack. Every resolved number carries `reasons`, so it is explicable rather
than mysterious.
**Deliberate restraint:** a CONDITIONAL stance clause ("advantage on attack rolls *when
flanking*") is surfaced as a reason, never auto-applied — the sheet cannot know whether you are
flanking, and assuming it would silently inflate every attack. `rules.ts` still answers "what is
the base bonus"; `resolve.ts` answers "what is it right now".
**Slice 2 of 3 ✅ SHIPPED 2026-07-20 — the sheet shows them.**
`IGSheet.tsx` reads `igInPlayState`: saves render their resolved total with the base shown
underneath when something is modifying it, a ⌃/⌄ marks advantage or disadvantage, the tooltip
names every contributing source, and DR includes Advanced Defensive's half-level on top of gear
(with gear called out separately). Showing base-alongside-resolved is deliberate — a number that
silently differs from what the player expects is worse than no number at all.

**Slice 3 of 3 ✅ SHIPPED 2026-07-20 — content audit done, no structural gaps.**
Fetched intuitivegames.net and enumerated its 19 content pages, then checked each against the
71 IG collections in `lib/dnd/systems/intuitive-games/`. **Every page has a collection behind
it.** `__tests__/dnd/ig-site-coverage.test.ts` (20 tests) pins the mapping so a whole content
category cannot go missing unnoticed.
Two naming notes that make the coverage look worse than it is: the owner's "occupations" are the
site's **Backgrounds** (`IG_BACKGROUND_DEFS`, 10 present) and "races" are its **Ancestries**
(`IG_ANCESTRIES`) — so grepping for "occupation" finds nothing and that is not a gap. Also
corrected a stale comment in `library.ts` claiming backgrounds were "PF2 only today"; IG and 2024
backgrounds have both rendered for some time.
**Depth, as opposed to breadth, was already covered** by `ig-content-complete.test.ts` and
`ig-content-gaps.test.ts`, which track the powers still awaiting effect text from Brendan against
`SITE_MASTER.md` and fail when a NEW gap appears. That is the right place for it and is left as
the owner set it up — those gaps are content Brendan has not published, not omissions here.

### S5 — Weapons, armour, and equipment (superseded by S6 above)
2024 weapon mastery properties, armour tables, adventuring gear, magic items. Grantable to a
sheet as real items with working stats, not names.

### S6 — Classes, subclasses, species, backgrounds ✅ AUDITED 2026-07-20
`__tests__/dnd/classes-2024-audit.test.ts` (8 tests). All 12 official classes present with the
correct chassis — hit die, primary ability, saving throws — plus the homebrew Pugilist. Features
run to the top of the table and every class carries its **Epic Boon at 19**.
**The 2024 change now pinned:** every class chooses its subclass at level 3. In 2014 this varied
(Cleric/Sorcerer/Warlock at 1, Wizard/Druid at 2), so a 2014 assumption offers the choice far too
early for exactly the classes a new player is most likely to pick. The data was already correct;
the test stops it regressing.
**The audit found no data bugs — it found two wrong assumptions in my own test**, worth recording
because both look like defects at a glance: (a) Paladin has no level-20 CLASS feature because in
2024 its capstone comes from the Oath, and (b) `asiLevels` omits 19 because the Epic Boon is
modelled as a FEATURE rather than a free ASI, which is the better reading — an Epic Boon is a
specific feat category, not an ability bump. Asserting either "fix" would have corrupted correct
data.
**Not verified:** per-level feature TEXT across 13 classes to level 20. aidedd's English rules
pages are the 2014 edition, so the 2024 feature prose has no available source to diff against —
unlike the spells, where aidedd's 2024 index made a field-by-field audit possible. Left honest
rather than claimed.

Original plan:
The 2024 class data exists (`lib/dnd/classes/dnd5e-2024/`, 13 files). Audit for completeness to
level 20, add subclasses, wire species/background choices into the builder.

### S7 — Conditions, mechanics, and the rest of the rules ✅ SHIPPED 2026-07-20
`lib/dnd/mechanics/dnd5e-2024.ts` + 12 tests. 24 core rules — D20 Tests, advantage, proficiency,
Heroic Inspiration, initiative, surprise, cover, unarmed strike, two-weapon fighting, death
saves, criticals, the action list, opportunity attacks, hiding, difficult terrain, jumping,
falling, vision/light, carrying capacity, travel pace, short/long rest, exhaustion — each with a
worked example carrying real numbers (a test enforces the digits; it caught three entries that
had none).
**The value is the edition deltas.** 2024 rewrote several of these and each carries an
`editionNote`: surprise no longer costs a turn (only initiative disadvantage), exhaustion is a
flat −2 per level to every D20 Test, grapple/shove are Unarmed Strike options with a save rather
than contested checks, spell attacks no longer crit, Heroic Inspiration is a reroll not
advantage. These are precisely the rules a group plays wrong from 2014 habit because they never
think to look them up.
Wired into the term index (so they are clickable everywhere) and projected into
`dnd_system_entries` **with the weapon/armour tables** — 71 new entries seeded live, so "which
weapons have Cleave" and "did surprise change?" are both answerable.

Original plan:
Conditions are done (14 + exhaustion, each with a worked example). Add the remaining core
mechanics as first-class entries: cover, surprise, resting, travel, mounted/underwater combat,
object interaction, death saves.

### S8 — AI reaches all of it ✅ SPELLS DONE 2026-07-20
Spell entries project into `dnd_system_entries` (405 live) **and now carry their derived tag
keys** in `data` and in the grounding block, so the AI can FILTER as well as name-match — "which
of these need concentration", "show me the healing ones". This is the third surface the one
vocabulary drives, which is the whole reason the tags are derived: three consumers of a
hand-kept list would drift three different ways. A test asserts the AI sees exactly the keys the
filter panel uses. Embeddings still absent (`VOYAGE_API_KEY` unset) so retrieval is keyword —
works today, ranks better when a key is added, no re-seed needed.
**Remaining for later slices:** the same projection for weapons/armour/feats once S6/S7 exist.

Original plan:
- Project every content type into `dnd_system_entries` (spells done 2026-07-20; 383 live).
- Tags into the retrieval payload so the AI can filter as well as match.
- Embeddings when `VOYAGE_API_KEY` is configured — today entries are text-only and retrieval
  falls back to keyword, which works but ranks worse.

### S9 — Sheet integration for every content type ⏳ FEATS DONE 2026-07-20
`FeatPicker.tsx` + 10 tests. Feats had no picker, so the only route onto a sheet was hand-typing
a blank feature — losing the feat's real benefit text and its ability increase, and silently
allowing anything. The picker runs every feat through `featEligibility` with the slot, level,
abilities and already-taken feats, because the standing rule is that builders offer only
rules-legal choices with custom as the EXPLICIT escape hatch; a third door that ignored it would
make that rule meaningless.
Ineligible feats are shown greyed WITH their reason rather than hidden — "why can't I take
Grappler?" is a question the sheet should answer, and hiding it makes the list look arbitrary.
Taking one anyway is possible but reads "＋ Anyway" and is deliberate.
**Still open in S9:** items already have ItemBuilder + equip/attune + library grant, so they are
effectively covered; a dedicated in-sheet item picker (as opposed to the library's
give-to-character) would be the remaining nicety.

Original plan:
Spells are done (picker → detail → cast, using the character's own stats). Repeat for feats,
items, and features: add-from-library, read in full, use, edit.

### S10 — Final QA walkthrough
Build one 2024 character start to level 20 in the running app. Every tab, every content type,
every filter. Fix what it finds.

---

## Done means

- Every content type has entries, tags, search, filters, AI retrieval, and a sheet path.
- `npm run build` green; full suite green across **repeated** runs (the suite was flaky until
  2026-07-20 — see `vitest.config.ts`).
- `SPELL_CATALOG_STATUS.complete === true` **only after** a source-verified pass.
