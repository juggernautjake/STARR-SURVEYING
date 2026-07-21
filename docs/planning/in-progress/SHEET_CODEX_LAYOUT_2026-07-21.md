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
| Give-to-character | ✅ | ✅ (this session) | ✅ | ⚠ verify |
| Glossary coverage | ✅ | ✅ | ✅ 92 entries | ✅ |
| Conditions with full text | ✅ | ✅ | ✅ | ✅ |

The gaps that remain are **PF2's catalog long tail** (tracked in its own doc) and **IG's
give-to-character path**, plus a systematic check that every condition/stance/skill in every system
has glossary text a tooltip can show. That last one is CX-12 and is the owner's explicit ask.

---

## Slices

### CX-1 — Layout seam
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

### CX-12 — Glossary coverage sweep
Every condition, stance, skill, damage type and rules term in all four systems has glossary text, so
every tooltip and `RuleTip` has something to show. A coverage test that FAILS on a term with no
article, per system — the honest-coverage pattern used by the spell catalogs.

### CX-13 — IG give-to-character
Confirm and close the one library→sheet path not verified above.

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
