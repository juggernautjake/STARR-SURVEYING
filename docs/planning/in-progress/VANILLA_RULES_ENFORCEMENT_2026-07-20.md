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

### S3 — Enforce in the spell picker ✅ SHIPPED 2026-07-20
The reported bug is now closed on the player route: a level-4 vanilla Wizard sees Wish greyed,
labelled "not available", with the Add button **disabled** and the reason on hover. A custom
character gets "＋ Anyway" and the spell lands carrying `offRules` — the reason it was outside
the rules. 12 new tests; one older test **reversed on purpose** (`spell-picker.test.ts` asserted
the warn-only behaviour and cited the legitimate-exception argument; that argument is now served
by `extraSpells` rather than by enforcing nothing).
**The handler re-checks, not just the button.** `disabled` is an affordance, not an enforcement
point — `add()` returns early on a blocked spell so no stale render or programmatic click walks
through it.
**The DM is explicitly exempt** (`isVanilla && !elig.ok && !isDM`): blocking a DM grant would
make their job impossible. Their grants land marked `granted by the DM — <reason>`, so the sheet
distinguishes "the DM gave me this" from "I took this outside the rules".

**`provenance.ts` cannot carry this marker** — worth knowing before S6 plans to reuse it. It asks
*"does this content exist in the system?"*; Wish does, so it classifies as vanilla. The question
here is *"was it legal for THIS character at THIS level?"* — a different question, so off-rules
picks carry their own `Spell.offRules` field. **S6 should be re-planned accordingly.**

### S4 — Same treatment for feats ✅ SHIPPED 2026-07-20
As predicted, this was the gate and not new logic: `featEligibility` was already consulted and
its reason already displayed — the picker then offered "＋ Anyway" to everyone, which made
"rules-legal by default" a suggestion. Now `blocked = isVanilla && !elig.ok && !isDM` disables
the button, `add()` re-checks, and a custom character's off-rules feat lands carrying `offRules`
on the created feature. 9 tests. Same shape as S3 throughout, deliberately — two pickers that
enforce differently is how one of them silently stops enforcing.

### S5 — Close the other two doors ✅ SHIPPED 2026-07-20
The pickers were never the whole story: both the AI's `add_spell` and the grant route write the
same edit vocabulary without passing through a picker, so "ask the AI for Wish" would have stayed
a working exploit. New `lib/dnd/rules-gate.ts` (`gateEdits` + `refusalSummary`) is called by
`ai-edit`; `buildGrantEdits` takes the rules directly. 22 tests.

Decisions worth keeping:
- **The gate judges against the CATALOG, not the edit.** The AI supplies its own `level` field —
  trusting it would let a model declare Wish a level-1 Wizard spell and walk through. Tested.
- **Every input is server-derived**: variant from stored metadata, DM flag from the access check,
  class/level from the saved sheet. Nothing in the request body decides whether rules apply, or a
  caller simply declares itself custom. Tested with `expect(src).not.toMatch(/enforce:\s*body\./)`.
- **`offRules` is NOT in the AI tool schema.** Server-set only — otherwise "this isn't off-rules"
  becomes a claim the model makes rather than a fact the server checks.
- **`buildGrantEdits`'s rules argument is REQUIRED**, with an explicit opt-out arm. An optional
  one gets forgotten and fails open — the exact hole being closed.
- **Refuse, never rewrite.** Downgrading "add Wish" to something castable would be worse than
  either allowing or refusing it: the player would be told they got something they didn't.
- **Per-edit, not all-or-nothing**, and every refusal is reported — a partly-applied batch that
  claims success reads as the AI ignoring what was asked.
- **Uncatalogued spells pass.** Homebrew makes no claim to be official content, and refusing it
  would block a real use rather than the exploit.

**Known gap, deliberately not papered over:** feats reach a sheet as `add_feature`, which carries
no feat key, so the gate can't reliably resolve one back to a catalog feat. Name-matching would
refuse legitimate homebrew features. The feat PICKER (S4) is gated; the AI/grant feature path is
not. Closing it properly needs an `add_feat` op — **tracked as S7 below.**

### S6 — Mark off-rules content on the sheet ✅ SHIPPED 2026-07-20
`OffRulesMark` (⚑) renders beside `EditMark` on the spells panel and the features list, carrying
the reason in its tooltip. 10 tests, including that `offRules` survives `applySheetEdits` — a
marker set by the gate and then dropped on the way to storage would be worse than no marker,
since every consumer would read the content as legal.

- **Its own glyph, on purpose.** ✎ = hand-edited away from how it came; ★ = something is
  modifying this right now; ⚑ = legitimately held, but not by the ordinary rules. Different
  questions; an element can carry all three.
- **DM gifts read differently from rules-breaks** — teal "legitimately yours" vs amber "outside
  the rules". Collapsing them would tell a player they had cheated when the DM handed it over.
- **Invisible on an ordinary sheet.** A flag that shows up everywhere becomes noise everyone
  learns to ignore, which is the same as not having it.
- Used `provenance.ts`? No — see S3's note. It asks whether content exists in the system (Wish
  does); this asks whether it was legal for this character.

### S7 — Close the feat door properly (found during S5)
`add_feature` carries no feat key, so the gate cannot tell "the Grappler feat" from a homebrew
feature named Grappler. Add an `add_feat` op keyed to the catalog and route feat grants through
it; `add_feature` stays for genuine homebrew and stays ungated. Needs the AI tool schema and
ai-scope's exhaustiveness guard updated in step.

---

## Done means

- A vanilla level-4 Wizard CANNOT add Wish, a Cleric spell, or a 5th-level spell, by any route.
- A custom character can add all three, and each is visibly marked.
- A DM can still grant anything to anyone, and it lands marked as granted.
- Subclass expanded lists still work — no legal choice is blocked.
- `npx tsc --noEmit`, `npx vitest run __tests__/dnd`, **and `npm run build`** green per slice.
