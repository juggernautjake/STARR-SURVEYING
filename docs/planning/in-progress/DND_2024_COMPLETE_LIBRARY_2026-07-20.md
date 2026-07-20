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

### S4 — Search + filter UI
- Extend `LibrarySearch` to filter by tag groups, not just free text.
- Facets: content type, level, school, class, damage type, casting time, concentration/ritual.
- Result counts per facet; clear-all; deep-linkable query state.

### S4 — Spells: finish and verify
- Close the remaining ~17 to the full PHB list.
- Verification pass against a source (see open risk).
- Every spell carries structured `attack` / `save` / `damage` / `heal` so it rolls.

### S5 — Weapons, armour, and equipment
2024 weapon mastery properties, armour tables, adventuring gear, magic items. Grantable to a
sheet as real items with working stats, not names.

### S6 — Classes, subclasses, species, backgrounds
The 2024 class data exists (`lib/dnd/classes/dnd5e-2024/`, 13 files). Audit for completeness to
level 20, add subclasses, wire species/background choices into the builder.

### S7 — Conditions, mechanics, and the rest of the rules
Conditions are done (14 + exhaustion, each with a worked example). Add the remaining core
mechanics as first-class entries: cover, surprise, resting, travel, mounted/underwater combat,
object interaction, death saves.

### S8 — AI reaches all of it
- Project every content type into `dnd_system_entries` (spells done 2026-07-20; 383 live).
- Tags into the retrieval payload so the AI can filter as well as match.
- Embeddings when `VOYAGE_API_KEY` is configured — today entries are text-only and retrieval
  falls back to keyword, which works but ranks worse.

### S9 — Sheet integration for every content type
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
