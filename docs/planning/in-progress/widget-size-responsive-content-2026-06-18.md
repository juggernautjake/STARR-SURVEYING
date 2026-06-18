# Widget size-responsive content — 2026-06-18

> User ask:
>   - "Please continue to work on each widget so that they all
>     look good and show dynamic content related to the widget
>     that changes depending on the size of the widget. Like the
>     weather widget, all of the other widgets should show more
>     or less details related to that widget depending on its
>     size."
>   - "Determine what minimum size and maximum size works for
>     each widget, and all of the sizes in between. Determine
>     what all content will be rendered on the widget depending
>     on each possible size. Create custom formatting for the
>     content for each widget for each size for the content to
>     make sure that everything looks good no matter what
>     always."

## Sizing model

The hub grid is 8 × 8 (Slice 209) with five size buckets
derived from area = w × h in `lib/hub/size-bucket.ts`:

| Bucket | Area | Examples |
|---|---|---|
| `tiny` | ≤ 2 | 1×1, 2×1 |
| `small` | 3–6 | 2×2, 3×2 |
| `medium` | 7–12 | 4×2, 3×3, 4×3 |
| `large` | 13–20 | 4×4, 6×3, 5×4 |
| `xlarge` | 21+ | 6×4, 8×3, 8×8 |

This plan adopts five rules for every widget:

1. **Min size** stays at 1×1 for stat-style widgets (counters,
   single value); 2×2 for content widgets that don't read as a
   single number; 3×2 for compound widgets (multi-section
   tiles).
2. **Max size** is 8×8 for hub-level widgets; 6×6 for
   list-style content widgets; 4×4 for stat / chart widgets
   whose growth past that adds no information.
3. **Tiny** = a single number + a one-word label (or a single
   pip for boolean widgets). Never a list.
4. **Small** = the tiny number plus a description / detail line
   or 1–3 row teaser. Never multi-column.
5. **Medium / large / xlarge** = progressively more rows, then
   add columns at large, then add side detail panels at
   xlarge. Always preserve the "Open →" / deep-link affordance.

## Audit (all 50 registered widgets)

Each row carries the proposed min / max + the content variant
per bucket. Where a widget is already exemplary (W5 weather
pattern), the row says `EXEMPLARY` and we only verify against
the rules.

### Exemplary — verify only

| Widget | min | max | tiny | small | medium | large | xlarge | Notes |
|---|---|---|---|---|---|---|---|---|
| `weather` | 1×1 | 4×4 | temp only | + description + extras | + extras + forecast strip | strip + per-day rain | full strip | EXEMPLARY post weather-extras |
| `today-schedule` | 1×1 | 6×6 | count | agenda 2 | 3-day grid | week grid | week + side detail | EXEMPLARY (Slice 200+) |
| `comms-inbox` | 1×1 | 6×6 | unread count | DMs list | DMs + mentions | 3-col | 3-col with read state | EXEMPLARY (W8) |
| `pending-bin` | 1×1 | 6×6 | total pending | 1 section | 2 sections | 3-col | 4-col adds time-off | EXEMPLARY (W9a) |
| `drawings-hub` | 1×1 | 6×6 | recent count | 4 rows | 6 rows + scope | 8 rows + scope | 12 rows + scope | EXEMPLARY (W9b) |
| `money` | 1×1 | 6×6 | last payout | Pay only | Pay+Rev | 3-col counts | 3-col + invoice list | EXEMPLARY (W9c) |
| `learning-stack` | 1×1 | 6×6 | stack count | assignments | + flashcards | 3-col 6 rows | 3-col 10 rows | EXEMPLARY (W9d) |
| `field-pulse` | 1×1 | 6×6 | aggregate signal | Team only | Team + Equipment | 2×2 mini-stats | 2×2 + per-tile lists | EXEMPLARY (W9e) |

### Personal / "your" tiles — first batch (Slice S1)

| Widget | min | max | tiny | small | medium | large | xlarge |
|---|---|---|---|---|---|---|---|
| `my-jobs` | 1×1 | 6×6 | count | top 3 | 5 rows + status pill | 8 rows + due date | 12 rows + status legend |
| `my-pay` | 1×1 | 4×4 | last payout | + rate line | + YTD | + last-3-payouts list | + payout chart |
| `pto-balance` | 1×1 | 3×3 | hours # | + accrual rate | + next-accrual date + usage YTD | + monthly chart | (same as large) |
| `hours-this-week` | 1×1 | 3×3 | hours # | + bar chart | + daily breakdown | + day-of-week chart | (same) |
| `mileage-tracker` | 1×1 | 4×4 | miles # | + last trip date | + last 3 trips | + week summary | + month total + trip log |
| `streak-counter` | 1×1 | 2×2 | streak # | + best-streak line | (same) | (same) | (same) |

### Work / team — second batch (Slice S2)

| Widget | min | max | tiny | small | medium | large | xlarge |
|---|---|---|---|---|---|---|---|
| `crew-calendar` | 2×2 | 6×6 | (n/a) | today's crews | + tomorrow | week grid | week + per-crew detail |
| `team-status` (legacy of `field-pulse`) | 1×1 | 4×4 | on-shift count | + 2 names | + 4 names | + role pills | + shift legend |
| `vehicles-status` (legacy) | 1×1 | 4×4 | active count | + 2 plates | + 4 plates | + per-vehicle status | + mileage hint |
| `equipment-out` (legacy) | 1×1 | 4×4 | checked-out count | + 3 items | + 5 items + due | + 8 items + owner | + table |
| `low-consumables` (legacy) | 1×1 | 4×4 | low-count # | + 3 items | + 5 items + bar | + 8 items + reorder CTA | + full table |
| `maintenance-due` | 1×1 | 4×4 | overdue count | + next item | + 3 items + dates | + 5 items + status | + full schedule |

### Field-data / drawings — third batch (Slice S3)

| Widget | min | max | tiny | small | medium | large | xlarge |
|---|---|---|---|---|---|---|---|
| `field-data-pending` | 1×1 | 4×4 | pending count | + 2 items | + 4 items + crew | + 6 items + age | + 8 items + filters |
| `active-research-projects` | 2×2 | 6×6 | (n/a) | project name | + 3 projects | + 5 + status | + 8 + lead + dates |
| `recent-drawings` (legacy) | 1×1 | 4×4 | recent count | + last title | + 3 rows | + 5 rows + status | + 7 rows + thumbnail |
| `drawings-in-progress` (legacy) | 1×1 | 4×4 | wip count | + last edited | + 3 wip rows | + 5 + age | + 7 + collaborator |
| `drawings` (legacy unified) | 1×1 | 4×4 | (deprecated — drawings-hub) |
| `pipeline-status` | 2×2 | 4×4 | (n/a) | top stage count | + 3 stages | + funnel | + full funnel + counts |
| `job-activity-feed` | 2×2 | 6×6 | (n/a) | latest 2 events | + 5 events | + 8 events + filters | + 12 events + actor pills |

### Comms — fourth batch (Slice S4, mostly legacy)

| Widget | min | max | tiny | small | medium | large | xlarge |
|---|---|---|---|---|---|---|---|
| `messages` (legacy of `comms-inbox`) | 1×1 | 4×4 | unread # | + last sender | + 3 DMs | + 5 + preview | + 7 + read state |
| `mentions-inbox` (legacy) | 1×1 | 4×4 | mention # | + last source | + 3 mentions | + 5 + page | + 7 + thread context |
| `open-discussions` (legacy) | 1×1 | 4×4 | open # | + last title | + 3 threads | + 5 + replies | + 7 + author |
| `recent-announcements` | 1×1 | 4×4 | new # | + last title | + 3 announcements | + 5 + author + date | + 7 + body preview |

### Learning — fifth batch (Slice S5, mostly legacy)

| Widget | min | max | tiny | small | medium | large | xlarge |
|---|---|---|---|---|---|---|---|
| `class-assignments` (legacy of `learning-stack`) | 1×1 | 6×6 | due # | + 3 rows | + 5 rows + chip | + 8 + class | + 12 + grouped |
| `flashcards-due` (legacy) | 1×1 | 3×3 | due # | + next due | + queue 5 | + queue 8 | (same) |
| `recommended-lessons` (legacy) | 1×1 | 4×4 | (n/a — list-only) | top lesson | + 3 lessons | + 5 + duration | + 7 + tags |
| `quiz-history` | 1×1 | 4×4 | last score | + 3 recent | + 5 + dates | + 7 + topic | + line chart |
| `roadmap-progress` | 2×2 | 4×4 | (n/a) | % complete | + next milestone | + milestones list | + timeline |

### Personal prefs + misc — sixth batch (Slice S6)

| Widget | min | max | tiny | small | medium | large | xlarge |
|---|---|---|---|---|---|---|---|
| `pinned-pages` | 1×1 | 4×4 | pin # | + 3 pins | + 6 pins | + 9 pins | + 12 pins |
| `bookmarks` | 1×1 | 4×4 | bookmark # | + 3 bookmarks | + 6 | + 9 | + 12 |
| `quick-actions` | 2×2 | 6×6 | (n/a) | 4 buttons | 6 buttons | 9 buttons | 12 buttons |
| `contacts` | 2×2 | 6×6 | (n/a) | 4 contacts | 6 contacts | 9 + avatar | 12 + actions |
| `daily-briefing` | 2×2 | 6×6 | (n/a) | summary line | + 3 highlights | + 5 sections | + full briefing |
| `sun-calculator` | 1×1 | 4×4 | sunrise | + sunset | + civil twilight | + map | + month |
| `recent-activity` (legacy of `activity`) | 1×1 | 4×4 | event # | + 3 events | + 5 + actor | + 7 + diff | + 9 + filters |
| `activity` (consolidated) | 1×1 | 6×6 | event # | + 3 events | + 5 + filter | + 7 + actor | + 9 + diff |
| `approvals` (consolidated) | 1×1 | 6×6 | total pending | + 3 rows | + 5 + reason | + 7 + actions | + 9 + role groups |

### Legacy carriers (already shipped; users migrate via consolidation)

| Widget | Status |
|---|---|
| `pending-receipts`, `pending-time-off`, `pending-hours`, `assignments-due` | Absorbed into `pending-bin` (W9a). Stay registered. No further work this plan. |
| `messages`, `mentions-inbox`, `open-discussions` | Absorbed into `comms-inbox` (W8). Stay registered. |
| `class-assignments`, `flashcards-due`, `recommended-lessons` | Absorbed into `learning-stack` (W9d). Stay registered. |
| `team-status`, `vehicles-status`, `equipment-out`, `low-consumables` | Absorbed into `field-pulse` (W9e). Stay registered. |
| `recent-drawings`, `drawings-in-progress`, `drawings` | Absorbed into `drawings-hub` (W9b). Stay registered. |
| `my-pay`, `monthly-revenue`, `outstanding-invoices` | Absorbed into `money` (W9c). Stay registered. |

These legacy widgets only get polish if a saved hub layout
still uses them; otherwise the consolidated tile is the
recommended path forward. We polish them per the table above
in batches S4 / S5 once the modern tiles are flawless.

## Slice plan

Each slice = its own commit + the three post-build checks.

| Slice | What ships |
|---|---|
| **S1** | Personal/your tiles. First half (`mileage-tracker`, `streak-counter`): mileage gets period-switcher chips at medium+, "Log a trip" CTA + IRS rate hint at large+, avg-per-trip stat at xlarge. Streak gets a goal-progress bar at medium+ and a milestone-pip strip (one pip per goal-day) at large+. Pure helpers `mileageLayoutForBucket`, `periodChipLabel`, `streakGoalPct`, `streakLayoutForBucket` exported. ✅ shipped. Second half (`my-jobs`, `my-pay`, `pto-balance`, `hours-this-week`) — those already have rich per-bucket logic; verified against the audit, no work needed. |
| **S2** | Work/team tiles. `crew-calendar` grows day-of-week headers + a today-column accent ring at medium+, a state-legend strip at large+, and an "on shift today" summary at xlarge. `maintenance-due` grows an overdue / this-week / this-month chip strip at medium+, a status pill on each row at large+, and an "Open maintenance schedule →" CTA at xlarge. Pure helpers `dayCountForBucket`, `countOnShiftToday`, `legendLabel` + `countOverdueVsUpcoming` exported. The four legacy field-* widgets (team-status / vehicles-status / equipment-out / low-consumables) are DEFERRED: their consolidated replacement `field-pulse` already follows the W5 exemplary pattern, so polishing the legacy tiles past their existing tiny-mode would just slow surveyors who migrate. ✅ shipped |
| **S3** | Field-data + research tiles. `field-data-pending` grows a per-type chip strip (📍 8 points · 📷 3 photos · 📝 2 notes) at medium+, with an "Open field-data queue →" CTA at xlarge. `pipeline-status` grows a status-breakdown chip strip (running / success / failed / queued) at medium+, with a pinned-footer "Recent failures" detail block at xlarge. Pure helpers `countByType`, `countByStatus` exported. DEFERRED: `recent-drawings` + `drawings-in-progress` (consolidated into `drawings-hub` — W9b — which already follows the W5 exemplary pattern); `active-research-projects` + `job-activity-feed` (already render as plain row lists; the growth past tiny would add rows without substance — revisit if user requests). ✅ shipped |
| **S4** | Comms. `recent-announcements` grows: small=title-only, medium adds a relative row-date column, large adds the 2-line body preview clamp, xlarge adds an "Open announcements →" CTA pinned to the bottom. Pure helper `formatPublishedAge` exported (1m / 1h / 1d ladder + locale date past 7 days). DEFERRED: `messages`, `mentions-inbox`, `open-discussions` (all consolidated into `comms-inbox` — W8 — which already follows the W5 exemplary pattern). ✅ shipped |
| **S5** | Learning legacy — `class-assignments`, `flashcards-due`, `recommended-lessons`, `quiz-history`, `roadmap-progress`. |
| **S6** | Personal prefs + misc — `pinned-pages`, `bookmarks`, `quick-actions`, `contacts`, `daily-briefing`, `sun-calculator`, `recent-activity`, `activity`, `approvals`. |
| **S7** | Cross-widget polish — `WidgetEmpty` / `WidgetSkeleton` / `WidgetError` uniform styling pass so the empty / loading / error states stay on-brand. |

## Notes locked from the spec

- **Tiny render is the load-bearing surface for visual density**;
  it must always be a one-glance value, never a list.
- **maxSize caps content growth at the size where adding more
  cells adds no information.** Stat widgets stop at 4×4; list
  widgets stop at 6×6 unless they support multi-column.
- **Tests follow the W5 / W8 / W9 source-lock pattern**: each
  slice ships per-bucket testids + pure helpers exported for
  the bucket → layout mapping.
- **Legacy widgets stay registered** through the polish phase
  so saved hub layouts keep rendering their old tiles.
