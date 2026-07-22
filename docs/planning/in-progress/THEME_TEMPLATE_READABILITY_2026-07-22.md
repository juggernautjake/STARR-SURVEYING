# Theme × style × template readability

**Status:** IN PROGRESS · started 2026-07-22

## Owner ask (verbatim)

> Take some time to think about how all of the themes get applied to each style and template. Make sure it's
> built so everything is really appealing, but also so words and fonts are easy to read and things are set up
> well on each theme and template. Some combinations produce results that make it tough to see everything that
> needs to be seen. Just work on making this better if possible.

## The shape of the problem

There are FOUR orthogonal axes that multiply into the look of a sheet:
- **System** (`character.system`): 5e-2014 / 5e-2024 / PF2 / IG.
- **Style / skin** (`sheet_type`): the bespoke skins (lazzuh, hextech, …) — each redefines the `--*` /
  `--hx-*` token palette.
- **Template / layout** (`data.sheetLayout`): Classic / Codex / Dashboard / Play.
- **Theme / colour variant** (`data.skinVariant`): the per-skin colour set (gold / shadow-isles / pink …).

Legibility lives in the TOKENS: `--ink` (body text), `--muted` (secondary), `--line` (borders), the accent
hues, and the panel/void backgrounds. A combination "makes it tough to see" when a token pairing has too
little contrast on a given skin×variant — e.g. `--muted` text on a `--panel` that a particular variant
darkened, or an accent used as text that a variant desaturated. Because every component reads the same
tokens, the fix belongs in the TOKEN definitions (or a small set of guardrails), not in per-component patches.

## Slices

- [ ] **TR-1 — token contrast audit (code-inspectable half).** Enumerate every skin × variant's resolved
  `--ink` / `--muted` / `--line` / accent-as-text against its `--panel` / `--void` background and compute the
  WCAG contrast ratio for each pairing (a pure function over the token tables + a test that FAILS a pairing
  below a threshold: ~4.5:1 for body text, ~3:1 for large/secondary). This turns "some combos are hard to
  read" into a concrete, enumerated list WITHOUT a browser, and pins it so a future skin can't regress.
- [ ] **TR-2 — fix the failing pairings.** For each pairing TR-1 flags, nudge the offending token for that
  skin×variant (lighten a too-dark `--muted`, raise `--line` alpha, swap an accent-as-text for `--ink`) until
  it clears the threshold, WITHOUT changing the intended look elsewhere. Re-run TR-1 to green.
- [ ] **TR-3 — font legibility pass.** Audit body/label font sizes + line-heights across the templates for
  anything below a comfortable floor (the owner's ~13.5–14px body target already applied on IG); ensure the
  display font is only used for headings/numerals, never long text; confirm `letter-spacing` on uppercase
  labels doesn't smear at small sizes on any skin.
- [ ] **TR-4 — per-template layout sanity.** Confirm each template holds up on each skin: Codex identity
  column + panes, Dashboard grid, Play columns, Classic tabs — no clipped text, no invisible control, no
  element that a particular variant's background swallows. This is the visual half — done in the QA phase on
  the fresh Vercel build (the local dev server serves stale compiles), driven by the TR-1 list so it's
  targeted rather than a blind sweep.

## Done means
- Every system × skin × template × theme renders with legible body/label text (meets the contrast + font
  floors), the display font reserved for headings, and no combination where needed information is hard to see.
- The contrast guardrail test keeps new skins/variants honest.

## Relationship to D-6
This SUPERSEDES and widens D-6 (`completed/ROLLER_UX_AND_CODEX_TABS_2026-07-22.md`), which was the narrower
"readable Codex section text on every style/theme" and was routed to QA. TR-1/TR-2 give it a code-verifiable
spine; TR-4 is the visual sweep D-6 described.
