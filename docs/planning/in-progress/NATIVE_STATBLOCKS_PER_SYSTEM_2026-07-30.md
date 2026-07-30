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

## Phase N1 — the published tables

### N1-1 · `lib/dnd/statblocks/tables/dnd5e.ts`
The DMG's *Monster Statistics by Challenge Rating*: for CR 0–30, the expected AC, HP band, attack bonus,
damage-per-round band, and save DC. Pure data + a lookup. **Acceptance:** a test asserts monotonicity (AC and
HP never decrease as CR rises) and spot-checks three published rows against the book.

### N1-2 · `lib/dnd/statblocks/tables/pathfinder2e.ts`
Monster Core's *Building Creatures*: per level −1…24, the AC, HP range, attack bonus, striking damage, and
the three save values at each of its tiers (extreme/high/moderate/low/terrible). PF2's table is
**multi-tiered per statistic**, which 5e's is not — that difference is the whole reason this is two files
rather than one shape with a flag.

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
### N3-3 · The bestiary's system control becomes a LENS, not just a filter.
Today the System chips narrow which creatures you see. The owner's *"if we switch to PF2, all the stat
blocks should be geared towards that"* wants a viewing system that persists across the list and the creature
page, showing each creature's native block for that system where one exists and saying plainly where it does
not.
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
