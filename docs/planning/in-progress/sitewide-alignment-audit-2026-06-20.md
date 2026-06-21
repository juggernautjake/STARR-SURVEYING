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
| **S5** | `/admin/jobs` toolbar | Search + Search button + view-toggle + Deleted button. Buttons line up; verify after the global select chevron + button color contrast fix (also 2026-06-20). |
| **S6** | `/admin/leads` toolbar | Filters + buttons row. |
| **S7** | `/admin/me` + `/admin/profile` | Form rows for personal info / contact methods. |
| **S8** | `/admin/employees/...` directory pages | List filters + add-employee row. |
| **S9** | `/admin/team` + `/admin/field-data` | Field-team status row. |
| **S10** | `/admin/cad` / `/admin/equipment` | Toolbar rows. |
| **S11** | Remaining stragglers — sweep by grep'ing for `align-items: flex-end` + `flex-wrap: wrap` in inline styles. |
| **S12** | QA pass — load every admin route at 1024px / 1280px / 1440px / phone widths and screenshot the toolbars. Anything still misaligned → another slice. |

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

- `app/admin/styles/AdminLayout.css` — `.admin-form-row*` utilities.
- `app/styles/globals.css` — global `select` chevron + `:open` flip.
- `app/admin/styles/AdminAudit.css` — 36px controls + chevron.
- `app/admin/receipts/page.tsx` — filter row split + control heights.
- `app/admin/invites/page.tsx` — inline styles aligned to 36px baseline.
- `app/admin/research/components/Tooltip.tsx` — portal + the
  popup CSS now lives in `AdminLayout.css`.
