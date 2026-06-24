# Module Card Progress Bars (gradient grey→yellow→green→blue)

**Status:** 🟡 In progress — module cards show a static status pill ("Not
Started"); turn it into a genuine, always-present progress bar whose fill and
color track completion.

## Goal (from the owner)

Every module/course card gets a progress bar showing how far the student is:

- **0% / nothing done:** grey bar, no color, label "Not Started" (or "Enrolled").
- **A little done:** yellow.
- **More done:** gradually greener.
- **Most done:** gradually bluer.
- **100%:** fully blue with a white checkmark and **"COMPLETED!"**.

The color must change **gradually and genuinely** with the real completion
amount — lots of intermediate shades from yellow → green → blue, not 3 buckets.
Reuse the existing "Not Started" element on the card for this.

## How this doc is driven

Stop-hook driven (`.claude/hooks/continue-until-planning-done.sh`): next
unchecked slice → read live code → smallest shippable change → typecheck + lint +
commit + push → check box + note. All `[x]` → move to `completed/`. Verify at
desktop + 390px.

## Current state (verified 2026-06-24)

- Cards: `app/admin/learn/modules/page.tsx`. `EnrichedModule` already has the
  data: `percentage` (0–100), `completed_lessons`, `total_lessons`,
  `started_lessons`, `user_status` ('not_started' | 'in_progress' | 'completed' |
  'enrolled' | …). Progress comes from `/api/admin/learn/user-progress`.
- The "Not Started" element is the status pill driven by `STATUS_META[user_status]`
  (the bordered box in the screenshot). There is ALSO a `.modules__card-progress`
  bar, but it's gated to `total_lessons > 0 && user_status !== 'not_started'`, so
  not-started cards show no bar. CSS lives with the learn/modules styles.
- The roadmap (`app/admin/learn/roadmap/page.tsx`) renders similar module cards —
  apply there too if it shares the element.

## Slice plan

- [x] **P1 — Gradient + label helper (pure, tested).** Add
  `lib/learn/module-progress.ts` with `progressColor(pct)` and
  `progressLabel(module)`. Color: `pct <= 0` → grey (neutral, "no color");
  `0 < pct < 100` → a continuous interpolation **yellow → green → blue** (e.g.
  blend through HSL hue ~50° → ~140° → ~215° as pct goes 1→100, so there are many
  intermediate shades); `pct >= 100` → full blue. Label: "Not Started" /
  "Enrolled" at 0, `"{pct}%"` in between, "COMPLETED!" at 100. Unit-test the
  endpoints + a few midpoints (monotonic hue, distinct buckets blend).
  _Done 2026-06-24:_ added `lib/learn/module-progress.ts` —
  `progressColor(pct)` (grey at 0; hue interpolated 50°→140° across 1–50% then
  140°→215° across 50–100%, with a slight sat/light ramp; full blue 215° at 100),
  plus `progressLabel`, `isComplete`, `normalizePct`, and `progressLabelColor`
  (dark text on the yellow/green band, white at the deep-blue end). Unit-tested
  (`__tests__/learn/module-progress.test.ts`, 8 passing): endpoints, **monotonic
  non-decreasing hue** across 1–100, band checks (yellow/green/blue regions), and
  **>20 distinct shades** (proves it's a gradient, not 3 buckets).
- [x] **P2 — Repurpose the card status element into the progress bar.** Replace
  the static status pill with an **always-present** progress bar: a track with a
  fill of `width: {pct}%` colored via `progressColor`, the label centered on it,
  and at 100% a white checkmark + "COMPLETED!" on a full-blue bar. Grey empty
  track at 0%. Keep the existing `.modules__card-progress` data wiring; unify so
  every card (incl. not-started) shows the bar. Ensure contrast (readable label
  on yellow/green/blue). Apply on the modules listing; mirror on the roadmap card
  if shared.
  _Done 2026-06-24:_ replaced the static "Not Started" pill + the gated 6px bar with
  a single **always-present 22px progress bar** (`.modules__card-progressbar`): a
  grey track, a left-anchored fill `width:{pct}%` colored by `progressColor(pct)`,
  and a **centered label** colored by `progressLabelColor` (dark on the yellow/green
  band, white on the deep-blue end). 0% shows a grey track + "Not Started"; 100%
  shows a **white ✓ + "COMPLETED!"** on a full-blue bar. The roadmap card's
  `roadmap__module-bar-fill` now uses the **same gradient** for consistency.
- [x] **P3 — Verify.** Seed modules at 0 / 15 / 40 / 70 / 100% and screenshot the
  cards at desktop + 390px: confirm the bar fills proportionally, the color walks
  grey→yellow→green→blue smoothly, and 100% shows the checkmark + "COMPLETED!".
  _Done 2026-06-24:_ harness-verified at **390px and 1280px** with cards at 0/15/40/
  70/100%. Fills are proportional (0%/15%/40%/70%/100% widths) and the color walks
  **grey rgb(205,208,213) → yellow-green (172,220,40) → green (32,223,38) → teal
  (27,218,186) → blue (24,106,220)** — a genuine continuous gradient. Labels read
  "Not Started", "15%", "40%", "70%", "✓ COMPLETED!"; the 100% card shows the
  checkmark on a full-blue bar. 0px overflow at both widths.

## Status: ✅ complete — all slices shipped (P1 tested gradient helper, P2 always-
## present card bar + roadmap, P3 verified 0→100% at desktop + 390px). Moved to
## completed/.
