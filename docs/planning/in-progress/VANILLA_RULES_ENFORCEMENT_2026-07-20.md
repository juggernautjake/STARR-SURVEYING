# Vanilla characters obey the rules; custom characters are warned

**Status:** IN PROGRESS · started 2026-07-20
**Goal:** a character built with the **vanilla** builder can only ever take what its class, level
and system actually grant — enforced with a HARD BLOCK, not a warning. A **custom** character can
take anything, but every off-rules choice is flagged so the player knows what they've done.

## The problem, stated exactly

A level-4 vanilla Wizard can currently add **Wish** to their sheet. Verified 2026-07-20 across
all three routes a spell can reach a sheet:

| Route | Class list | Spell level | Verdict |
|---|---|---|---|
| `SpellPicker` (player) | defaults on, **warns only** | flags "above your slots", **warns only** | not enforced |
| `buildGrantEdits` (library give-to-character) | none | none | not enforced |
| `add_spell` (AI edit op) | none | clamps 0–9 only | not enforced |

There is **no `lib/dnd/spells/eligibility.ts`**. Feats have one and it works; spells never got the
equivalent.

**Why the current design is wrong.** The picker deliberately warns rather than blocks, and its
comment justifies that: subclasses, feats, scrolls and the DM all legitimately grant off-list
spells. That reasoning is sound *for the DM grant path* and wrong for *a player building a
vanilla character* — the distinction the platform already draws for feats: rules-legal by
default, custom as the EXPLICIT escape hatch.

## Ground rules

1. **Vanilla = hard block.** Ineligible content cannot be added. Shown, greyed, with the reason —
   "why can't I take this?" is a question the sheet should answer, not hide.
2. **Custom = allowed + flagged.** Never blocked, always marked, so an off-rules choice is
   visible on the sheet rather than silently indistinguishable from a legal one.
3. **The DM override survives.** A DM granting a spell is legitimate and must not be blocked —
   but it lands marked as granted, not passed off as a normal class pick.
4. **Legitimate exceptions are rules, not loopholes.** Subclass expanded lists (Warlock Pact of
   the Tome, Cleric domain spells, Wizard ritual book) genuinely widen what a vanilla character
   may take. The eligibility core must model these, or it will block legal choices — which is
   worse than the current permissiveness, because it makes the builder wrong in the other
   direction.

---

## Slices

### S1 — Spell eligibility core ✅ SHIPPED 2026-07-20
`lib/dnd/spells/eligibility.ts` + 21 tests. `spellEligibility(spell, ctx) → { ok, reason }`,
mirroring the feats core. The reported bug is now decidable: a level-4 Wizard is refused Wish
("level-9 spell; a Wizard at character level 4 can cast up to level 2") and refused Sacred Flame
("not on the Wizard spell list").
**Reads the class's real slot table, never `level ÷ 2`.** A test pins the Paladin at level 4 to a
ceiling of 1, not 2 — the arithmetic shortcut is wrong for every half-caster, and the Warlock's
pact ranks are their own schedule again. Non-casters get 0.
**Fails CLOSED on missing data:** a sheet with no class set is refused rather than allowed, since
failing open would silently restore the original bug for exactly the sheets most likely to have
it.
Exceptions modelled: `extraSpells` makes a granted spell legal off-list (a subclass expanded
list, a pact boon) while still respecting the slot ceiling — being handed Wish does not give a
level-4 character 9th-level slots. `annotateEligibility` keeps ineligible spells in the list so a
builder can grey them WITH the reason rather than hiding them.

Original plan:
`lib/dnd/spells/eligibility.ts`, mirroring `feats/eligibility.ts`:
- `SpellContext`: system, class(es), character level, subclass, known spell list, slot table.
- `spellEligibility(spell, ctx) → { ok, reason }`, checking the class list and the spell level
  against the character's ACTUAL highest slot (not level ÷ 2 — a Paladin's progression differs).
- Cantrips are never slot-gated. Rituals follow the class's ritual capability.
- Pure + exhaustively tested, including the exceptions above.

### S2 — Expose the vanilla/custom flag to the sheet ✅ SHIPPED 2026-07-20
`variantKind` now flows: character page → `readActiveSlotMeta` (the ACTIVE slot's own metadata,
not an assumption) → `SheetRoot` → `CharacterProvider` → `useChar()`. 8 tests.
**Defaults to `'vanilla'` at the store**, deliberately: `readActiveSlotMeta` reports ABSENCE
(`kind: undefined`) rather than guessing, and the store supplies the safe default. The property
that matters is that the CHAIN ends at vanilla — a legacy or unlabelled sheet obeys the rules
rather than escaping them. Defaulting to custom would have let every existing sheet silently
bypass the enforcement this whole doc is about.
A test asserts the flag is in the context VALUE, not only its type — a type-only addition
compiles happily and hands every consumer `undefined` at runtime.

Original plan:
`SheetVariantKind` exists (`system-variants.ts`, defaults `'vanilla'`) but the sheet store does
not surface it, so nothing can gate on it. Thread it into `useChar()` as `variantKind` and make
the default explicit and safe.

### S3 — Enforce in the spell picker
Vanilla: ineligible spells greyed, Add **disabled**, reason shown.
Custom: Add enabled, labelled "＋ Anyway", and the added spell carries an off-rules marker.

### S4 — Same treatment for feats
The feat picker currently warns and offers "＋ Anyway" to everyone. Under the new rule, vanilla
must hard-block it. The eligibility core already exists — this is the gate, not new logic.

### S5 — Close the other two doors
`buildGrantEdits` and the AI `add_spell` op both currently bypass everything. A DM grant stays
legal and lands marked; a player-initiated grant to their own vanilla character obeys the rules.

### S6 — Mark off-rules content on the sheet
An off-rules spell/feat should be visibly flagged wherever it renders, so a DM reading a sheet
can see what was taken outside the rules. `provenance.ts` already classifies
vanilla/custom/dm-granted — reuse it rather than inventing a parallel marker.

---

## Done means

- A vanilla level-4 Wizard CANNOT add Wish, a Cleric spell, or a 5th-level spell, by any route.
- A custom character can add all three, and each is visibly marked.
- A DM can still grant anything to anyone, and it lands marked as granted.
- Subclass expanded lists still work — no legal choice is blocked.
- `npx tsc --noEmit`, `npx vitest run __tests__/dnd`, **and `npm run build`** green per slice.
