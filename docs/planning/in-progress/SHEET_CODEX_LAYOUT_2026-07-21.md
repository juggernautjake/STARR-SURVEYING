# The Codex sheet layout, tooltips that actually explain, and full library↔sheet integration

**Status:** IN PROGRESS · started 2026-07-21

## Owner ask, verbatim

> I want to create a new style of character sheet. I want it so that we have the character art at the
> top left of the character sheet. Then just below that should be the name and class and race and
> level and character owner, and the system that the current character sheet is built for. Then
> beneath that should be the character's health and all of the health related controls. then beneath
> that should be the AC and if they have inspiration toggle. Then beneath that should the characters
> ability scores with the bonuses they may or may not provide. Then beneath that should be buttons to
> control rest and stuff. IF there is anything else that should be shown there, then figure that out
> and make that decision to show it. All of this info should be in a vertical column that takes up
> about a third of the width of the page. On the other side, we should have tabs that are tall and
> placed vertically one on top of the other and are labelled vertically too. […] the first tab, which
> is the skills tab, will be open by default. […] This section will be vertically, not horizontally,
> resizable. […] if we click another tab, the current tab doesn't close and open the new one, it just
> resizes a bit and goes to a specific default height to also reveal the new tab section as well. The
> elements and information in the tabs should properly reformat to be as well displayed as possible no
> matter what height the section is set to […] If enough tabs are opened, there will be a second
> vertical scroll bar […] IF you have any improvements you think would make this system better for a
> better viewing experience, then please implement your suggestions and recommendations.

Plus, in the same message:

> Also, there seem to be some places and elements that have that little information question mark in a
> circle flag/marker next to them, but whenever I hover over it doesn't tell me anything.

> Please make sure that both the 2024 dnd edition and the 2014 are fully built out in the library and
> are both fully integrated with the character sheets. […] Make sure that pathfinder 2e and Intuitive
> games are also hooked up in the library in the same way and that all of the spell and tool tip info
> is fully built out for every condition and stance and skill and everything.

---

## Decision 1: this is a new LAYOUT, not a replacement

The existing sheet (`app/dnd/_sheet/App.tsx`) is a horizontal tab bar with exactly one pane open at a
time, above a `Hero` + `StatRail` header. It is used by every character on the platform.

**The Codex layout ships alongside it, selectable, and does not replace it.** Reasons, in order of
weight:

1. **Every existing character uses the current layout.** A destructive replacement would change the
   sheet under people mid-campaign, including sheets in live streamed games.
2. **The platform already has the right seam.** `getSheetConfig(sheetType)` resolves a character's
   `sheet_type` into a *skin* (bespoke CSS) plus a *module list*. Layout is a third, orthogonal axis:
   any layout should work with any skin and any system. Adding `layout` beside `skin` costs one field
   and keeps the streamer skin, the Hextech palettes and the module gating all working unchanged.
3. **The two layouts suit different tables.** One pane at a time is better on a phone; the stacked
   Codex is better on a wide monitor where a player wants Skills and Spells visible together. Keeping
   both is a feature, not a hedge.

So: `char.sheetLayout: 'classic' | 'codex'`, defaulting to `'classic'`, with a switcher beside the
existing `SkinSwitch`.

**Naming:** `codex` for the id, "Codex" in the UI. The defining feature is several simultaneously-open
reference panes, which is what a codex is.

---

## Decision 2: panes reflow by CONTAINER size, not viewport

The owner's requirement — *"elements and information in the tabs should properly reformat to be as
well displayed as possible no matter what height the section is set to"* — cannot be met with media
queries, because media queries describe the **viewport**, and a pane's height is set by dragging, not
by the window.

**CSS container queries** (`container-type: size` on the pane, `@container` rules on its contents) are
exactly this feature: content responds to its own container's dimensions. This is the single most
important technical decision in the doc, and getting it wrong means rebuilding the reflow logic later.

Baseline: container queries are supported in all current evergreen browsers. A fallback is specified
in CX-4 for anything older — the pane simply keeps its roomiest layout and scrolls, which degrades
gracefully rather than breaking.

---

## The left identity column

One third of the width, in the owner's stated order. Everything below is already computed by the
existing engine; this is composition, not new maths.

| # | Block | Contents |
|---|---|---|
| 1 | **Portrait** | Character art, using the existing framing (focus point + zoom from `TokenFramer`) so art already framed on the classic sheet carries over. |
| 2 | **Identity** | Name · class & subclass · species/race (2014 says "Race", 2024 says "Species" — the library already keys this per edition) · level · owner · **game system**. |
| 3 | **Health** | Current/max HP, temp HP, hit dice, death saves, damage/heal controls. |
| 4 | **Defence** | AC, and the Inspiration toggle where the system has one. |
| 5 | **Abilities** | The six scores with their modifiers, and save proficiency. |
| 6 | **Rest & recovery** | Short rest, long rest, and the system's own recovery actions. |

### What else belongs there — the owner delegated this call

Added, each with a reason:

- **Conditions and active effects.** These change every number above them. A player reading AC 15 while
  Frightened needs to see *why* without hunting. This is also where the ★ effect markers live.
- **Speed, initiative, proficiency bonus.** Consulted constantly; cheap in space.
- **Passive Perception** (5e) — asked for by DMs mid-session more than almost anything else.
- **Concentration**, when the system has it. A caster losing track of concentration is one of the most
  common table errors, and the sheet already tracks it.
- **A compact currency line.** Already modelled by `lib/dnd/currency.ts`.

Deliberately **not** in the column, with reasons: inventory (belongs in a pane; too long), spell lists
(same), full feature text (same), the roll log (it needs width, and it is cross-cutting — CX-7 gives
it a docked position instead).

**System-adaptive by construction.** PF2 has no Inspiration and does have Hero Points, three-action
economy and four-step proficiency; IG has stances and its own damage-save model. The column renders
from a **per-system descriptor**, not from a 5e-shaped hard-coded list — otherwise this is a new place
for exactly the edition bleed the rest of the platform works to prevent.

---

## The right-hand pane stack

### Model

```ts
type PaneId = 'skills' | 'abilities' | 'combat' | 'attacks' | 'spells' | 'features' | 'gear' | 'story' | …
type Pane = { id: PaneId; height: number }   // px; stack order follows the canonical tab order
type StackState = { open: Pane[] }
```

- A **vertical rail** of tall tab buttons with vertically-written labels (`writing-mode: vertical-rl`),
  one per available pane, gated by module and system exactly as the classic tabs are today.
- **Skills is open by default**, per the ask.
- Clicking a closed tab **opens** its pane without closing anything.
- Panes render stacked in canonical order — *not* click order. Predictable position beats recency;
  a player reaching for Spells should find it in the same place every time. (Drag-to-reorder is CX-9.)

### Opening arithmetic

When a pane opens and the stack would overflow, existing panes shrink **proportionally toward their
minimum** to make room, then the new pane takes `DEFAULT_PANE_H`. If they are all already at minimum,
the stack scrolls instead — the owner's "second vertical scroll bar". No pane is ever shrunk below
`MIN_PANE_H`; below that it renders header-only (collapsed), which is a state, not a size.

Constants: `DEFAULT_PANE_H ≈ 380px`, `MIN_PANE_H ≈ 120px`, `COLLAPSED_H ≈ 40px`.

### Resizing

A grab bar at each pane's bottom edge, `cursor: ns-resize`, visible on hover and focus and **always
visible on touch** (where hover does not exist).

### Improvements beyond the ask — recommended, with reasons

1. **Clicking an open tab closes its pane.** Without this there is no way to close one, and the stack
   only ever grows. A `×` on the pane header does the same thing more discoverably.
2. **Keyboard resizing.** The drag handle is a `role="separator"` with `aria-valuenow`; ↑/↓ adjust by
   24px, Home/End go to min/max, Enter toggles collapse. Drag alone is mouse-only, which would make
   the whole layout unusable by keyboard — not acceptable for a primary surface.
3. **Double-click the handle to fit content.** Sizes the pane to its natural height, capped at the
   viewport. The fastest way to "just show me all of it".
4. **A solo/maximise button per pane.** Collapses every other pane. The common case of "I need the
   whole screen for Spells right now" without closing anything.
5. **Persist open panes and their heights**, per character, in `localStorage`. This is a *view
   preference*, not character data — it must not write to the sheet, must not create edit-history
   entries, and must not sync to other viewers. A DM peeking at a player's sheet should not disturb
   their layout.
6. **Respect `prefers-reduced-motion`** on the open/shrink transition.
7. **Remember the last-used layout per user**, so a player who picks Codex is not sent back to classic
   on their next character.
8. **A "reset layout" control**, because any persisted-layout feature eventually strands someone in a
   state they cannot undo.

### Reflow behaviour per pane height

Driven by `@container` breakpoints on the pane, not the viewport:

| Pane height | Behaviour |
|---|---|
| Collapsed (≤40px) | Header only, with a count badge ("Skills · 18"). |
| Short (≤200px) | Densest form: single-line rows, no descriptions, numbers right-aligned. Internal scroll. |
| Medium (≤420px) | Multi-column grid where the content suits it; short descriptions. |
| Tall (>420px) | Full presentation — descriptions, grouping headers, inline editors. |

Internal scrolling is on the pane body, never the page, so the rail and the identity column stay put.

---

## Responsive and mobile

Below roughly 900px the two-column split stops working: a third of a phone screen is unusable. The
Codex layout **collapses to a single column** — identity column first, then the pane stack full width,
with the rail becoming a horizontal scrolling strip of tabs. Multiple panes may still be open; they
simply stack down the page.

This is a real design decision rather than a fallback: on a phone the Codex becomes a long scroll of
open sections, which is a legitimate way to read a sheet and is closer to how paper sheets work.

---

## The tooltip problem — diagnosed before designing a fix

The owner reports markers that explain nothing on hover. Investigation found a real and specific
cause, plus a second latent problem.

### What is on the sheet today

| Marker | Component | How it reveals |
|---|---|---|
| ⓘ | `_sheet/components/InfoTip.tsx` | Real popover: hover, focus, AND tap. Works well. |
| ⓘ (different!) | `_ui/InfoTip.tsx` | Separate component, topic-keyed off `BUILDER_HELP`. Also a popover. |
| ★ | `ui/EffectStar.tsx` | Popover (plus a native `title`). |
| ⚑ | `ui/OffRulesMark.tsx` | **native `title` only** |
| ✎ | `ui/EditMark.tsx` | **native `title` only** |
| ⚙ | `ui/OptionsMark.tsx` | **native `title` only** |
| ? | `_ui/CampaignPreferencesDm.tsx` `InfoDot` | **native `title` only** |
| ? | `_ui/HouseRulesPanel.tsx` | **native `title` only** |

### The cause

**The native `title` attribute is the problem.** It takes about a second of steady hover, is
mouse-only, never appears on touch, and is invisible to most screen-reader flows. Five of the eight
markers above rely on it exclusively — including the two circled `?` markers the owner described.

This is not a new discovery: `_sheet/components/InfoTip.tsx`'s own header comment says the sheets
"showed in-play effects with a native `title`, which is mouse-hover ONLY — invisible on the tablets a
table actually uses". **The fix was written and then applied to only some of the markers.** The same
"authored but not wired everywhere" shape that this session already found in the spell catalog.

Every marker checked *does* guard against an empty tip (`OffRulesMark` returns `null` without a
reason; `HouseRulesPanel` renders only when help exists), so the text is not missing — it is just
unreachable by the interaction the owner is using.

### The fix

1. **One tooltip primitive.** Merge the two `InfoTip` components into a single `Tip` that supports
   hover, focus, tap, and Escape-to-dismiss, and reconcile the duplicate.
2. **Convert every native-`title` marker to it.** Keep `title` as a redundant fallback; add nothing
   that relies on it alone.
3. **Every marker must state what it MEANS, not just its data.** The owner's instinct — *"If it is
   trying to say that thing is custom or that there is more info to be read about it, then it needs a
   tool tip that fully explains what it is for"* — is exactly right. ⚑ should not merely say
   "outside the rules: X"; it should say what the flag is for and why it is not an error.
4. **A test that no marker renders without a tip**, so this cannot regress silently.

---

## Library ↔ sheet integration

The owner wants all four systems reachable from the library, giving content to characters, with full
tooltip/glossary coverage for conditions, stances, skills and everything else.

Current state, verified rather than assumed:

| | 2024 | 2014 | PF2 | IG |
|---|---|---|---|---|
| Spell catalog | ✅ 405 | ✅ 319 (SRD-complete, this session) | ⚠ partial, honestly reported | n/a (powers) |
| Library page | ✅ | ✅ | ✅ | ✅ |
| Faceted spell browser | ✅ | ✅ (this session) | ✅ | n/a |
| Give-to-character | ✅ | ✅ (this session) | ✅ | ✅ (CX-13 — was broken, see below) |
| Glossary coverage | ✅ | ✅ | ✅ 92 entries | ✅ |
| Conditions with full text | ✅ | ✅ | ✅ | ✅ |

The gaps that remain are **PF2's catalog long tail** (tracked in its own doc), plus a systematic
check that every condition/stance/skill in every system has glossary text a tooltip can show. That
last one is CX-12 and is the owner's explicit ask. **IG's give-to-character path is closed by CX-13**,
which found it delivering IG content into the shared 5e blob with no gate and no provenance.

---

## Slices

### CX-1 … CX-9 — THE CODEX LAYOUT ✅ SHIPPED 2026-07-21

Built as one coherent layout rather than nine separate ships, because the slices below are not
independently useful — a pane stack with no resizing is not a thing anyone would use. What
follows is what was actually decided, including the parts that changed during the build.

**Files:** `_sheet/codex/` (`descriptor.ts`, `paneMath.ts`, `usePaneStack.ts`, `PaneStack.tsx`,
`IdentityColumn.tsx`, `CodexLayout.tsx`), `_sheet/components/LayoutSwitch.tsx`,
`_sheet/styles/codex.css`, `char.sheetLayout` on the type, the branch in `App.tsx`, and
`__tests__/dnd/codex-layout.test.ts` (31 tests).

**The branch sits INSIDE the themed root, and that placement is the whole skin story.** The skin
class (`skin-<id>`), the streamer's `variant-<id>` and the theme CSS variables all live on the
`.dnd-sheet` wrapper. Rendering the Codex inside it means every skin and every colour theme
applies with no Codex-specific rule — and `codex.css` contains none. A test fails if a
`.skin-x .codex-…` selector ever appears, because that would mean a skin had started fighting
the layout instead of theming it. This was verified in a browser: the QA character's skin
restyles the Codex without a line of work.

**The identity column renders from a per-system descriptor, and the interesting decision is what
it does NOT model.** PF2 and IG get 5e's Inspiration, death saves, hit dice and Passive
Perception *suppressed*, not translated. The tempting alternative — render Hero Points and
stances here — is wrong: this engine's `Character` has nowhere to store them, so the control
would write to nothing, or to a field their own bespoke sheets do not read. A player would
toggle a Hero Point and find it absent on the PF2 sheet a scroll away. Instead the column
carries a pointer line naming where those numbers live, so an absent block reads as "it is over
there" rather than "this sheet forgot". Their absence is asserted by test *and* argued in the
file header, because the obvious instinct on reading the descriptor is to "fix" the gap.

**Reflow is by container query, never media query.** A pane's height is set by dragging, so a
media query — which describes the window — would reflow every pane identically regardless of how
tall each actually is. `container-type: size` asks the only question that matters. Four density
tiers, mirrored in `densityFor()` for content CSS cannot reach, with the JS and CSS breakpoints
pinned to each other by test since they are two encodings of one decision.

**The opening arithmetic shrinks by equal FRACTION of slack, not equal pixels.** Equal pixels
drive a small pane to its minimum while a large one barely moves, which reads as the layout
picking a victim. When everything is already at minimum the stack SCROLLS rather than shrinking
further — the owner's asked-for second scrollbar, and strictly better than a column of
unreadable slivers.

**Pane sizes persist to localStorage and explicitly NOT to the sheet.** Which panes are open is a
per-viewer view preference: a DM peeking at a player's sheet must not rearrange it for them, must
not fire their autosave, and must not land in their edit history. A test asserts `usePaneStack`
never calls `setChar`.

Smaller calls, each for a reason: the resize handle is a `role="separator"` with arrow/Home/End/
Enter keys, because drag alone is mouse-only and this is a primary surface; collapsing preserves
the stored height so expanding restores the player's size; closing a pane leaves its neighbours
alone rather than growing them into the gap; and panes stack in canonical order, not click order,
so Spells is always in the same place.

**One bug the tests could not have caught, found by driving it in a browser.** With a single pane
open — the DEFAULT state — no resize handle rendered, because of a rule excluding it from a lone
last pane. The arithmetic was correct and fully tested; what was wrong was a rendering condition
in the exact state every user starts from and no fixture sits in. Fixed in `01d2e653`. This is
the second time this session that browser verification caught something unit tests structurally
could not, and it is the argument for CX-14 not being optional.

### CX-1 — Layout seam (original plan, superseded by the entry above)
`char.sheetLayout` (`'classic' | 'codex'`, default `'classic'`), a `LayoutSwitch` beside `SkinSwitch`,
and `App.tsx` branching to `<CodexLayout>`. Ships doing nothing visible except offering an empty
Codex. Proves the seam without touching the classic path.

### CX-2 — Identity column
The six ordered blocks plus the additions above, from a per-system descriptor so PF2 and IG get their
own (Hero Points, stances) rather than a 5e-shaped column.

### CX-3 — Pane stack, static
Vertical rail with vertical labels; open/close; canonical stack order; Skills open by default. Fixed
heights, no resizing yet — so the stack model can be tested before drag maths lands on top of it.

### CX-4 — Resizing
Drag handles, the proportional-shrink opening arithmetic, min/collapse states, keyboard resizing,
double-click-to-fit, and the container-query fallback.

### CX-5 — Container-query reflow
The four density tiers per pane, applied to Skills first, then the rest.

### CX-6 — Persistence
Open set + heights in `localStorage`, per character. Explicitly NOT on the sheet: no edit history, no
sync. Plus "reset layout".

### CX-7 — Cross-cutting furniture
Where conditions, active effects, the roll log and the dice tray live in this layout. They are
currently rendered above the classic tab bar and have no obvious home in a two-column split.

### CX-8 — Mobile
Single-column collapse below ~900px; rail becomes a horizontal strip.

### CX-9 — Polish
Drag-to-reorder panes, solo/maximise, reduced-motion, last-used-layout memory.

### CX-10 — One tooltip primitive
Merge the two `InfoTip`s into `Tip`; hover + focus + tap + Escape.

### CX-11 — Convert every marker
⚑ ✎ ⚙ and both `?` dots onto `Tip`, each with text explaining what the marker MEANS. Test that no
marker can render without a tip.

### CX-12 — Glossary coverage sweep ✅ SHIPPED 2026-07-21
Every condition, stance, skill, damage type and rules term in all four systems has glossary text, so
every tooltip and `RuleTip` has something to show. A coverage test that FAILS on a term with no
article, per system — the honest-coverage pattern used by the spell catalogs.

**The table above was wrong.** It recorded "Glossary coverage ✅" for all four systems. Measured
rather than assumed, the four systems covered **68 of 244** terms a tooltip can be handed — 28%.
Conditions were largely fine (which is why the row looked green); **skills, damage types and stances
were almost entirely absent**, and IG had no condition articles at all.

| | 2024 | 2014 | PF2 | IG |
|---|---|---|---|---|
| before | 15/46 | 15/46 | 29/74 | 9/78 |
| after | **46/46** | **46/46** | **74/74** | **78/78** |

- **`lib/dnd/glossary/coverage.ts`** computes the DEMAND SURFACE from each system's own content —
  never a hand-kept list, because a hand-kept list goes stale and the test then passes while the
  tooltip is empty, which is worse than no test. `__tests__/dnd/glossary-coverage.test.ts` fails by
  name on any term with no article, and additionally holds every article the demand *reaches* to the
  substantive-body bar, since coverage that resolves to a one-liner is still an empty tooltip.
- **Coverage is exact term-or-alias, never `findTerm`'s prefix fallback.** Prefix matching is right
  for a search box and wrong for a coverage check: it certifies "Prone" as covered by an article
  called "Pronouncement". Asserted directly.
- **PF2 and IG articles are DERIVED from their catalogs, not retyped.** `data/conditions.ts` and
  `intuitive-games/content.ts` already hold the rules text under the same never-invent ground rules;
  a second hand-written copy is two rules that drift apart, and a rules reference that contradicts
  itself is worse than one with a gap. Hand-authored articles always win where both exist.
- **5e skills and damage types went in `dnd5e-shared.ts`**, because both books define them
  identically — and while writing them I put 2014's contested-grapple rule into a shared Athletics
  article, which is exactly the CX-16 bleed. Caught before commit; the shared articles now point at
  each edition's own `Grappled` entry rather than picking a winner.
- **A real find in `library.ts`.** Its search drops a catalog entry when the glossary covers the same
  term. Once every skill and stance had an article, that silently emptied `skill`, `stance` and
  `combat-skill` out of CX-15's kind filter. The glossary hit now **inherits the catalog's kind**, so
  the richer body and the library's own taxonomy both survive.

**Recorded rather than invented** (`GLOSSARY_KNOWN_GAPS`): IG has **no per-skill rules text anywhere
in the repo** — the source page was truncated when `content.ts` was captured — so all 36 IG skill
articles state the governing ability, the check maths and the combat-skill resolution, then say
plainly that the per-use breakdown is not published. They read thinner than 5e's, and that is the
correct outcome: filling that space confidently would mean borrowing another game's skill. Also
recorded: seven PF2 skills have no catalogued skill actions, and PF2's spirit/holy/unholy damage is
absent because nothing in the repo attests them as damage types.

### CX-15 — Library search results are reachable ✅ SHIPPED 2026-07-21
*Owner: "make sure that in the library, the search works to pull up the names of things related to
our search, and that it applies the filters that are given if any are given, and the results show
beneath the search bar and we can click them to be taken to see the full information."*

Checked each clause against the live code rather than assuming. Search itself worked — debounced,
live, grouped by system, results beneath the bar. **The clickthrough did not exist**: every hit
rendered as a plain `<div>`, so a reader could see that a rule existed and had no way to open it,
which is the one thing a search result must do. Only the system heading was a link.

Shipped:
- **Every hit is now a link.** `lib/dnd/library-anchors.ts` resolves kind → section → entry anchor,
  and is the SHARED source for both the search box's href and the id the page stamps on the element
  — because if those two ever disagree the link fails *silently*, navigating to an anchor nothing
  carries. A test asserts every kind `librarySearch` can emit maps to a section a real page renders,
  reading the kind list out of the source rather than a hand-kept copy.
- **`DeepLinkOpener`** — the non-obvious half. Every section and entry is a native `<details>`,
  default-closed, so a bare anchor link scrolls to a collapsed one-line strip and reads as broken.
  It walks up opening every ancestor, then scrolls, then flashes a highlight (skipped under
  `prefers-reduced-motion`). Also bound to `hashchange`, or only the first link of a session works.
- **A kind filter**, built from the kinds actually present in the current results rather than a
  fixed list of ~26 internal names — so no filter is ever offered that would return nothing. It
  clears whenever results change, because a filter held over from a previous query silently hides
  matches for the new one. The count reports "6 of 42" when filtered, since "42 matches" above 6
  rows reads as a rendering bug.
- **`BackToTop`** on every system library page. It moves FOCUS to the search input, not just the
  viewport — a keyboard user scrolled to the top with focus left at the bottom would have to tab
  through the whole page, which is worse than no button.

Deliberately NOT done: spells link to the system page rather than a `#spells` anchor, because spells
have no section — `SpellBrowser` owns them, with facets a static section could not do. Returning
`null` for that kind is a deliberate answer, and the test distinguishes it from an unmapped kind
(which would also return null and be a real bug).

### CX-16 — Edition bleed audit, fixed and guarded ✅ SHIPPED 2026-07-21
*Owner: "make sure that the 2014 spells are all really from the 2014 edition and that the 2024
spells are really all from the 2024 edition and that they didn't bleed into each other."*

**The result was the opposite of what I expected, and that is the useful part: the 2014 catalog was
clean.** Membership, source strings, object identity, levels and ritual flags all passed. Every
confirmed fault was in **`dnd5e-2024.ts`**, carrying a 2014 value forward. All four fixed, each
asserted in `__tests__/dnd/edition-bleed.test.ts` in the same commit as its fix:

1. **`contagion`** — the worst. The 2024 record *was* the 2014 spell entire, `attack: true` and all,
   so a 2024 Cleric's sheet rendered an attack button and rolled to hit for a spell that cannot
   miss, and never surfaced the Constitution save the 2024 version is built around. Now a save for
   11d8 necrotic plus Poisoned.
2. **`mass-cure-wounds`** — healed 2014's `3d8`; 2024 heals `5d8`.
3. **`cone-of-cold`** — missing Druid from the 2024 class list.
4. **`greater-restoration`** — missing Paladin and Ranger.

**The tell, worth keeping for the next audit:** in cases 2–4 each spell's own `editionNote` already
stated the correct difference while the data contradicted it. The notes were right and the values
stale — so these were detectable from inside the repo with no external source at all. A cheap
future check is simply "does a record agree with its own editionNote?"

Still open and recorded in the test rather than fixed: several 2024 records omit the very field
carrying their 2024 change (`counterspell` and `power-word-stun` have no `save`, `spiritual-weapon`
lost `attack`/`damage`, `flame-strike` lists half its damage). While those are blank the catalogs
read as identical however far apart the rules are, which is *why* bleed survives undetected.

### CX-17 — PF2/IG system isolation: 4 confirmed bleeds — B1, B2, B4 ✅ FIXED 2026-07-21; B3 held for the owner
The architecture holds — the import graph is clean, content dispatchers are correctly scoped, and
PF2 and IG each define their own conditions, proficiency, skills and action economy. All four
bleeds live in **shared modules above the subsystems**; nothing inside `lib/dnd/systems/*` reaches
sideways. Recorded in `__tests__/dnd/system-bleed.test.ts` as a self-cleaning `KNOWN_BLEED` map:
each entry asserts the *current wrong behaviour*, so fixing one fails the test and forces the record
to be deleted — bug and documentation die together.

- **B1 (HIGH)** `sheet-edits.ts` `resolveFeat()` is hardcoded to `FEATS_2024` and `gateEdits()`
  calls it for every system. "Toughness" exists in 5e, PF2 and IG — on a PF2/IG sheet it resolves to
  the **5e** feat and is judged by 5e slot eligibility, so a legal PF2/IG feat can be REFUSED using
  another system's rules. The `add_spell` arm twenty lines below routes correctly through
  `findSpellForSystem`. Sibling branches, one scoped, one not.
- **B2 (HIGH)** `library-grant.ts` calls `findWeapon2024`/`findArmor2024` without consulting
  `req.system`, so a PF2 or IG "Longsword" arrives with 5e stats including a 2024-exclusive Weapon
  Mastery property that exists in neither PF2, IG, nor 5e-2014.
- **B3 (MED-HIGH)** IG is given **PF2's** four-step ±10 degree ladder; IG's own rule is a five-step
  ladder on ±20 with Partial Success on an exact tie — corroborated by its own system-rules text,
  the Critical Focus feat, the Expanded Critical enchantment, and ~30 IG spells with a Partial
  Success outcome the current type cannot represent.
- **B4 (MED)** `currency.ts` gives PF2 an explicit case and everything else the 5e `default:` arm,
  so IG sheets start with 5e coins including Electrum despite IG having its own authored currency.

**Resolution (2026-07-21).** B1, B2 and B4 are fixed; their `KNOWN_BLEED` entries are deleted as
that map's contract requires, and replaced by §6 `the fixed bleeds stay fixed`, which asserts
BEHAVIOUR rather than source text — the staleness checks were `toContain` source reads, which is
the right shape for pinning a bug you are not fixing and the wrong shape for guarding a fix.

- **B1** `resolveFeat(ref, system)` — system is now REQUIRED, not defaulted, so the compiler names
  every call site that has to decide rather than letting a new one reintroduce the bug silently.
  Only 2024 has a catalog in this shape; every other system gets `[]` and falls through ungated,
  which is correct — PF2 and IG each have their own gate. Both routes that can carry a non-5e
  character (`ai-edit`, `grant-content`) now pass the character's real system into
  `applySheetEdits` too; the gate had been system-aware while the apply silently defaulted to 2024,
  so a feat could pass a correctly-scoped gate and be written with 5e rules text one line later.
- **B2** `equipmentFor(system)` dispatcher. 2024 keeps mastery, 2014 gets real damage and NO
  mastery (the field is absent from `WeaponDef2014` by design, so the compiler stops a 2024 value
  being pasted in), PF2 and IG get nothing — a named item with no invented statistics, which is
  the honest outcome given both model weapons entirely differently.
- **B4** `DEFAULT_CURRENCIES_IG` — Penny 1 / Coin 10 / Solidas 20, transcribed from `IG_CURRENCY`.
  IG sheets no longer start holding Electrum, a coin in no edition of IG.

**One correction to the record above.** B1's entry named *Toughness* as the canonical collision.
That was wrong: Toughness is not in `FEATS_2024` at all (2024's is called "Tough"), and 2024 shares
**no** feat name with Pathfinder 2e. The entire overlap is with Intuitive Games and it is exactly
four names — Alert, Lucky, Great Weapon Fighting, Two-Weapon Fighting. The bug was real and the fix
is unchanged, but the harm was IG-only, not PF2. Alert is the sharpest case: 2024 origin feat
(Initiative proficiency) vs IG general feat (never flat-footed, prereq Training in Perception), and
since `slot` defaults to `asi`, an IG character taking IG's own Alert was refused by 5e's category
rules. The test now asserts the collision list instead of describing it, so a wrong example cannot
survive in prose again.

**B3 still NOT fixed, deliberately.** It changes IG combat maths and touches existing tests, so it
needs the owner's sign-off rather than my judgement — it is a rules change, not a bug fix.

### CX-15b — the search clickthrough was still broken, and the CX-15 test did not catch it ⚠ FOUND 2026-07-21

Driving the library in a browser — the same discipline that caught the Codex handle bug — showed
CX-15's headline claim was **not true in practice**. Searching "grappl" on the 2014 library page
returns 5 correct results, each a link, as CX-15 says. Clicking the Grappled result navigates to
`#entry-grappled`, and **nothing on the page carries that id**. The reader clicks a result and
lands nowhere. Same for `skill` (Athletics) and `feat` (Grappler).

**Root cause:** `page.tsx` stamps `entryAnchorId` only on `s.entries` — the per-entry `<details>`
collapsibles. Sections rendering their content as `s.chips` (Conditions are bare `<span>` chips),
`s.body` or `s.table` stamp no per-entry id at all. Weapons and armor use `entries` and deep-link
correctly, which is exactly why this looked fine when spot-checked. Separately, the glossary DOES
carry per-term anchors, but under a `term-` prefix rather than `entry-`, so for many terms the
text is on the page under a different id than the link points at.

**The lesson is about the test, not the code.** CX-15's test asserted that every kind maps to a
section a real page renders — and it passed throughout, because it checked the SECTION and never
that an ENTRY id was actually stamped. It verified the half of the contract that was working.
CX-15's own doc entry states the risk correctly ("if those two ever disagree the link fails
*silently*") and then tested the wrong half of it. A `toContain` source check cannot see a
rendering path that was never taken.

Fix and a test that pins the real invariant are in progress; the fallback that matters most is
`DeepLinkOpener` degrading to the kind's section when an entry id resolves to nothing, so that no
future gap of this shape can ever be silent again.

### CX-13 — IG give-to-character ✅ SHIPPED 2026-07-21

Confirmed broken, then fixed. The ⚠ in the table above was right to be there.

**What was actually wrong.** `grantKindForSection` mapped all four IG sections — powers, defensive
powers, feats, stances — to the shared kind `feature`, and `buildGrantEdits`' `feature` arm emits
`add_feature` against the 5e-shaped `Character` blob. An IG character's real model is the SIDECAR at
`data.ig`, edited through `applyIgEdit` and judged by `gateIgEdit`. So one button produced three
failures at once, and the middle one is the serious one:

- **Wrong model.** The power was not in `ig.powers`, so the IG sheet's power list, its digest, its
  AI grounding and its provenance badges all went on saying the character did not have it.
- **No gate.** The `feature` arm checks *nothing* — no eligibility, no marking, not even a name
  lookup. Every rule IG-S1/S2 built lives in `gateIgEdit`, which this path never called. Verified
  live before the fix: a **vanilla** level-1 Arcanist was granted **Entangle**, an off-class power,
  `200 OK`, no complaint. The library was a way around the gate the sheet's own picker enforces —
  the same shape of hole as Area MV, in a new costume.
- **No provenance.** A DM grant is legitimately unbound but must land MARKED. Nothing marked it.

One correction to the original trace: the content was not *invisible*. `SheetRoot` renders the
shared sheet below the IG sheet, so the granted feature did appear — as a 5e feature, on a sheet
that is not the character's. That is a different failure from vanishing and arguably a worse one,
because it looks like it worked.

**The fix.** IG grants get their own kinds (`ig-power`, `ig-defensive-power`, `ig-feat`,
`ig-stance`) and route through IG's OWN gated edit path, so a granted power is applied, judged and
marked by exactly the code the sheet picker and the AI already use — one place deciding what an IG
character may hold, which is the only arrangement two paths cannot drift out of.

- **Four kinds, not one, because they land in four different fields** — `powers`, the single
  defensive-power slot, the feat buckets, the known-stance set. One shared kind cannot say which,
  which is precisely how all four collapsed into `add_feature` to begin with.
- **`gateIgEdit` is reused verbatim, gating `add_power` and nothing else.** Feats and stances stay
  ungated, per IG-S2: IG feat prerequisites are free prose and a stance may legitimately be held off
  a class list. Adding a check here would be the mirror image of a bleed.
- **An `add_stance` op had to be added.** The known set (`ig.stances`) was writable only at build
  time, so the sheet could *enter* a stance it had no way to record having learned. `add_stance`
  adds to the known set and deliberately not to `combat.stances` — being taught a stance is not
  standing in it, and conflating them would silently drop the stance the character was holding.
- **IG content offered to a NON-IG character is refused**, not quietly delivered as a named feature.
  An IG power on a 2024 wizard is an edition bleed (CX-17) arriving in exactly the "drop a name on a
  sheet and call it done" shape Ground Rule 2 forbids.
- **Conditions were the same bug through a second door, and mechanically load-bearing.**
  `igResolveAttackInPlay` reads `ig.combat.conditions`, so a condition written to the shared blob was
  a penalty the sheet displayed and the rolls never paid. Conditions now route to the IG model when
  the target is an IG character.
- **No note field on IG grants.** IG stores content by name and reads its rules from the catalogue;
  its only per-element text is `customEffects`, and presence there IS the ✎ hand-customized signal
  (IG-S1). Pre-filling it with the entry's own unmodified library text would stamp a pristine grant
  as edited — a marker meaning the opposite of the truth.
- **No `dnd_sheet_edits` row**, matching the `ig-edit` route. Those rows are SheetEdit-shaped and the
  revert path replays them against the shared blob, so an IG edit recorded there would hand
  `revertBatch` a 5e op aimed at a sidecar it does not own. IG edit history is a real gap; it is one
  gap, not a reason to invent a broken half of it here.
- **Items, glossary features and spells still take the 5e path on purpose.** IG has no free-form
  feature list and no inventory, so there is no faithful landing spot, and the shared sheet that
  renders below the IG sheet is a real place for them to live.

**Browser evidence** (dev server, a QA IG Arcanist created directly in the DB and deleted after):
granting **Elemental Blast** from the library's Powers section landed in `ig.powers`, rendered on the
IG sheet with its catalogue effect text, and left the 5e `features` array empty. Granting **Detect
Thoughts** to the same *vanilla* character was refused in the dialog with the gate's own sentence —
*"Detect Thoughts is not a Arcanist power. This is a vanilla character — build a custom one, or have
the DM grant it."* Flipped to *custom*, the same grant succeeded and stored
`ig.offRules['Detect Thoughts']`, which renders on the sheet as ⚑ "outside the normal rules". Stance,
feat and defensive-power grants each landed in their own field and rendered.

**A false alarm worth recording, because it nearly shipped.** Mid-verification the whole `data.ig`
sidecar vanished after a grant, and the obvious reading — `applySheetEdits` normalizes to a
`Character` and drops what it does not model — was wrong. `applySheetEdits` starts from
`structuredClone(input)`, so sidecars survive; what destroyed it was the *sheet client* rebuilding a
blank character, which it only does for a blob with no 5e fields at all — the shape my hand-built
fixture had and no real character has. The PATCH payload from a realistic character carries `ig`
intact. A one-line "defensive" merge and a dramatic comment about data loss were written and then
removed: the honest artefact is a test pinning the invariant (a 5e-shaped grant leaves `data.ig`
untouched), so a future normalization inside `applySheetEdits` fails a test rather than a sheet.

Two smaller things found and left alone, both outside this slice: `igPowerEligibility` composes
"not **a** Arcanist power" (article agreement, cosmetic, lives in IG-S1's file), and
`applySheetEdits` throws on a blob with no 5e fields — reachable only via a hand-written row.

**Files:** `lib/dnd/systems/intuitive-games/grant.ts` (new), `…/edit.ts` (`add_stance`),
`app/api/dnd/characters/[id]/grant-content/route.ts`, `app/dnd/_ui/GiveEntryButton.tsx`,
`app/dnd/_ui/GiveToCharacter.tsx`, `__tests__/dnd/ig-library-grant.test.ts` (17 tests).

### CX-14 — Codex QA pass
Drive it in a browser: build one character per system, open every pane, resize to extremes, verify
reflow and that no tooltip is empty. Folds into the standing final-QA slice.

## Done means

- Codex is selectable, and the classic layout is untouched for everyone who does not pick it.
- Every pane reflows by its own height, scrolls internally when it must, and is keyboard-operable.
- No marker anywhere on the sheet relies on a native `title` alone, and none renders without text.
- All four systems are reachable from the library, can give content to a character, and have glossary
  text behind every term a tooltip might show.
- `npx tsc --noEmit`, `npx eslint`, whole-repo `npx vitest run`, `npm run build` green per slice.
