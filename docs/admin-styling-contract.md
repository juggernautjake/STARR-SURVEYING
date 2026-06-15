# Admin styling contract

> **Audience.** Anyone writing CSS or inline styles under `/app/admin/`.
>
> **Why.** The admin shell uses a working token system declared in
> `app/styles/tokens.css`, but recent feature work (the leads list +
> detail pages, some receipts dialogs, the contacts editor) drifted
> into ad-hoc `var(--color-primary, #1d3095)` / `var(--color-surface,
> #fff)` names that don't resolve to anything in the token file. The
> fallbacks render OK but the design system stops being a system the
> moment two names mean the same thing.
>
> This doc is the contract going forward. The S2 audit slice ships
> the doc; the same slice fixes every surface this plan touched so
> the leads inbox + detail page already match.

## Where the tokens live

`app/styles/tokens.css` — single source of truth. Loaded globally
through `app/layout.tsx`. Any new admin CSS file MUST consume from
this file; never declare a parallel `:root { --my-thing: … }` block
unless the new token is genuinely additive.

## Names you may use (the canonical set)

### Colour — surfaces
- `--color-bg-app` — page background (the gray shell behind cards).
- `--color-bg-card` — the white surface a card or modal sits on.
- `--color-bg-input` — input + select background (same as card today).
- `--color-bg-subtle` — slightly darker than card, for code blocks /
  pre / "neutral chip" backgrounds (avoid using card-on-card).

### Colour — text
- `--color-text-primary` — the regular body text colour.
- `--color-text-secondary` — labels, captions, "from" lines.
- `--color-text-tertiary` — metadata / age / inline help.
- `--color-text-muted` — disabled / hint placeholder.
- `--color-text-on-dark` — text rendered on the navy sidebar.
- `--color-text-on-brand` — text rendered on a brand-coloured pill.

### Colour — brand + status
- `--color-brand-red` / `--color-brand-red-d` — Starr red CTA +
  hover. The `:focus-visible` ring colour also uses brand-navy.
- `--color-brand-navy` / `--color-brand-navy-d` — Starr navy CTA +
  hover. Used for "secondary" or "office" actions.
- `--color-success` / `--color-success-bg` — completed work, paid
  receipts, approved leads.
- `--color-error` / `--color-error-bg` — destructive actions,
  validation errors.

### Spacing + radii + type
- `--space-1` through `--space-8` — the 4/8/12/16/24/32/48/64 px
  scale. Always use a token name; raw px values are red-flagged in
  review.
- `--radius-sm` / `--radius-md` / `--radius-lg` / `--radius-xl` /
  `--radius-pill`.
- `--text-xs` through `--text-3xl` for font-size; `--weight-normal`
  through `--weight-bold` for weight.

## Names you must NOT introduce

These are the drift names that snuck in. Each one has a canonical
token already; the migration is one find-replace:

| Drift name | Canonical token |
|---|---|
| `--color-primary` | `--color-brand-navy` |
| `--color-surface` | `--color-bg-card` |
| `--color-surface-2` | `--color-bg-subtle` |
| `--color-border` | use `--border-light` for the rule, OR `#E5E7EB` literal inside a border-shorthand |
| `--color-on-status` | `--color-text-on-brand` |

If a future feature needs a name that genuinely isn't in
`tokens.css`, ADD it to `tokens.css` in the same PR — don't invent
a one-off inside the feature stylesheet.

## Inline styles — when they're OK

Inline styles via `style={{}}` are OK when the value is computed at
React render time (a per-row colour swatch, an
`--lead-status-color: <statusColor>` variable, a grid template
that depends on container size). Static styling MUST live in CSS.

The detail page at `app/admin/leads/[id]/page.tsx` currently has
large static `style={{}}` blocks for the responsive grid + the
DetailRow shell. The S2 follow-up slice (S2b) lifts those into the
existing `Leads.css` — out of scope for this audit, but logged as a
follow-up.

## Responsive contract

Breakpoints are owned by `app/admin/styles/AdminResponsive.css`:

| Range | Persona |
|---|---|
| ≤ 480 px | small phone |
| 481–768 px | large phone, glove-friendly touch (44 pt min) |
| 769–1023 px | tablet portrait |
| ≥ 1024 px | desktop / tablet landscape |

Cards on the leads + jobs grids use `grid-template-columns:
repeat(auto-fill, minmax(MIN_WIDTH, 1fr))`. The `MIN_WIDTH` floor
is per-surface and tuned in the surface's dedicated stylesheet
(leads = 320 px on tablet, 1fr on phone — see `Leads.css`).

## Empty / loading / error states

Every list page MUST render explicit states for:
- **loading** — `data-state="loading"` block with a 🌐 / ⏳ icon
- **empty (initial)** — `data-state="empty"` block explaining what
  this surface holds + how to seed it
- **empty (filtered)** — `data-state="filtered-empty"` block when
  rows exist but the active filter has zero matches
- **not-found** (detail pages) — `data-state="not-found"` with a
  back-to-list link
- **error** — `data-state="error"` block with a retry affordance

The leads list at `/admin/leads` covers loading + empty + filtered-
empty; the detail page at `/admin/leads/[id]` covers loading +
not-found. Use these as the reference shapes when authoring a new
surface.

## Audit findings against current surfaces

Captured 2026-06-14 by the Slice S2 author. Each item below is
fixed in the S2 slice OR explicitly deferred with rationale.

### Leads list — `app/admin/leads/page.tsx`
- **DONE** Status pill + relative-age timestamp (Slice S1b).
- **DONE** mailto:/tel: links (Slice S1b).
- **DONE** Responsive grid 320 px tablet floor + 1fr phone (Slice S1b).
- **FIXED IN S2** drift names `--color-primary`, `--color-surface`
  in `Leads.css` migrated to `--color-brand-navy`, `--color-bg-card`.

### Leads detail — `app/admin/leads/[id]/page.tsx`
- **DONE** Five data sections + mailto:/tel: links (Slice S1).
- **FIXED IN S2** inline `var(--color-primary, #1D3095)` → `var(--color-brand-navy)`,
  `var(--color-surface-2, #f8f9fa)` → `var(--color-bg-subtle)`,
  `var(--color-text-secondary, #6b7280)` keeps the canonical name.
- **DEFERRED (S2b)** lift the inline `style={{}}` grid + DetailRow
  blocks into `Leads.css` (cosmetic — not a system drift, just an
  ergonomics issue when re-using DetailRow elsewhere).

### Jobs list — `app/admin/jobs/page.tsx`
- **NOT TOUCHED** — out of scope for this audit. Existing markup
  uses canonical tokens already; no drift to fix.

### Receipts list — `app/admin/receipts/page.tsx`
- **NOT TOUCHED** — out of scope for this audit. The Q1/Q2/D1
  surfaces don't intersect with receipts UX; the receipt-approval
  flow gets its own audit slice if/when polish work lands there.

### Contacts list — `app/admin/contacts/page.tsx`
- **NOT TOUCHED** — out of scope for this audit. Lives parallel
  to the leads inbox; not modified by Phase Q.

## Lint enforcement

Manual for now. A future improvement (S2c) wires a
`stylelint-declaration-strict-value` rule that flags raw colour
values + unknown `--color-*` names inside `app/admin/styles/*.css`.
Logged here so it doesn't disappear; not blocking the current
slice.

## Quick reference card

```css
/* Canonical card */
.my-feature-card {
  background: var(--color-bg-card);
  border: 1px solid #E5E7EB;
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  color: var(--color-text-primary);
}

/* Brand CTA */
.my-feature-card__cta {
  background: var(--color-brand-navy);
  color: var(--color-text-on-brand);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-4);
  font-weight: var(--weight-semibold);
}

/* Destructive */
.my-feature-card__cta--danger {
  background: transparent;
  color: var(--color-error);
}
```
