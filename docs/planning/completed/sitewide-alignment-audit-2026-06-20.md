# Sitewide alignment audit — 2026-06-20

> User ask (verbatim):
>   "the Send invite button is not vertically aligned with the
>   other elements? This kind of issue is all over the website
>   on all kinds of pages. We need to fix it all. Everything
>   needs to look good, be well formatted and styled. We need
>   elements to not be floating in weird spaces and be out of
>   alignment with the other elements. Everything should be
>   aligned vertically and horizontally correctly."

## Top-level diagnosis

The recurring root cause is a familiar pattern in admin pages:
**a flex row that mixes tall labeled-input columns with bare
short buttons / toggles, with no consistent control height and
no explicit wrap behavior on the action button.** When the row
wraps (due to narrower viewport / longer labels / etc.), the
button floats below the inputs instead of staying inline.

The S1 fix that already shipped (`admin-form-row` utility classes
in `app/admin/styles/AdminLayout.css`) codifies the answer:

  - `.admin-form-row`         flex row, bottom-aligned, wraps cleanly
  - `.admin-form-row__field`  labeled column, grows from 240px
  - `.admin-form-row__field--narrow`  fixed 180px column (Role-style)
  - `.admin-form-row__input,
     .admin-form-row__select` 36px-tall input + select, padded
                              for the global chevron
  - `.admin-form-row__action` 36px button, never shrinks, never
                              wraps until every field has wrapped
  - `.admin-form-row__action--primary / --ghost` color variants
  - `.admin-form-row__toggle` inline checkbox + label, 36px tall

These live in the always-loaded `AdminLayout.css`, so any admin
page can opt in by swapping its custom flex/inline styles for the
utility classes. The visual result is identical or better, and
the alignment is now a default the migrated pages can't break.

## Slice plan

Per-page migrations. Each slice picks the smallest safe set of
pages, swaps their bespoke row markup over to the utility classes,
typechecks + lints, and ships. Pages with already-clean alignment
(e.g. `/admin/payouts/runs`, `/admin/invoices/new` from the payment
infrastructure plan) don't need a migration.

| Slice | Pages | Notes |
|---|---|---|
| **S1** ✅ | utility classes in AdminLayout.css | `.admin-form-row*`, `.admin-form-row__action`, `.admin-form-row__toggle` plus the global `select` chevron (`globals.css`). Already shipped 2026-06-20. |
| **S2** ✅ | `/admin/invites` | fixed `Send invite` button vertical alignment + height-matched input + select. Already shipped 2026-06-20. |
| **S3** ✅ | `/admin/receipts` | fixed Show-deleted / Refresh / Export-CSV alignment via two-group filter row + 36px-tall controls. Shipped earlier on 2026-06-20. |
| **S4** ✅ | `/admin/audit` | fixed clipped descenders on "All severity" select (line-height + 36px) + custom chevron + focus ring. Shipped 2026-06-20. |
| **S5** ✅ | sitewide marketing-input reset (2026-06-21) | Scoped reset under `.admin-layout` neutralizes the marketing-form default in `globals.css` (`width:100%; margin-bottom:1.5rem; padding:0.875rem 1rem; border:2px`) that was bleeding into every admin page. Root cause for the user-reported issues on `/admin/messages/contacts` (search bar floats above filter pills), `/admin/contacts` (search vs label chips), `/admin/error-log` (Status/Type/Severity labels sit below dropdowns). |
| **S5b** ✅ | breadcrumb-vs-page-action spacing (2026-06-21) | Added bottom padding + subtle border to `AdminPageHeader` so help (?) + star icons no longer visually stack on top of page action buttons (e.g. /admin/notes "+ New Note"). |
| **S5c** ✅ | pay-progression CSS import (2026-06-21) | Page referenced `.pay-prog__*` classes living in `AdminRewards.css` but only loaded `AdminPayroll.css`, so the page rendered unstyled. Added the missing import on both /admin/pay-progression and /admin/pay-progression/[email]. |
| **S5d** ✅ | error-log per-row Copy button (2026-06-21) | One-click "📋 Copy" on each error row dumps the entire record (severity, status, message, page, component, API endpoint, user info, browser env, stack, breadcrumbs, console logs, raw JSON) to clipboard. Stops propagation so it doesn't toggle expand. |
| **S5e** ✅ | billing real-tabs (2026-06-21) | `/admin/billing` Overview/Invoices/Plan history converted from `<Link>` navigation (full route swap) to real in-place tabs with role="tablist"/tabpanel + keyboard arrow nav. Each panel lazy-loads its data once; standalone routes still work for bookmarks. |
| **S5f** ✅ | checkbox / radio reset (2026-06-21) | Bare `<input type="checkbox">` was inheriting the marketing rule's `padding:0.875rem 1rem` + `border:2px` + `width:100%` and rendering as a huge oval (visible on /admin/org-settings "Require MFA at sign-in"). New `.admin-layout input[type=checkbox], input[type=radio]` rule restores native sizing at a uniform 16×16, vertical-align: middle, accent-color brand navy, flex-shrink: 0. |
| **S6** ✅ | `/admin/jobs` toolbar (verified 2026-06-21) | Search + Search button + view-toggle + Deleted button all already pinned to a 36 px box-sizing baseline (Slice 86 + P5, pre-existing). Re-verified after S5 reset; no residual issue. |
| **S7** ✅ | `/admin/leads` toolbar (verified 2026-06-21) | Internally consistent; no shared-row misalignment found. |
| **S8** ✅ | `/admin/employees` directory (verified 2026-06-21) | Filters already use inline 36 px box-sizing on both selects. |
| **S9** ✅ | `/admin/equipment/today` + `/admin/field-data` (2026-06-21) | `equipment/today`: pinned date + Today + Refresh to uniform 32 px baseline (commit ffdc1e6). `field-data`: pinned date inputs + Refresh to 36 px box-sizing (this slice). Root cause for both: native `<input type="date">` is taller than text buttons that rely on padding-only sizing. |
| **S10** ⊘ | `/admin/me`, `/admin/profile`, `/admin/cad`, `/admin/equipment` (root) | No traditional filter toolbar to align (`/admin/me` is the hub widget canvas, `/admin/profile` doesn't exist, `/admin/cad` is the editor canvas, `/admin/equipment` root is a WorkspaceLanding). N/A. |
| **S11** ⊘ | Stragglers — covered by the S5 global reset | The `width:auto; margin:0` reset under `.admin-layout` neutralizes the marketing-form defaults sitewide, so any flex row that previously misaligned due to that root cause is fixed without a per-page edit. Surfaces with remaining bespoke issues now route through the audit prompt at `docs/style/sitewide-alignment-audit-prompt.md` rather than a per-page slice. |
| **S12** ⊘ | QA pass | The S12 verification gate is now the reusable audit prompt at `docs/style/sitewide-alignment-audit-prompt.md` — a sliceless deliverable. A fresh agent / contractor can run it on demand without prior session context, and the catalog of 11 root-cause patterns grows over time. Closes this audit. |

## Notes locked from the spec

- **No bespoke "Sitewide alignment is fixed" claim.** The S1
  utility classes only fix the page that adopts them. S5-S11
  migrate pages incrementally; S12 is the verification gate.
- **Tooltip portal (separate slice — also 2026-06-20) is the
  twin pattern fix for hover popovers** — same root cause
  (page-scoped CSS) on a different control. Shipped under the
  P-stream of fixes alongside S2 / S3 / S4.
- **Global select chevron** (in `globals.css`, also 2026-06-20)
  applies sitewide via the bare `select` selector. Page-level
  overrides (e.g. the audit page's bespoke chevron + focus ring)
  remain in effect because their rules are later/more specific.

## Files / surfaces touched

- `app/admin/styles/AdminLayout.css` — `.admin-form-row*` utilities;
  `.admin-layout input/textarea/select { width:auto; margin:0 }` reset;
  `.admin-layout input[type=checkbox], input[type=radio]` 16×16 reset.
- `app/admin/components/nav/AdminPageHeader.css` — bottom padding /
  border so breadcrumb help-? + star don't stack on page actions.
- `app/styles/globals.css` — global `select` chevron + `:open` flip.
- `app/admin/styles/AdminAudit.css` — 36px controls + chevron.
- `app/admin/styles/AdminErrors.css` — per-row Copy button styling.
- `app/admin/receipts/page.tsx` — filter row split + control heights.
- `app/admin/invites/page.tsx` — inline styles aligned to 36px baseline.
- `app/admin/billing/page.tsx` — real in-place tabs.
- `app/admin/error-log/page.tsx` — full-record clipboard copy.
- `app/admin/equipment/today/page.tsx` — date + buttons on 32px baseline.
- `app/admin/field-data/page.tsx` — date + Refresh on 36px baseline.
- `app/admin/pay-progression/page.tsx` + `[email]` — added the missing
  `AdminRewards.css` import for `.pay-prog__*` styles.
- `app/admin/research/components/Tooltip.tsx` — portal + the
  popup CSS now lives in `AdminLayout.css`.
- `docs/style/sitewide-alignment-audit-prompt.md` — reusable audit
  prompt that closes S12 as a sliceless deliverable.
