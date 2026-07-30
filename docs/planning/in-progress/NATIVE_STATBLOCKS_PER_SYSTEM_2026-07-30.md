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

### N3-5 · Variants as a carousel beneath the stat block
`dnd_creature_variants` already holds **4,378** weak/elite derivations with a stated derivation sentence
each, and the creature page renders them as a plain list. The owner wants a carousel under the block, and —
the part that matters — ***"all differences in the variant stat block should be noted."*** That is a diff,
not a badge: show the variant's numbers with what changed from the base called out, which is exactly what
`deriveVariant`'s derivation string already records and the page currently does not surface per-field.

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

### N1-4 · The tier map `lib/dnd/statblocks/tier.ts`
CR ↔ level, with its basis written down (N2). Both systems intend a "creature of tier X is a fair fight for
a party of level X" reading, so the mapping is close to identity — but *close to* is not *is*, and the
fractional 5e CRs (⅛, ¼, ½) map to PF2's −1/0/1 rather than to a fraction.

---

## Phase N2 — the derivation

### N2-1 · `deriveNativeStatblock(source, target)`
Takes a creature and a target system; returns a stat block whose numbers come from the target's table at the
mapped tier, whose prose is the source's, and whose every derived field carries a one-line note. Pure and
tested, like every other transform in this codebase.

### N2-2 · Per-system character
Beyond the numbers, each system has shape: PF2 wants three saves and modifiers, 5e six saves and scores, and
strikes are written differently. Most of this already exists (`transposeCreature`, `abilityMods`,
`igCreatureEntries`) and is composed here rather than rewritten.

### N2-3 · What each system does that the others do not
The research slice the owner asked for — *"study how each system works"*. Read each system's own creature
rules and record, per system, what a native stat block MUST carry that a converted one currently lacks.
Written into this doc as findings before N2-1 is trusted.

---

## Phase N3 — generation and surfacing

### N3-1 · `npm run derive:native` — one system at a time, upserting `nat-<sys>:<source-slug>` rows (N3).
### N3-2 · Report and spot-check. Coverage per system, and a sample read by hand against the table (N6).
### N3-3 · The system LENS — specified precisely by the owner, 2026-07-30

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

### N3-4 · The derived badge (N4), on the row and on the page.

---

## Phase N4 — the honest ceiling

### N4-1 · Coverage and confidence report
Per system: how many creatures have a native block, how many are transposed-only, and which fields are
derived versus published. Exits non-zero on a native block whose numbers fall outside its own table's band —
the one thing that IS checkable automatically.

### N4-2 · What is still not promised
A standing note in the UI and this doc: derived blocks are built from the system's own tables at a
defensible tier. They are not hand-balanced encounters, and a DM should read one before running it. Saying
this once, clearly, is worth more than an unqualified claim nobody can verify.

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
