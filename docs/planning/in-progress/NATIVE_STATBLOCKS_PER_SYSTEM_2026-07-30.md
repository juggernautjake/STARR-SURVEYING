# Native stat blocks per system — 2026-07-30

**Owner asks, verbatim:**

> *"Right now it seems like the skunk has the same stat block for all four systems. You need to study how
> each system works and make sure that every creature in the bestiary has a full custom stat block for each
> system and that it is totally balanced and correct."*
>
> *"All stat blocks for all creatures should vary and be different per system."*
>
> *"we need to be able to set the system that the stat blocks for the bestiary are showing. Like, if we
> switch to PF2, then all of the stat blocks should be geared towards that."*

---

## The observation is correct, and here is exactly what is happening

Verified on the owner's own example. `pf2b3:skunk` is a Pathfinder creature: **AC 15, HP 7, Fort +4 / Ref
+7 / Will +3, ability MODIFIERS**. Ask to see it as D&D 5e and you get **AC 15, HP 7** — the same numbers,
with a warning list attached.

That is not a bug. It is `transposeCreature` doing exactly what B4-1 built it to do, under the bestiary's
Ground Rule 5: **transposition never invents rules.** No published conversion exists between a PF2 AC and a
5e AC, so it carries the source figure across and marks it as needing a human rather than making one up.

**The reasoning was right and the result is not good enough.** "Marked as needing a human" is honest, but a
DM cannot run it, and four systems showing one set of numbers reads as a bug even when it is a disclosure.

## The constraint, stated before anything is built on it

**"Totally balanced and correct" cannot be promised for 5,025 creatures × 4 systems = ~20,100 stat blocks.**
Balance is a per-creature design judgement — whether *this* dragon is a fair fight for *that* party — and no
process short of a designer playing each one produces it. Any plan claiming otherwise would be claiming
something it cannot check, which is the failure mode this whole bestiary was built to avoid.

**What CAN be promised, and is a genuine answer to the ask:** every system publishes a table for building a
creature at a given tier — 5e's *Monster Statistics by Challenge Rating* (DMG) and Pathfinder's *Building
Creatures* (Monster Core) both give AC, HP, attack bonus, damage and DCs per level/CR. Rebuilding a
creature's numbers **from the target system's own published table** is not invention: it is that system's
own maths, applied at the equivalent tier, and it produces a stat block that reads and plays natively rather
than one carrying a foreign system's figures.

So the promise this plan makes is: **derived from each system's published creature-building rules, at a
defensible tier, with every derivation stated.** Not: hand-balanced per creature. The difference is written
into the UI, not just into this document.

### Ground rules

- **N1 — Every number comes from a published table, or it is marked.** Same spirit as G5, one level up: we
  are no longer copying a foreign number, but we are still not inventing one. If a system publishes no
  guidance for a field, that field stays flagged.
- **N2 — The tier mapping is stated, not assumed.** CR 5 → PF2 level *n* is a claim. It gets written down
  once, with its basis, and every derived block cites it.
- **N3 — The source creature is never overwritten.** A native PF2 skunk and the 5e skunk it derives from are
  separate rows. The catalogue stays re-importable (`import:*` upserts on slug), so a derived row must have
  its own slug and must not collide.
- **N7 — ONE CREATURE, ONE ENTRY IN THE LIST.** Rows are the storage; a creature is what a reader browses.
  See below — this rule was added on the owner's report and it changes N3-1 and N3-3.
- **N4 — Derived is labelled, always.** A reader must be able to tell a published Monster Core skunk from
  one we derived, at a glance, on the page and in the row. Silent equivalence is the thing that makes a
  catalogue untrustworthy.
- **N5 — Prose is translated, not regenerated.** Actions keep their published wording; only the NUMBERS are
  rebuilt, plus condition names swapped to the target system's vocabulary (already built — B6-4 and
  `conditions/annotate.ts`). Rewriting flavour text at 20,000 scale is a different project with a different
  risk.
- **N6 — Nothing ships that cannot be spot-checked.** Every slice ends with a sample pulled from the live
  database and read against the target system's table by hand.

---

## N7 — one creature, one entry (owner, 2026-07-30) — **and this is already a live defect**

> *"The bestiary is showing a bunch of transposed duplicates… I want it so that the creature just has one
> access point. The user will just see one version of the creature on the bestiary page, and then click on
> it. It will default to the 2024 edition, but the user can switch it to any of the other ones. If there
> are variants of the creature posted in that system, there should be an element below the stat block
> showing a carousel of the variants that can be clicked to view the variant stat block. All differences in
> the variant stat block should be noted."*

**Measured, not taken on faith: 5,025 rows for 3,660 distinct creatures.** Badger, Balor, Behir, Ghoul and
Animated Armor each occupy **ten rows across four systems**. Browsing the bestiary means scrolling past the
same creature ten times.

The cause is the design working as built and as planned: a row is `(creature, system, source book)`, so
five books' Badgers plus the transposed copies are five-plus rows, all correct and all indistinguishable in
a list. **The plan's own N3 keeps them separate rows deliberately** (a derived row must not overwrite a
published one) and that stays right — the fix is not fewer rows, it is that **the LIST is a list of
creatures while the ROWS are storage**.

So N7 changes two slices already in this plan:

- **N3-1 (generation)** must key derived rows to a stable *creature identity* rather than only a slug, so
  every row for "Badger" can be gathered back into one entry.
- **N3-3 (the lens)** becomes the whole reading experience rather than a control: one entry per creature,
  opening on the 2024 edition, with the system switcher choosing which of that creature's rows you are
  reading — published where one exists, derived where it does not.

Plus one new slice:

### N3-5 · Variants as a carousel beneath the stat block — **SHIPPED 2026-07-30**
`dnd_creature_variants` already holds **4,378** weak/elite derivations with a stated derivation sentence
each, and the creature page rendered them as a stack of collapsed `<details>` nobody opened. The owner
wanted a carousel under the block, and — the part that matters — ***"all differences in the variant stat
block should be noted."***

**The diff is COMPUTED, not quoted, and that distinction is the whole slice.** The obvious implementation
is to print the derivation sentence beside each variant. `lib/dnd/statblocks/diff.ts` compares the two
blocks instead, because **a sentence is a claim about what a formula intended and the block is what it
did** — and they demonstrably disagree. The PF2 adjustment's sentence says it shifts *"AC, attacks, DCs and
saves"*; `deriveVariant` shifts AC, saves, skills and each entry's `toHit`, and a DC written inside an
action's prose (*"DC 16 Fortitude"*) is untouched. Quoting the sentence repeats a promise the data does not
keep. That gap is now asserted in a test, so the day someone fixes it the test says exactly what changed.

Entries are matched **by name, not by index** — a variant that adds one trait would otherwise shift every
later entry and report the whole action list as changed, which is a diff nobody reads. `null` is kept
distinct from `0` throughout: a field absent is not a field set to zero, and conflating them would report
an AC of 0 for a creature that simply has none.

`VariantCarousel` opens on the first VARIANT rather than the base, because the lens renders the base
directly above and two near-identical stat blocks read as a rendering bug. The base card stays — it is the
anchor every difference is measured from.

#### The bug this surfaced: 4,378 variants contradicting themselves

Visible the moment the carousel rendered: the Elite Balor showed **"Hit Points 374 (26d12+130)"** — and
26d12+130 averages **299**, the base's total. `deriveVariant` spread the source block and rewrote `hp`
while carrying `hitDice` across untouched, so the block disagreed with itself **in the one place a DM
actually rolls from**, and had done for every one of the 4,378 stored rows.

Dropped rather than recomputed, which is the same call `deriveNativeStatblock` already makes for the same
reason: a die expression averaging the new total has several equally defensible answers, and printing one
states a creature's constitution as a fact. **A missing line reads as missing; a wrong one reads as
authoritative.** The variant now carries a note saying so, and the diff reports *"Hit Dice removed (was
26d12+130)"* rather than the line quietly vanishing between two blocks.

**The stored rows were regenerated, not just the code path fixed** — `npm run variants:creatures` upserts
on `(creature_id, tier)`, so 4,376 rows were corrected in place with nothing deleted. Verified against the
live database: **0 of 4,378 variants now carry hit dice that describe a different HP total**, down from all
of them.

Guarded by `__tests__/dnd/statblock-diff.test.ts` (20 cases).

**Identity is the hard part and it is not the name.** "Skunk" in Pathfinder Bestiary 3 and "Skunk" in
Monstrous Menagerie may be different creatures; "Badger" and "Giant Badger" are certainly different.
Grouping by name alone would merge things that should stay apart, and grouping by nothing leaves the
duplicates. That decision gets made and written down in N3-1 before any row is regenerated — it is the
single choice this whole phase rests on.

---

## Phase N1 — the published tables

### N1-1 + N1-2 · `lib/dnd/statblocks/tiers.ts` — **SHIPPED 2026-07-30**

**The plan said to copy the published tables. It cannot, and the alternative is better.**

D&D's *Monster Statistics by Challenge Rating* is Dungeon Master's Guide content and Pathfinder's *Building
Creatures* is Monster Core content. **Neither is in the SRD or the ORC-licensed remaster**, so embedding
either verbatim is the exact boundary this bestiary has refused since B1-3 (G3). Caught before writing a
line of it, by checking rather than assuming.

So the tables are **measured** from the corpus we already hold under CC-BY and OGL: **4,418 creatures**
(2,827 D&D across 31 tiers, 1,591 Pathfinder across 25), each with a stated AC, HP and tier.
`npm run derive:tiers` prints them; `-- --write` regenerates the module, so the numbers stay a measurement
rather than someone's memory of one.

**That is a better source for this job, not a workaround.** A published guideline says what a designer was
aiming at; the corpus says what creatures at that tier actually ARE — which is what a derived creature has
to sit alongside on the same page.

**Non-decreasing by construction.** Raw medians wobble on small samples — 5e's CR 24 measured *lower* HP
than CR 23, because twelve creatures is a small sample and one is a spellcaster. A target table that dips
would tell a DM a harder creature is frailer, so each series gets an isotonic (pool-adjacent-violators) fit:
the fewest points moved by the least amount, rather than smoothing everything.

Every row carries its **sample size**, so a tier measured from three creatures is visibly a different claim
from one measured from 250. Tiers below three creatures are omitted and reported by name rather than
silently dropped.

Guarded by `__tests__/dnd/statblock-tiers.test.ts` (13 cases) asserting PROPERTIES of the measurement
rather than agreement with a book — which is also the only kind of assertion that survives the corpus
growing. Including one that pins the reason there are two tables at all: **PF2's top AC must exceed 5e's by
more than 15**, so a future "simplification" into one shared table fails loudly.

#### The bug the table shipped with, and how it read

The first run produced **attack bonus 0 at every tier in both systems**. `Number('')` is `0` and
`Number.isFinite(0)` is `true`, so reading `toHit` without a missing-value guard pushed a zero for every
trait, reaction and Multiattack — which is most entries — and dragged every median to the floor.

It did not look like a parsing bug. It looked like a finding: *"no creature in the catalogue has an attack
bonus."* A table of zeroes is exactly the kind of plausible output that gets written into a data file and
believed. Fixed, and the guard now asserts every tier's attack bonus is above zero.

### N1-3 · `lib/dnd/statblocks/tables/intuitive-games.ts`
IG publishes no creature-building table. **This is the honest gap**, and it is recorded rather than filled:
IG creatures keep the transposition path plus the stance/condition layer B6-4 already added, and the UI says
so. Inventing an IG table would be exactly what N1 forbids.

### N1-4 · The tier map `lib/dnd/statblocks/tier.ts` — **SHIPPED 2026-07-30**
CR ↔ level, with its basis written down (N2). Both systems intend a "creature of tier X is a fair fight for
a party of level X" reading, so the mapping is close to identity — but *close to* is not *is*, and the
fractional 5e CRs (⅛, ¼, ½) map to PF2's −1/0/1 rather than to a fraction.

**What shipped, and the two places the systems genuinely differ:**

- **Below 1.** 5e prints fractions; PF2 prints integers below zero. Three 5e values (⅛, ¼, ½) do not fit in
  PF2's two (−1, 0), so ⅛ and ¼ both map to −1 and ½ maps to 0. `crToLevel(0.125) === crToLevel(0.25)` is a
  fact about the systems, not a defect — and it is asserted, so nobody "fixes" it later.
- **Above 20.** 5e runs to CR 30, PF2 to level 24. The map **clamps rather than extrapolating**, and
  `mapTier` returns `{ tier, clamped }` so a derived block can SAY it was held at the ceiling. The clamp is
  computed against the *unclamped* conversion for exactly this reason: folding the clamp into `crToLevel`
  made "maps to 30" and "…and 30 does not exist" indistinguishable, and a clamp nobody can detect is a
  silent one.

`parseTier` reads every shape the corpus writes a tier in (`1/4`, `CR 5`, `Level 7`, `5 (1,800 XP)`, `-1`)
and returns **null**, never 0, when there is none — the N1-1 zero-table bug in one function.

### N2-1 · `deriveNativeStatblock` — **SHIPPED 2026-07-30**

`lib/dnd/statblocks/derive-native.ts`. Throws the source's NUMBERS away and rebuilds them from the target's
measured tier row; keeps the source's PROSE and shape. Pure, total, non-mutating — 30 cases in
`__tests__/dnd/derive-native-statblock.test.ts`.

The spot-check the plan asks for (N3-2), run by hand on the skunk:

| target | AC | HP | tier | to-hit | sample |
|---|---|---|---|---|---|
| `dnd5e-2024` / `dnd5e-2014` | 12 | 14 | CR 1/4 | +4 | 178 |
| `pathfinder2e` | 15 | 8 | level −1 | +7 | 37 |
| `intuitive-games` | — | — | — | — | refused |

Both rows match their own table exactly, and the shapes differ the way the systems do: Pathfinder gets
**ability modifiers** and no proficiency bonus, D&D gets **scores** and +2. Saves are DROPPED when crossing
families, because a Pathfinder block listing "DEX +4" names a save Pathfinder has not got.

**What it refuses, each because the alternative is a plausible lie:**

1. **Intuitive Games** — no table exists (N1-3), so it returns a stated refusal rather than quietly
   borrowing 5e's numbers and printing them as IG's.
2. **A creature with no readable tier** — a guessed tier silently decides every number after it.
3. **A silent clamp or a thin measurement** — both go into `notes`, which is rendered. A tier measured from
   4 creatures says so.

**The honest finding: `dnd5e-2014` and `dnd5e-2024` derive IDENTICALLY.** They share one measured scale
because the two editions share their monster math — this is not a gap in the derivation, it is what is
true. The owner asked that *"all stat blocks for all creatures should vary and be different per system"*;
for these two the difference is **presentation, not numbers**, and inventing a numeric divergence to make
the grid look varied would be the same fabrication N1 refused for the published tables. Recorded here so
the next reader does not "fix" it.

**Not carried:** hit dice (they described a different HP total), and attack DAMAGE (the corpus supports a
median to-hit per tier; damage expressions are too varied to median honestly, so a made-up dice expression
would be the least defensible number on the block). Only entries that already HAVE a to-hit are re-pitched
— "Keen Smell +7" is nonsense a reader spots instantly.

---

## Phase N2 — the derivation

### N2-1 · `deriveNativeStatblock(source, target)`
Takes a creature and a target system; returns a stat block whose numbers come from the target's table at the
mapped tier, whose prose is the source's, and whose every derived field carries a one-line note. Pure and
tested, like every other transform in this codebase.

### N2-3 · What each system does that the others do not — **SHIPPED 2026-07-30**

The research slice the owner asked for — *"study how each system works"*. Done as a **measurement of the
corpus rather than a reading of the rulebooks**, for the same reason N1-1 measured the tier tables: the
books are DMG and Monster Core content we cannot quote, and what 4,418 published creatures actually print
is a stronger statement about a system's shape than a recollection of what its designers intended.

`npm run derive:tiers` now reports coverage per field per tier, and the answer is unambiguous:

| field | Pathfinder 2e | D&D 5e |
|---|---|---|
| Fortitude | **25 / 25 tiers** | 0 / 31 |
| Reflex | **25 / 25** | 0 / 31 |
| Will | **25 / 25** | 0 / 31 |
| Perception modifier | **25 / 25** | 0 / 31 |

**That asymmetry is the finding, and it is a fact about the systems rather than a gap in our data.** Every
published Pathfinder creature prints three saves and a Perception modifier. Most 5e creatures state **no
saving throws at all**, and 5e writes perception as *"passive Perception 13"* inside its senses line — a
different quantity in a different place, not the same field spelled differently.

**So a derived Pathfinder block was recognisably not a Pathfinder block**, whatever its AC said. N2-1
correctly DROPS the source's saves when crossing families (a Pathfinder block listing *"WIS +3"* names a
save Pathfinder has not got) — and nothing replaced them, so the creature had none. That is the concrete
answer to *"what a native stat block MUST carry that a converted one lacks"*.

### N2-2 · Per-system character — **SHIPPED 2026-07-30**

The three gaps N2-3 found, closed. All measured by the same method as AC and HP, so N1 holds: the numbers
still come from creatures that exist rather than from a book we may not quote.

- **Fort / Ref / Will**, rebuilt at the target tier's measured medians wherever the target publishes saves.
  Never for D&D — the 5e rows carry no `fort` at all, because a "median 5e save" computed from the
  minority of creatures that happen to have one is the N1-1 zero-table bug in a new costume. Never over a
  same-family derivation either: those keep the creature's real saves, which are a designer's numbers and
  beat a median.
- **Perception**, set from the tier as a Pathfinder LINE — with the rest of the senses kept. Darkvision and
  scent describe the *creature*; dropping the whole line to fix one phrase would lose real content.
- **"Level", not "Challenge".** The renderer hardcoded the 5e word while already receiving `system` as a
  prop, so an otherwise-native Pathfinder block ended on one last piece of 5e vocabulary. Changed only for
  Pathfinder, where the term is certain — Intuitive Games keeps "Challenge" rather than having a label
  guessed for it.

Verified in the browser on a derived Pathfinder Aboleth: AC 31, HP 195, ability modifiers, **Fort +22 /
Ref +20 / Will +21**, **Perception +21; blindsight 30 ft.; darkvision 120 ft.**, Level 11 — with all nine
derivation notes and the N4-2 caveat beneath it.

**The boundary that stays open, stated rather than papered over:** entry KINDS are the source's, so a
derived Pathfinder block can still print a *Legendary Actions* heading, which Pathfinder does not have.
That is N5 working as designed — prose is translated, not regenerated — and rewriting a creature's action
economy per system is a different project from rebuilding its numbers. Recorded here as the honest edge of
what "native" currently means.

---

## Phase N3 — generation and surfacing

### N3-1 · `npm run derive:native` — **DROPPED, and the lens is why**

The plan was to generate `nat-<sys>:<source-slug>` rows for ~20,000 derived blocks and store them. N3-3
shipped without needing any of them: `deriveNativeStatblock` is pure, total and cheap, so the lens derives
**at render time** instead of reading a stored row.

That is not a shortcut taken to save a slice — it is strictly better on the thing this plan cares about
most. A stored derived row goes **stale** the moment the tier tables change, and the tables are a
*measurement* that moves whenever the corpus grows. Deriving live means correcting one table row fixes every
creature at that tier on the next page load, with nothing to regenerate and no window where the catalogue
disagrees with itself. It also removes the whole class of N3 collision risk: no derived row exists to
collide with a published one, so `import:*` stays re-importable by construction rather than by care.

**What it costs, stated plainly:** derived blocks are not queryable — you cannot filter the bestiary by "PF2
AC ≥ 20" across derived creatures, because those numbers do not exist until a page renders. Nothing asks for
that today. If something does, this is the slice to bring back, and it should generate a *cache* keyed to
the tier tables' version rather than a catalogue row.

### N3-2 · Spot-check — **DONE inside N2-1** (the skunk table above, read by hand against both systems'
measured rows). The per-system COVERAGE half of this slice moves to N4-1, where it belongs.

### N3-3 · The system LENS — **SHIPPED 2026-07-30**, to the owner's spec verbatim

> *"The bestiary should just default to the 2024 edition. I want it so that the system that is currently
> being shown to the user is at the top of the stat block, and the user can click it to have a drop-down
> menu of all of the systems. If they select another system, then it should reload the stat block to show
> the corrected stats for the system chosen. This should be dynamic in real time."*
>
> *"This should do away with the whole 'USE IN ANOTHER SYSTEM' element at the bottom of the stat block."*

That is a complete UI spec and it replaces the current design rather than adding to it:

- **Default: `dnd5e-2024`** — matching the site-wide default settled the same day.
- **The system control sits at the TOP of the stat block**, not in a panel below it. It is the block's
  header, because it says what the numbers you are about to read *are*.
- **A dropdown of all four systems**, and picking one re-renders the block in place. *"Dynamic in real
  time"* means no navigation — so the block becomes a client component holding the chosen system, rather
  than the current `?to=` round trip.
- **`Use in another system` is deleted.** It is the same capability in a worse place, and keeping both
  would leave two controls that disagree about which system you are looking at.

Depends on N2-1: the lens is only worth having once switching produces genuinely different numbers rather
than the same ones with a warning list.

**All four points shipped**, in `app/dnd/_ui/bestiary/SystemLens.tsx`, with the `?to=` panel and its
`searchParams` round trip deleted from the creature page rather than hidden. 23 cases in
`__tests__/dnd/system-lens.test.ts`.

**The lens's real claim is an ORDER OF TRUSTWORTHINESS**, and that — not the dropdown — is the part worth
reviewing. `build()` picks, in order:

1. **Published** — the catalogue actually holds this creature in the chosen system. A designer's numbers.
2. **Derived** — rebuilt from that system's own measured tier table (N2-1).
3. **Converted** — the old transposition, for a system with no table of its own (IG), carrying what has a
   correspondence and NAMING what does not.

Get that order backwards and the page shows a derived block where a real Pathfinder stat block exists —
which **looks completely fine** and is simply the wrong creature. So the order is asserted directly rather
than left implicit in JSX, which is also why `build` is exported: a UI-only implementation would leave the
one claim that can be silently wrong unpinned.

**Identity across systems is the name, exactly and never fuzzily** (`loadSiblings`). The plan calls identity
"the hard part, and it is not the name" — true of grouping the whole catalogue, and a much smaller question
here: this is one creature's page asking *"is there a Pathfinder row for THIS thing?"*, and being wrong
shows a reader a block plainly labelled as another book's, beside the name it is filed under — visible and
correctable rather than silent. A slug cannot do the job because the catalogue's slugs carry their source
book (`pf2b3:skunk`, `tob2:alchemical-skunk`), so the name is the only thing two books share. The match is
`ilike` with **no wildcard**, re-checked in code after the query, because a prefix match is precisely how
"Badger" would pick up "Giant Badger". A failed lookup returns `{}` and degrades to derivation rather than
taking the page down.

### N3-4 · The derived badge (N4) — **SHIPPED on the page with N3-3**

`◆ Published` / `◇ Derived` / `◇ Converted` sits beside the system control, and each entry in the dropdown
carries `◆` where a published row exists — so the choice is informed *before* it is made, not explained
after. Derived and converted blocks always render their notes; a derived block with no explanation is the
exact lie G5 exists to prevent, and that is asserted for every system rather than checked by eye.

**Still open: the badge on the LIST row.** The list is where N7's duplicate problem actually shows, and it
needs the dedupe (below) before a badge on it means anything. *(Shipped with N3-6 — see the row badge
there.)*

#### Two bugs the 8,427-passing suite could not see

Both found by opening the Badger in a browser, and both worth recording because neither was a failure of
test coverage — they were failures of what the tests could reach.

**1 · The lens called our own conversion "◆ Published".** The page announced *D&D 5e (2024) ◆ Published*
for a creature no publisher has printed in 2024. `loadSiblings` was returning
`generate-transposed-bestiary.mjs`'s `Transposed from …` rows as siblings, so the lens's TOP rank — the one
reserved for *a designer wrote these numbers* — was being handed our own transposition.

It was invisible in every direction: transposition **carries** the source's AC and HP, so the block was
identical to the 2014 one and only the badge was lying. The lens suite asserted the trustworthiness order
correctly and could never have caught it, **because the defect was not in the ordering — it was in what got
called published on the way in.** A test that pins an order cannot see a bad input to that order.

Fixed at the query: a sibling must be a publisher's row, filtered in SQL and re-checked in code for the
same reason the name match is. The Badger now reads *◇ Derived* as 2024, with AC 11 / 4 HP from the
measured CR 0 row and the derivation stated.

**2 · The dropdown and the badge disagreed.** The menu showed no ◆ beside *D&D 5e (2014)* — the creature's
own system — and then rendered *◆ Published* the instant it was picked. `published` deliberately holds only
the OTHER systems, so a marker reading it alone answers "no" for the one system that is certainly yes. The
rule had been written out twice and the copies drifted; it is now one exported `isPublished`, and a test
asserts marker and badge agree **for every system** rather than checking either alone.

### N3-6 · One creature, one row in the LIST (N7) — **SHIPPED 2026-07-30**

N3-3 gave a creature one *page* that reads in any system. The bestiary INDEX still listed 5,025 rows for
3,659 creatures — Badger, Balor, Behir, Ghoul and Animated Armor each ten times. **Now 3,659 entries, with
1,366 duplicates folded away and nothing lost.**

**The ten Badgers were two different problems wearing one coat**, and finding that out is what made the
slice tractable:

| rows | system | source |
|---|---|---|
| 3 | `dnd5e-2014` | SRD 5.1 / Black Flag / Monstrous Menagerie — **three publishers** |
| 3 | `dnd5e-2024` | "Transposed from …" — **generated by us** |
| 3 | `intuitive-games` | "Transposed from …" — **generated by us** |
| 1 | `pathfinder2e` | Pathfinder Bestiary 2 — **a publisher** |

600 of the catalogue's rows are `generate-transposed-bestiary.mjs` output: a source system's numbers
carried onto another system's page. **N3-3's lens now does that at render time and does it better**, from
the target's own measured tier table rather than by carrying foreign figures. They are a stale cache of a
worse conversion, and the view ranks them last.

**Nothing is deleted, and that is not only caution.** N3 says a derived row must never overwrite a
published one, and that still holds; the fix is that **the LIST is a list of creatures while the ROWS are
storage** — `dnd_creatures_canonical` (seed 468) is that sentence made executable. Beyond it: 44 of the 600
generated rows carry fetched artwork with its own licence and credit (seed 467), and deleting rows to tidy
a list would destroy work we are obliged to keep.

**The one property the whole ranking rests on, measured rather than assumed:** the generated rows
contribute **zero distinct creature names** — 3,659 names across all 5,025 rows, and the same 3,659 across
the 4,425 published rows alone. So ranking generated rows last can never make a creature vanish. That could
be broken by a future import, so `npm run audit:bestiary` now fails HARD on it rather than trusting it:
a catalogue quietly losing creatures is worse than one that stops the build.

**Every filter became array containment, and that is a consequence rather than a preference.** Once one row
represents a creature, `system = 'pathfinder2e'` asks *"which system won the ranking?"* — and the Pathfinder
Badger would disappear from the Pathfinder filter because its 5e row was picked. The view unions `systems`,
`types`, `alignments` and `tags` across all of a creature's rows, and the facets read **the same view the
filters query** — a table scan left in place would have offered chips that describe a different catalogue
from the one the query returns.

**Known imprecision, stated rather than papered over:** system and type are unioned independently, so
`pathfinder2e` + `beast` matches a creature published in Pathfinder and typed "beast" in its 5e row. It is
a real creature in both facets rather than a phantom, and a per-system facet key buys precision nobody has
asked for at the cost of a filter nobody can read.

**What it costs, in one line:** "Adult Red Dragon" is printed at two different CRs across books, and one
entry now shows one of them. `row_count`, `systems` and `published_systems` exist so the entry can SAY it
stands for four rows instead of implying it is the only one — which is what the N3-4 row badge renders.

#### It shipped as a plain view, and the browser said no

Worth recording because the instinct was wrong in a specific, reusable way. A plain `VIEW` is the right
default — always correct, nothing to refresh — and it made the bestiary return **500 Internal Server
Error** on `?system=dnd5e-2014&type=beast`:

| query | plain view | materialized + indexed |
|---|---|---|
| `count(*)` over the whole view | 123 ms | 88 ms |
| one array filter | **4,064 ms** | 79 ms |
| two array filters | 2,317 ms | 79 ms |
| one sorted page of 60 | 2,276 ms | 82 ms |

Postgres cannot index through a window function, so every request re-ranked all 5,025 rows and
re-aggregated the lateral unnest **before** filtering. PostgREST issues a count and a page, the facets add
two more reads, and four multi-second scans per page load is past the statement timeout.

The detail that makes it a lesson rather than a slow query: **the one-filter case is the SLOWEST of the
four.** A filter matching more rows costs more, so the catalogue growing makes it worse — "it is only
5,000 rows" was exactly the wrong instinct.

**What materializing costs, and why it is paid rather than waved at.** The fold becomes a snapshot, so a
creature imported after the last refresh is catalogued and **invisible in the list** — this repo's
signature defect (content that exists behind no surface) reintroduced by a performance fix. Three things
close it:

1. The table changes only by a deliberate script run, and **all four writers now refresh when they
   finish** (`import:bestiary`, `import:bestiary:pf2`, `generate:bestiary`, `art:creatures`).
2. `refresh_dnd_creatures_canonical()` is one call, `CONCURRENTLY` so it never blocks a reader, with a
   fallback for the never-populated first run.
3. `npm run audit:bestiary` **fails hard** on staleness by comparing the snapshot's own `sum(row_count)`
   against the live table count — exact, so it catches one added or deleted row rather than only a new
   creature name. **Verified by inserting a row inside a rolled-back transaction:** 5,026 rows against
   5,025 folded, detected, catalogue untouched.

The unique index that `REFRESH CONCURRENTLY` requires does a second job for free: it makes
one-entry-per-creature a **constraint**, so a future ranking bug that produced two rows for one name fails
the refresh instead of silently double-listing.

Guarded by `__tests__/dnd/bestiary-canonical.test.ts` (19 cases) across the SQL, the indexes, the refresh
wiring in all four scripts, the query, and the card — plus the audit's hard checks against live data.

---

## Phase N4 — the honest ceiling

### N4-1 · Coverage and confidence report — **SHIPPED 2026-07-30** (`npm run audit:natives`)

The slice was written expecting `nat-<sys>:*` rows to count. N3-1 was dropped, so there are none — which
makes this a **better** question than the one planned: not *"how many rows did we generate?"* but
***"for how many creatures can the lens actually produce an answer, and what kind?"*** That is what a
reader experiences. Measured across all 3,659 creatures × 4 systems, in the same order of trustworthiness
`SystemLens.build` uses — auditing a different order would measure a page nobody is looking at:

| system | published | derived | converted |
|---|---|---|---|
| `dnd5e-2024` | 3 (0.1%) | **3,656 (99.9%)** | 0 |
| `dnd5e-2014` | 2,271 (62.1%) | 1,388 (37.9%) | 0 |
| `pathfinder2e` | 1,587 (43.4%) | 2,072 (56.6%) | 0 |
| `intuitive-games` | 0 | 0 | **3,659 (100%)** |

Two things that table says plainly and no prose had:

- **The 2024 edition is almost entirely derived.** Only three creatures are published in SRD 5.2, so the
  site's default system is 99.9% our measurement. That makes N4-2's caveat load-bearing rather than
  decorative — it is what most readers will be looking at.
- **Intuitive Games is 100% converted**, with the single reason printed beside it: no creature-building
  table exists (N1-3). Honest, and visibly the one gap a licence could close rather than a bug.

**The one automatic check worth having: every derived AC and HP must EQUAL the tier row it claims.** The
derivation *is* the table lookup, so a mismatch means the two have drifted — a whole-catalogue error that
reads as perfectly normal numbers on any single page. Recomputed from the tier map rather than read back
off the result, because checking a derivation against its own answer agrees with itself no matter what the
table says. **Zero mismatches across ~7,100 derivations.**

**74 derivations rest on a tier measured from fewer than 10 creatures** — reported, not failed. A thin row
is a weaker claim, not a wrong one, and the block already says so in its own notes. Reported anyway because
"derived from the table" reads identically whether the row was measured from 250 creatures or from 4.

### N4-2 · What is still not promised — **SHIPPED 2026-07-30**

On every derived stat block, under the per-field notes:

> Built from *[system]*'s own measured tier tables at a defensible tier — **not hand-balanced for your
> table**. Whether this is a fair fight for a particular party is a judgement no table can make. Read it
> before you run it.

Necessary precisely because the notes above it are good: a reader who follows every one of them could still
conclude the block has been balanced. The tables measure what creatures at a tier **are**, which is a
different claim from *"this is a fair fight for your party"*.

Shown on derived blocks only — **never on a published one**. A publisher's stat block carries no claim of
ours, and hedging it would mislead exactly as much as failing to hedge a derived one. `audit:natives`
prints the same sentence, so the page and the audit cannot drift into telling different stories.

---

## Slice order

**N1-1 → N1-4** tables + tier map → **N2-3** the per-system study → **N2-1 → N2-2** the derivation →
**N3-1 → N3-2** generate + spot-check → **N3-3 → N3-4** the lens and the badge → **N4-1 → N4-2** coverage.

Each slice: typecheck + lint + tests + a sample read against the published table, committed on its own.

## Why this stays good

The bestiary's existing transposition is honest and unusable; a hand-authored per-system catalogue would be
usable and unmaintainable at 20,000 blocks. Deriving from each system's **own published table** is the only
version that is both — and because the tables are data, a correction to one row fixes every creature at that
tier at once, which is the same property that made auras and taxonomy hold up.
