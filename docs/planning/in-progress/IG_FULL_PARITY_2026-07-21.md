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
| Catalogued | ✅ | ⚠ partial, honestly reported | ✅ |
| Reachable | ✅ | ✅ | ⚠ builder only |
| Gated | ✅ | ✅ | ✅ |
| Editable | ✅ | ✅ | ❌ |
| Authorable | ✅ | ✅ | ❌ |
| Computing | ✅ | ✅ | ⚠ partial |

IG is the weakest on editing — it could ADD catalogued content and remove it, but never CHANGE what
it held or author anything new, and it had no way to add or edit a weapon at all.

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

### IG-S3 — Sheet pickers
IG can only add content from the BUILDER. The sheet needs the same picker PF2 got, so content can be
added after build without the AI.

### IG-S4 — Weapons reach the maths
Confirm IG attacks resolve through the rules engine with their properties, the way PF2 Strikes do
via `pf2ResolveStrike`. IG's model stores `damage` as a base die plus `bonusToHit`/`bonusDamage`,
which is already the right shape — this is verification and wiring, not new maths.

### IG-S5 — Catalog completeness audit
Confirm every IG content kind on intuitivegames.net is catalogued, and that
`igCatalog()` surfaces all of them. IG is small enough that "complete" is genuinely reachable here,
unlike PF2.

---

## PF2 remainder (tracked in `PF2_FULL_BUILDOUT_2026-07-20.md`)

The PF2 doc stays open on **catalog long-tail only** — 208 of ~1,500 spells, 805 feats. Its
infrastructure meets all six criteria above. That is authoring passes, not slices, and
`PF2_CATALOG_STATUS` reports every gap truthfully so nothing claims completeness it lacks.

## Open questions for the owner, recorded rather than guessed

1. **Homebrew scope** — per-character (assumed, matching 2024) or promoted to a shared per-campaign
   library other characters can draw from?
2. **Archives of Nethys sourcing** — two PF2 tranches (classes, ancestries) were authored using AoN
   after I said I would avoid it, because my agent prompts did not carry that constraint. The facts
   are ORC-licensed mechanics and were paraphrased, but the boundary I stated was not enforced.
   Re-deriving gets more expensive as content layers on top.

## Done means

- All six criteria hold for IG.
- `npx tsc --noEmit`, `npx eslint`, whole-repo `npx vitest run`, and `npm run build` green per slice.
- Every slice committed and pushed.
