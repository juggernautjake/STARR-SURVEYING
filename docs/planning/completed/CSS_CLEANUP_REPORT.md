# CSS Cleanup Report — Static-Analysis Pass

> **Status:** Completed 2026-04-30. The static-analysis sweep across all 20
> admin CSS files is shipped — every selector is bucketed (referenced /
> high-confidence dead / likely-dead / do-not-touch). The remaining work is
> an operational per-file deletion loop driven by Chrome DevTools Coverage
> against a logged-in admin session, captured as a self-contained runbook
> in §"What to do with this report" below. That follow-up is not on the
> critical path and runs as time permits — start with the smallest files
> first per the migration order in this report. Doc preserved as the
> historical record of the static-analysis pass + the canonical reference
> for the per-file follow-up.

**Generated:** April 2026 (Phase 0.5 cleanup PR)
**Scope:** `app/admin/styles/*.css` against all `app/**` and `lib/**` source files
**Tool:** Custom static-analysis script in `/tmp/css-analysis/analyze.mjs` (kept out of the repo because it was a one-shot)

> **⚠ Disclaimer.** This is a static-analysis pass, **not** a runtime coverage report. False positives are likely because:
> - Class names built dynamically (`clsx(...)`, template literals, ternaries, `styles[name]`) are not always matched.
> - Class names referenced only by 3rd-party libraries (Tiptap, dnd-kit, etc.) won't show up in our search corpus.
> - Animation keyframes, CSS-only utility classes applied via inline style, and CSS-variable-driven styling are not captured by literal-name search.
>
> **No deletions until a runtime coverage pass (Chrome DevTools Coverage tab against a logged-in admin session, every admin route) confirms the static findings.** This report is the input to that runtime pass, not a delete list.

## Headline numbers

| Bucket | Count | % of total |
|--------|-------|------------|
| Referenced (keep) | 5023 | 90.9% |
| Do-not-touch (keyframes / cross-CSS / risky) | 71 | 1.3% |
| Likely dead — verify before delete | 424 | 7.7% |
| **High-confidence dead** | **5** | **0.09%** |
| **Total class-name selectors scanned** | **5523** | 100% |

### Estimated savings if all "likely dead" + "high-confidence dead" candidates were eventually removed (after runtime confirmation):

- ≈ **429** selector definitions, ≈ **7.8%** of the admin CSS surface.
- Real byte savings depend on per-rule sizes; the `AdminResearch.css` and `AdminLearn.css` files alone account for the majority of candidates.

## Recommended migration order (smallest files first — easiest wins, lowest blast radius)

| # | File | Lines | Classes | High dead | Likely dead | Do-not-touch | Referenced |
|---|------|------:|--------:|----------:|------------:|-------------:|-----------:|
| 1 | `AdminLogin.css` | 56 | 36 | 0 | 1 | 0 | 35 |
| 2 | `AdminAssignments.css` | 103 | 50 | 0 | 0 | 0 | 50 |
| 3 | `AdminSchedule.css` | 103 | 46 | 0 | 0 | 0 | 46 |
| 4 | `AdminUsers.css` | 107 | 53 | 1 | 8 | 0 | 44 |
| 5 | `AdminDiscussions.css` | 108 | 53 | 0 | 0 | 0 | 53 |
| 6 | `AdminEmployeeManage.css` | 171 | 97 | 0 | 5 | 0 | 92 |
| 7 | `AdminFieldWork.css` | 291 | 157 | 4 | 3 | 1 | 149 |
| 8 | `AdminMyNotes.css` | 332 | 63 | 0 | 0 | 0 | 63 |
| 9 | `AdminTimeLogs.css` | 539 | 106 | 0 | 0 | 1 | 105 |
| 10 | `AdminArticle.css` | 546 | 48 | 0 | 0 | 0 | 48 |
| 11 | `AdminRewards.css` | 596 | 171 | 0 | 7 | 0 | 164 |
| 12 | `AdminLayout.css` | 699 | 251 | 0 | 9 | 5 | 237 |
| 13 | `AdminErrors.css` | 938 | 104 | 0 | 14 | 1 | 89 |
| 14 | `AdminJobs.css` | 1455 | 345 | 0 | 4 | 0 | 341 |
| 15 | `AdminPayroll.css` | 1619 | 202 | 0 | 4 | 1 | 197 |
| 16 | `AdminResponsive.css` | 2158 | 821 | 0 | 22 | 33 | 766 |
| 17 | `AdminMessaging.css` | 2677 | 357 | 0 | 60 | 2 | 295 |
| 18 | `AdminLearn.css` | 2772 | 1068 | 0 | 105 | 8 | 955 |
| 19 | `TestingLab.css` | 3133 | 371 | 0 | 28 | 0 | 343 |
| 20 | `AdminResearch.css` | 10562 | 1124 | 0 | 154 | 19 | 951 |

## Per-file detail

### `AdminLogin.css` (56 lines, 36 class selectors)

**High-confidence dead:** *(none)*

**Likely dead but verify** (no literal match found, but a file in the same area uses one of `clsx`, template-literal class names, or ternary class selection — so the class might be constructed at runtime). Sample (first 25 of 1):

- `.admin-login__notice`

### `AdminAssignments.css` (103 lines, 50 class selectors)

**High-confidence dead:** *(none)*

### `AdminSchedule.css` (103 lines, 46 class selectors)

**High-confidence dead:** *(none)*

### `AdminUsers.css` (107 lines, 53 class selectors)

**High-confidence dead** (zero literal references in any `.tsx`/`.jsx`/`.ts`/`.js`/`.md` file in `app/` or `lib/`, no cross-CSS use, no keyframe match, no nearby dynamic-class-construction patterns):

- `.um-btn--xs`

**Likely dead but verify** (no literal match found, but a file in the same area uses one of `clsx`, template-literal class names, or ternary class selection — so the class might be constructed at runtime). Sample (first 25 of 8):

- `.um-ban-date`
- `.um-ban-reason`
- `.um-role-badge--admin`
- `.um-role-badge--employee`
- `.um-role-badge--teacher`
- `.um-role-editor`
- `.um-role-editor__actions`
- `.um-role-toggle`

### `AdminDiscussions.css` (108 lines, 53 class selectors)

**High-confidence dead:** *(none)*

### `AdminEmployeeManage.css` (171 lines, 97 class selectors)

**High-confidence dead:** *(none)*

**Likely dead but verify** (no literal match found, but a file in the same area uses one of `clsx`, template-literal class names, or ternary class selection — so the class might be constructed at runtime). Sample (first 25 of 5):

- `.emp-manage__change-type--bonus_awarded`
- `.emp-manage__change-type--credential_added`
- `.emp-manage__change-type--pay_raise`
- `.emp-manage__change-type--role_change`
- `.payout-log__header`

### `AdminFieldWork.css` (291 lines, 157 class selectors)

**High-confidence dead** (zero literal references in any `.tsx`/`.jsx`/`.ts`/`.js`/`.md` file in `app/` or `lib/`, no cross-CSS use, no keyframe match, no nearby dynamic-class-construction patterns):

- `.fw__log__acc`
- `.fw__log__acc--low`
- `.fw__log__acc--med`
- `.fw__log__rtk`

**Likely dead but verify** (no literal match found, but a file in the same area uses one of `clsx`, template-literal class names, or ternary class selection — so the class might be constructed at runtime). Sample (first 25 of 3):

- `.fw__log__acc--high`
- `.fw__timeline-marker--end`
- `.fw__timeline-marker--start`

**Do not touch** (1 entries — keyframes, classes used by other CSS files, single-letter utilities). Examples:

- `.fw (too-short)`

### `AdminMyNotes.css` (332 lines, 63 class selectors)

**High-confidence dead:** *(none)*

### `AdminTimeLogs.css` (539 lines, 106 class selectors)

**High-confidence dead:** *(none)*

**Do not touch** (1 entries — keyframes, classes used by other CSS files, single-letter utilities). Examples:

- `.w3 (too-short)`

### `AdminArticle.css` (546 lines, 48 class selectors)

**High-confidence dead:** *(none)*

### `AdminRewards.css` (596 lines, 171 class selectors)

**High-confidence dead:** *(none)*

**Likely dead but verify** (no literal match found, but a file in the same area uses one of `clsx`, template-literal class names, or ternary class selection — so the class might be constructed at runtime). Sample (first 25 of 7):

- `.pay-prog__rate-mult--50`
- `.pay-prog__rate-mult--75`
- `.pay-prog__rate-mult--full`
- `.rewards__purchase-status--approved`
- `.rewards__purchase-status--cancelled`
- `.rewards__purchase-status--fulfilled`
- `.rewards__purchase-status--pending`

### `AdminLayout.css` (699 lines, 251 class selectors)

**High-confidence dead:** *(none)*

**Likely dead but verify** (no literal match found, but a file in the same area uses one of `clsx`, template-literal class names, or ternary class selection — so the class might be constructed at runtime). Sample (first 25 of 9):

- `.admin-progress__label`
- `.admin-toast--error`
- `.admin-toast--info`
- `.admin-toast--success`
- `.admin-toast__close`
- `.admin-topbar__role-badge--admin`
- `.admin-topbar__role-badge--employee`
- `.fb__book--flip-back`
- `.fb__book--flip-forward`

**Do not touch** (5 entries — keyframes, classes used by other CSS files, single-letter utilities). Examples:

- `.admin-btn--lg (used by another CSS file)`
- `.admin-dashboard__cards (used by another CSS file)`
- `.admin-modal__footer (used by another CSS file)`
- `.admin-toast (used by another CSS file)`
- `.fb (too-short)`

### `AdminErrors.css` (938 lines, 104 class selectors)

**High-confidence dead:** *(none)*

**Likely dead but verify** (no literal match found, but a file in the same area uses one of `clsx`, template-literal class names, or ternary class selection — so the class might be constructed at runtime). Sample (first 25 of 14):

- `.err-log__item--critical`
- `.err-log__item--high`
- `.err-log__item--low`
- `.err-log__item--medium`
- `.err-log__item-severity--critical`
- `.err-log__item-severity--high`
- `.err-log__item-severity--low`
- `.err-log__item-severity--medium`
- `.err-log__item-status--acknowledged`
- `.err-log__item-status--investigating`
- `.err-log__item-status--new`
- `.err-log__item-status--resolved`
- `.err-log__item-status--wont_fix`
- `.err-log__page-btn--active`

**Do not touch** (1 entries — keyframes, classes used by other CSS files, single-letter utilities). Examples:

- `.w3 (too-short)`

### `AdminJobs.css` (1455 lines, 345 class selectors)

**High-confidence dead:** *(none)*

**Likely dead but verify** (no literal match found, but a file in the same area uses one of `clsx`, template-literal class names, or ternary class selection — so the class might be constructed at runtime). Sample (first 25 of 4):

- `.file-viewer__zoom-level`
- `.job-detail__field-data-header`
- `.job-detail__field-data-table`
- `.job-import__uploading`

### `AdminPayroll.css` (1619 lines, 202 class selectors)

**High-confidence dead:** *(none)*

**Likely dead but verify** (no literal match found, but a file in the same area uses one of `clsx`, template-literal class names, or ternary class selection — so the class might be constructed at runtime). Sample (first 25 of 4):

- `.payroll-badge--credited`
- `.payroll-badge--deposited`
- `.payroll-badge--failed`
- `.payroll-badge--pending`

**Do not touch** (1 entries — keyframes, classes used by other CSS files, single-letter utilities). Examples:

- `.w3 (too-short)`

### `AdminResponsive.css` (2158 lines, 821 class selectors)

**High-confidence dead:** *(none)*

**Likely dead but verify** (no literal match found, but a file in the same area uses one of `clsx`, template-literal class names, or ternary class selection — so the class might be constructed at runtime). Sample (first 25 of 22):

- `.block-slideshow`
- `.err-dialog__body`
- `.err-log__filter-btn`
- `.fbfull__toolbar`
- `.fc-study__back-text`
- `.fc-study__front-text`
- `.media__toolbar`
- `.mng__tabs`
- `.modules__card-lock-tooltip`
- `.msg-compose__row`
- `.msg-compose__to-row`
- `.msg-threads__list`
- `.payroll-rates__table-wrap`
- `.quiz__header-right`
- `.quiz__option-label`
- `.research-analyzing__text`
- `.research-viewer__meta`
- `.research-viewer__title`
- `.schedule-header`
- `.schedule-nav`
- `.schedule-week-grid`
- `.tl-table-wrap`

**Do not touch** (33 entries — keyframes, classes used by other CSS files, single-letter utilities). Examples:

- `.admin-btn--lg (used by another CSS file)`
- `.admin-dashboard__cards (used by another CSS file)`
- `.admin-modal__footer (used by another CSS file)`
- `.admin-toast (used by another CSS file)`
- `.assign__enroll-row (used by another CSS file)`
- `.exam-prep__cards (used by another CSS file)`
- `.fb (too-short)`
- `.flashcards__decks (used by another CSS file)`
- `.lesson-item__lock-tooltip (used by another CSS file)`
- `.messenger-panel__tab (used by another CSS file)`
- *...and 23 more.*

### `AdminMessaging.css` (2677 lines, 357 class selectors)

**High-confidence dead:** *(none)*

**Likely dead but verify** (no literal match found, but a file in the same area uses one of `clsx`, template-literal class names, or ternary class selection — so the class might be constructed at runtime). Sample (first 25 of 60):

- `.messenger-panel__expand`
- `.messenger-panel__tab--active`
- `.messenger-panel__tabs`
- `.msg-bubble__body--deleted`
- `.msg-bubble__files`
- `.msg-bubble__hover-actions`
- `.msg-bubble__hover-btn`
- `.msg-bubble__images`
- `.msg-bubble__images--1`
- `.msg-bubble__images--2`
- `.msg-bubble__images--3`
- `.msg-bubble__quick-reaction`
- `.msg-bubble__quick-reactions`
- `.msg-bubble__reaction--own`
- `.msg-bubble__reaction-count`
- `.msg-bubble__reaction-emoji`
- `.msg-bubble__reply-sender`
- `.msg-bubble__reply-text`
- `.msg-compose__action-btn`
- `.msg-compose__actions`
- `.msg-compose__emoji-btn`
- `.msg-compose__reply-bar`
- `.msg-compose__reply-close`
- `.msg-compose__reply-sender`
- `.msg-compose__reply-text`
- *...and 35 more.*

**Do not touch** (2 entries — keyframes, classes used by other CSS files, single-letter utilities). Examples:

- `.messenger-panel__tab (used by another CSS file)`
- `.w3 (too-short)`

### `AdminLearn.css` (2772 lines, 1068 class selectors)

**High-confidence dead:** *(none)*

**Likely dead but verify** (no literal match found, but a file in the same area uses one of `clsx`, template-literal class names, or ternary class selection — so the class might be constructed at runtime). Sample (first 25 of 105):

- `.assign__status--cancelled`
- `.assign__status--completed`
- `.assign__status--in_progress`
- `.assign__status--pending`
- `.assign__unlock-badge`
- `.block-highlight--amber`
- `.block-highlight--blue`
- `.block-highlight--dark`
- `.block-highlight--green`
- `.block-highlight--purple`
- `.block-highlight--red`
- `.block-picker__grid`
- `.block-picker__group-title`
- `.block-picker__item`
- `.block-picker__item-desc`
- `.block-picker__item-icon`
- `.block-picker__item-label`
- `.exam-prep__card`
- `.exam-prep__card-desc`
- `.exam-prep__card-icon`
- `.exam-prep__card-title`
- `.fieldbook-btn`
- `.fieldbook-panel__body`
- `.fieldbook-panel__input`
- `.flashcards__deck-card`
- *...and 80 more.*

**Do not touch** (8 entries — keyframes, classes used by other CSS files, single-letter utilities). Examples:

- `.assign__enroll-row (used by another CSS file)`
- `.exam-prep__cards (used by another CSS file)`
- `.flashcards__decks (used by another CSS file)`
- `.lesson-item__lock-tooltip (used by another CSS file)`
- `.qb__btn-xs (used by another CSS file)`
- `.qb__gen-btns (used by another CSS file)`
- `.qb__search-input (used by another CSS file)`
- `.qb__template-actions (used by another CSS file)`

### `TestingLab.css` (3133 lines, 371 class selectors)

**High-confidence dead:** *(none)*

**Likely dead but verify** (no literal match found, but a file in the same area uses one of `clsx`, template-literal class names, or ternary class selection — so the class might be constructed at runtime). Sample (first 25 of 28):

- `.code-viewer__browser-entry--dir`
- `.log-stream__entry--debug`
- `.log-stream__entry--error`
- `.log-stream__entry--info`
- `.log-stream__entry--success`
- `.log-stream__entry--warn`
- `.log-viewer-tab__entry--debug`
- `.log-viewer-tab__entry--error`
- `.log-viewer-tab__entry--info`
- `.log-viewer-tab__entry--success`
- `.log-viewer-tab__entry--warn`
- `.test-card--error`
- `.test-card--idle`
- `.test-card--paused`
- `.test-card--running`
- `.test-card--success`
- `.test-card__log-level-btn--debug`
- `.test-card__log-level-btn--error`
- `.test-card__log-level-btn--info`
- `.test-card__log-level-btn--success`
- `.test-card__log-level-btn--warn`
- `.test-card__status-dot--error`
- `.test-card__status-dot--idle`
- `.test-card__status-dot--paused`
- `.test-card__status-dot--running`
- *...and 3 more.*

### `AdminResearch.css` (10562 lines, 1124 class selectors)

**High-confidence dead:** *(none)*

**Likely dead but verify** (no literal match found, but a file in the same area uses one of `clsx`, template-literal class names, or ternary class selection — so the class might be constructed at runtime). Sample (first 25 of 154):

- `.artifact-gallery__grid`
- `.coherence-review__issue--critical`
- `.coherence-review__issue--info`
- `.coherence-review__issue--warning`
- `.coord-entry__divider`
- `.coord-entry__empty`
- `.coord-entry__field-row`
- `.coord-entry__fields`
- `.coord-entry__tab`
- `.coord-entry__tab--active`
- `.coord-entry__tabs`
- `.coord-entry__traverse`
- `.coord-entry__traverse-title`
- `.coord-entry__vertex-coords`
- `.coord-entry__vertex-delete`
- `.coord-entry__vertex-item`
- `.coord-entry__vertex-label`
- `.coord-entry__vertex-list`
- `.misc-docs-toggle`
- `.misc-docs-toggle__body`
- `.misc-docs-toggle__count`
- `.misc-docs-toggle__icon`
- `.misc-docs-toggle__label`
- `.misc-docs-toggle__summary`
- `.ra-live-log__entry--warn`
- *...and 129 more.*

**Do not touch** (19 entries — keyframes, classes used by other CSS files, single-letter utilities). Examples:

- `.research-analyzing (used by another CSS file)`
- `.research-analyzing__title (used by another CSS file)`
- `.research-configure (used by another CSS file)`
- `.research-configure__actions (used by another CSS file)`
- `.research-configure__desc (used by another CSS file)`
- `.research-configure__summary (used by another CSS file)`
- `.research-configure__summary-item (used by another CSS file)`
- `.research-configure__title (used by another CSS file)`
- `.research-drawing__controls-right (used by another CSS file)`
- `.research-drawing__view-btn (used by another CSS file)`
- *...and 9 more.*

## False-positive risk notes

Things this static analyzer **cannot** detect, which would cause false positives in the dead-class list:

- `clsx(${variantA && "foo-active"}, ...)` — string literal will be matched, but `clsx({\`foo-${state}\`: true})` will not.
- `className={\`btn-${variant}\`}` — only the prefix is matched; the full computed class name is not.
- Class names referenced inside Tiptap, dnd-kit, react-flow, or any other 3rd-party library that injects DOM with its own class names matching our CSS (we do not scan `node_modules`).
- Class names referenced only inside HTML strings or markdown rendered to HTML at runtime.
- Class names referenced via CSS `var(--my-class-name)` patterns, which we do not parse.
- Class names attached via `element.classList.add(name)` where `name` is a variable.

## What to do with this report

1. **Do nothing in this PR.** This report is informational. The Phase 0.5 cleanup PR explicitly does not delete any class names.
2. **Open a follow-up PR per file**, working top-to-bottom in the migration order above. Each per-file PR should:
   1. Pick one file from the table.
   2. Run Chrome DevTools Coverage against every admin route that touches that file with a logged-in admin session.
   3. Cross-reference the runtime-uncovered selectors with this report's "high-confidence dead" + "likely dead" buckets.
   4. Delete only the intersection (covered by runtime confirmation **and** flagged by this report).
   5. Smoke-test the affected admin routes after deletion.
3. **`globals.css` is intentionally not in scope.** It duplicates Tailwind theme variables; resolving that requires picking a single source of truth (Tailwind theme vs. CSS custom properties), which is a design-system decision deferred until the user picks a direction.

## Tool reproducibility

The analysis script is intentionally not committed (it is a one-shot, not a recurring tool). To reproduce, walk every `.tsx`/`.jsx`/`.ts`/`.js`/`.md`/`.css`/`.html` under `app/` and `lib/`, extract `.classname` selectors from each `.css` in `app/admin/styles/`, then bucket each selector as referenced / high-dead / likely-dead / do-not-touch using the heuristics described above.

A future iteration of this report should run against actual Chrome DevTools Coverage JSON exports from a real admin session, not a static literal search.
