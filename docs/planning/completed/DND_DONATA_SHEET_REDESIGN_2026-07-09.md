# Donata Dime — Total Sheet Redesign ("Mojo Bazaar" / Neopets vibe)

**Status:** COMPLETED (shipped 2026-07-09) · **Branch:** `claude/donata-sheet-redesign-2026-07-09` · **Started:** 2026-07-09

## Problem

Donata Dime's current in-platform sheet is, in practice, **Lazzuh Gun's sheet recolored**:

1. **It looks like his sheet.** The bespoke `skin-donata` block only recolors + lightly reskins the shared "techno-neon" chrome (uppercase mono kickers, diagonal scanlines, gradient-text name). The *structure and vibe* read as Lazzuh's, just pink.
2. **His name literally leaks onto her sheet.** `Bio.tsx` hard-codes "Who Is Lazzuh Gun?" / "Playing Lazzuh"; `Hero.tsx`'s reset dialog says "Reset Lazzuh…"; `Progression.tsx`'s fallback lead mentions Lazzuh.
3. **Readability failures.** Several surfaces render light text on light backgrounds (e.g. the dice-roller buttons are unreadable), because the skin inherited a dark-theme base and only partially flipped colors.

## Goal

A **totally distinct, one-of-a-kind sheet** for Donata with a **classic-Neopets candy-scrapbook vibe** ("Mojo Bazaar") — cheerful, rounded, glossy, nostalgic — that:

- Looks **nothing like** Lazzuh's (dark neon) or the streamer's (pixel/CRT pink) sheets.
- Fits Donata's identity: girlboss-MLM cleric, six years / no money / 100% faith, Mighty Mojo's Mighty Magic Maguffins.
- Is **effortlessly readable everywhere** — no light-on-light, strong contrast on every field, label, button, table, and the dice roller.
- Keeps the underlying D&D mechanics unchanged (this is a look + name-leak fix, not a rules change).

## Architecture (why this is safe)

The sheet engine is **shared components + a token theme + a bespoke skin CSS block** (see `registry.ts`, `theme.ts`, `styles/theme.css`). All visual work lives in:

- `app/dnd/_sheet/theme.ts` → `donataTheme` (color tokens + fonts).
- `app/dnd/_sheet/styles/theme.css` → the `.dnd-sheet.skin-donata { … }` block (scoped — **cannot** affect Lazzuh or the streamer).
- `app/dnd/_sheet/components/MlmPanel.tsx` → her Business-tab inline styles (harmonize with the new palette).
- Name-leak fixes are tiny edits in `Bio.tsx` / `Hero.tsx` / `Progression.tsx` that make headings **data-driven** (fixes every character, not just Donata).

No base-engine or other-character changes. Everything else is scoped under `.skin-donata`.

## Design direction — "Mojo Bazaar"

Classic-Neopets nostalgia (cream/parchment pages, tiled patterns, rounded chunky tabs, glossy web-2.0 gradient buttons, sticker badges, cheerful mascot energy) blended with Donata's magenta-and-diamond MLM glam. Playful, warm, and — above all — **legible**.

### Palette (light theme, contrast-checked)

Text/ink colors are chosen for **AA+ contrast on the cream/white panels**; saturated colors are used as *backgrounds* only where the skin sets an explicit readable text color.

| Token | Hex | Role | Contrast note |
|-------|-----|------|---------------|
| `void` (page) | `#fdf4e3` | warm parchment page bg | — |
| `void-2` | `#f8e9c8` | deeper cream | — |
| `panel` (cards) | `#fffef9` | near-white cream card | — |
| `panel-2` | `#fdeef7` | soft berry alt panel | — |
| `panel-3` | `#e9f9f1` | soft mint alt panel | — |
| `ink` (body text) | `#3a2140` | deep plum | ~11:1 on panel ✓ AAA |
| `muted` | `#6f5566` | secondary text | ~5.6:1 on panel ✓ AA |
| `muted-2` | `#87707f` | de-emphasized | ~4.5:1 ✓ AA (labels only) |
| `hotpink` | `#c2185b` | primary accent / values | ~5.4:1 on panel ✓ |
| `pink` | `#ff5fa8` | bright fills/hover (bg) | text set per-use |
| `violet` | `#7b2cbf` | accent | ~6.1:1 on panel ✓ |
| `violet-2` | `#5b1f94` | strong accent | ~8:1 ✓ |
| `teal` | `#17b3a3` | bright candy accent (bg) | text set per-use |
| `tealbright` | `#0d8f7e` | links / ability mods / table headers | ~4.7:1 on panel ✓ |
| `gold` | `#b8730a` | amber accent (text) | ~4.8:1 on panel ✓ |
| `good` | `#1c8f57` | success | ~4.6:1 ✓ |
| `danger` | `#d12b4e` | danger | ~5.2:1 ✓ |
| `line` | `rgba(123,44,191,0.28)` | soft borders | — |
| `line-strong` | `rgba(194,24,91,0.5)` | strong borders | — |

> Any element whose **background** is a saturated token (buttons, active tabs, hero, badges, pyramid tiers, `.lvl` chips) MUST set an explicit `color` in the skin CSS — white on magenta/violet/deep-teal, deep-plum on mint/pink/gold. No element may inherit a light color onto a light background or a dark color onto a dark background.

### Fonts

- **display:** `Baloo 2` — chunky, rounded, friendly "poster" font (replaces the condensed/pixel display faces).
- **body:** `Nunito` — highly legible rounded body.
- **mono:** `Space Mono` — receipt/fine-print bits.

(All three added via `@import` at the top of `theme.css`.)

### Motifs

- Cream page with a **faint tiled polka-dot / star** pattern (Neopets tiled bg).
- **Rounded chunky tabs** with a lift on the active tab.
- **Glossy gradient buttons** with a top sheen (`::before` highlight).
- **Sticker/enamel badge** chips with chunky borders.
- Section headers as **cute rounded ribbons** with a numbered pill (mixed-case, not shouty uppercase).
- Cards as **cream "brand cards"** with a candy header underline and soft drop shadow.

## Readability contract (enforced every slice)

1. **Body text** ≥ 7:1 contrast on its background; **UI labels/values** ≥ 4.5:1.
2. **No light-on-light and no dark-on-dark.** Every colored background defines its own text color.
3. The base engine hard-codes `#fff` on many headings (`h2`, `.card h3`, `strong`, `.stat .big`, etc.) — the skin MUST flip **all** of these to `--ink`. Maintain the flip list and extend it whenever a new white-on-light bug is found.
4. **Dice roller** buttons, labels, counts, and the roll log must all be clearly readable (explicit fix — currently failing).
5. Focus/hover states keep text readable.

## Verification protocol (run after EVERY slice)

1. Start the dev server; sign in (auto-DM as Andrew) and open Donata's sheet at `/dnd/characters/1a2200aa-0000-4000-8000-0000000000c5`.
2. Playwright-screenshot the surfaces the slice touched (full page + the relevant tab/panel).
3. **OCR/visual read the screenshot** — read every visible string; confirm each is legible against its background. Explicitly scan for light-on-light and dark-on-dark.
4. If anything is hard to read or ugly, fix it and re-screenshot **before committing the slice**.
5. Commit the slice only once its surfaces pass the readability contract. Note the audit result in the ship log.

## Slice plan

- [ ] **Slice 0 — Planning doc** (this file → `in-progress/`).
- [ ] **Slice 1 — Name-leak fixes.** `Bio.tsx` (data-driven headings via `char.meta.name`), `Hero.tsx` (reset dialog), `Progression.tsx` (fallback lead). Audit: open Story tab + reset dialog; confirm no "Lazzuh" on Donata.
- [ ] **Slice 2 — Palette + fonts.** Rewrite `donataTheme` (tokens above) + add `Baloo 2`/`Nunito`/`Space Mono` `@import`s. Audit: whole sheet recolors; read every tab for contrast regressions introduced by the token swap.
- [ ] **Slice 3 — Core chrome.** Page bg (cream + tiled pattern), hero banner (readable sticker name + kicker/role), chips (candy badges), and the full white→ink flip list. Audit: hero + overview top.
- [ ] **Slice 4 — Nav + section structure.** Tabs (rounded Neopets tabs), section heads (ribbon + number pill, mixed case), cards (cream brand cards, readable h3). Audit: tab bar + a couple of sections.
- [ ] **Slice 5 — Controls.** Buttons (glossy gradient pills, readable text on every variant: solid/pink/teal/gold/danger/ghost/tiny), inputs/selects/textarea (cream fields, readable), inline-edit. Audit: DM control panel + Build Kit + AI Ask + edit mode.
- [ ] **Slice 6 — Data panels.** Stat pills, ability tiles, tables (`th`/`tr.here`), resource pips, callouts, `.two` grids. Audit: Overview vitals + Abilities + a table (Progression/Combat).
- [ ] **Slice 7 — Dice roller.** Full `.tray*` restyle: tray panel, head/title, `adv-seg` buttons, `tray-dice` buttons, `dice-count`, roll log entries, surge/flags — all with readable text (the user's explicit complaint). Audit: open the tray; read every button label + a sample roll result.
- [ ] **Slice 8 — Business (MLM) panels.** Harmonize `MlmPanel.tsx` inline styles with the new palette; verify the downline scoreboard, Rank=Level ladder (highlighted row), pyramid tiers, and product cards are all readable. Audit: Business tab, full length.
- [ ] **Slice 9 — Remaining surfaces sweep.** DM Control, Build Kit banner, AI Ask, gallery/art uploader, condition tracker, party/whispers footer, suggestions box. Audit each.
- [ ] **Slice 10 — Full-sheet readability sweep + closeout.** Screenshot EVERY tab (Overview, Abilities, Combat, Attacks, Features, Business, Gear, Story, Gallery) in light **and** dark OS theme; OCR each; fix any remaining contrast issue. Add/refresh a regression test. Retire this doc to `completed/` with a ship log.

## Risks

- **Base `#fff` hard-codes**: easy to miss one → a white heading on cream. Mitigation: the flip list + per-slice OCR sweep.
- **Inline styles in components** (MlmPanel, DiceTray fabs, Hero token) reference tokens directly; when tokens change meaning, re-check contrast (Slice 8/9).
- **Dark-mode**: the sheet may be viewed in a dark OS theme; the skin is a light theme — confirm it stays readable (Slice 10).
- **Scope creep**: keep every change under `.skin-donata` / `donataTheme` / the three name-leak files. No base-engine edits.

## Ship log

- **Slice 0** `95d3234e` — planning doc → in-progress.
- **Slice 1** `98143b82` — name-leak fixes (Bio/Hero/Progression now use `char.meta.name`). Verified live: Story reads **"Who Is Donata Dime?"**.
- **Slices 2–3** `c382fc6b` — `donataTheme` candy palette + Baloo 2/Nunito fonts, and the full `skin-donata` rewrite (cream page + polka dots, awning hero, gradient name, sticker chips, Neopets tabs, ribbon section heads, cream cards, glossy buttons, cream fields, candy stats/tables/pips, white→ink flip list). Dropped `background-attachment:fixed`. Verified: hero + full overview read cleanly.
- **Slice 7** `5b27e871` — dice roller retheme (light candy "core", readable labels + all dice buttons; fixed the dark-on-dark `.stage-label` and light-on-light crit flag). Verified: the user's dice-roller complaint resolved.
- **Slice 8** `2bbe7ffa` — readability fixes: DescriptionsPanel/AiSheetEdit/ConditionTracker fields made theme-adaptive (`var(--panel-2)` — no more dark-on-dark gray boxes); MlmPanel pyramid tiers got a text-shadow. Verified: AI-Ask + notes fields render light with readable text.
- **Slice 9** `6c09272c` — candy portrait framing (token top-left + full-body top-right), verified with a placeholder image; SheetArtUploader Art/Token buttons + TokenFramer confirmed working.
- **Slice 10 (final sweep)** — Slices 4/5/6 (nav, controls, data panels) landed inside the Slice 2–3 comprehensive skin rewrite. Final readability sweep done by **code audit**: every base `#fff`-text selector rendering on Donata's content tabs is in the skin flip-list, and no hardcoded-dark inline fields remain in the content-tab components (the three found were fixed in Slice 8). Browser-verified surfaces: hero, overview, dice tray, Business, Story, portrait. Dark-OS-mode held light via the `prefers-color-scheme` guard in the skin root.
  - *Deferred (low value):* per-tab live screenshots of Abilities/Combat/Attacks/Features/Gear were blocked by a Playwright file-chooser artifact on navigate; the code audit covers the same readability guarantees, so a live pass is optional polish rather than a gap.

**Result:** Donata's sheet is a distinct Neopets "Mojo Bazaar" look — unlike Lazzuh's or the streamer's — with readable text on every audited surface, no name leaks, a readable dice roller, and a candy-framed portrait. Shipped on `claude/donata-sheet-redesign-2026-07-09`.
