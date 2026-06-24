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

- [ ] **P1 — Gradient + label helper (pure, tested).** Add
  `lib/learn/module-progress.ts` with `progressColor(pct)` and
  `progressLabel(module)`. Color: `pct <= 0` → grey (neutral, "no color");
  `0 < pct < 100` → a continuous interpolation **yellow → green → blue** (e.g.
  blend through HSL hue ~50° → ~140° → ~215° as pct goes 1→100, so there are many
  intermediate shades); `pct >= 100` → full blue. Label: "Not Started" /
  "Enrolled" at 0, `"{pct}%"` in between, "COMPLETED!" at 100. Unit-test the
  endpoints + a few midpoints (monotonic hue, distinct buckets blend).
- [ ] **P2 — Repurpose the card status element into the progress bar.** Replace
  the static status pill with an **always-present** progress bar: a track with a
  fill of `width: {pct}%` colored via `progressColor`, the label centered on it,
  and at 100% a white checkmark + "COMPLETED!" on a full-blue bar. Grey empty
  track at 0%. Keep the existing `.modules__card-progress` data wiring; unify so
  every card (incl. not-started) shows the bar. Ensure contrast (readable label
  on yellow/green/blue). Apply on the modules listing; mirror on the roadmap card
  if shared.
- [ ] **P3 — Verify.** Seed modules at 0 / 15 / 40 / 70 / 100% and screenshot the
  cards at desktop + 390px: confirm the bar fills proportionally, the color walks
  grey→yellow→green→blue smoothly, and 100% shows the checkmark + "COMPLETED!".
