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

## Navigation — every admin page has a back / up affordance (F1)

Do **not** hand-roll per-page "← Back to X" links. The shared
`AdminPageHeader` (rendered by `AdminLayoutClient` when nav-v2 is on)
renders a full breadcrumb trail **and** a leading "‹ back" button on
every route — including detail / `[id]` pages — driven by
`breadcrumbTrail(pathname)` / `parentCrumb(pathname)` in
`lib/admin/route-registry.ts`.

- A new top-level page only needs an entry in `ADMIN_ROUTES` (href +
  label + workspace) to get a labeled crumb; detail pages resolve a
  derived leaf label automatically.
- If a page genuinely needs an in-content back link (e.g. a full-bleed
  editor that bypasses the chrome), use a single consistent affordance,
  not ad-hoc copy. Don't ship `← Back`, `‹`, and `Back to …` variants
  on different pages.

## Icons — lucide for function / nav; emoji decorative-only (F2)

Functional and navigational icons are **lucide-react**, never emoji.
Emoji render differently per OS, don't inherit `currentColor`, and clash
with the lucide line-icon nav (IconRail, sidebar, breadcrumbs, FABs).

- Use `RouteIcon` from `lib/admin/route-icons.tsx` (maps a lucide name
  string → component, `Circle` fallback) for registry-driven icons, or
  import the lucide component directly for one-offs.
- Emoji are allowed ONLY as decorative content or as the payload of an
  emoji feature (e.g. the messenger emoji picker / reactions) — never as
  the sole affordance for an action, nav target, or status.
- Size nav/inline icons 16–18px, FAB/section icons 22–28px,
  `strokeWidth` 1.75–2.

## Control heights — 40px is the baseline, and it is not negotiable per page

> Rewritten 2026-08-14 by the admin alignment audit. **This section used to
> say the baseline was 36px. It was wrong, and being wrong here is what the
> owner was looking at.** `tokens.css` has said 40px since the U-11
> overhaul, `forms.css` has enforced 40px on every admin input and select
> since the same day, and pages that trusted the 36px number here (or
> picked their own 28 / 32 / 34 / 35) ended up with a button that does not
> match the field beside it.

**The sizes.** All four already exist in `app/styles/tokens.css`. Never
write a control height as a literal:

| Token | Value | Where it goes |
|---|---|---|
| `--input-height` | 40px | every input, select and textarea. Enforced. |
| `--button-height` | 40px | **the default button.** Anything on a row with a field. |
| `--button-height-sm` | 32px | a dense toolbar or an in-row action — only where the row has no input or select in it. |
| `--button-height-lg` | 48px | at most one hero action per screen. |

**Inputs and selects are already handled — and they will ignore you.**
`forms.css` sets `height: var(--input-height)` at
`.admin-layout__content input[type=…] / select / textarea`, specificity
(0,1,1). A page rule like `.my-page__select { height: 34px }` scores
(0,1,0) and **loses silently**: the stylesheet says 34, the screen renders
40, and the button next to it — which the blanket rule never reaches,
because admin buttons are named BEM-style (`lead-card__btn`, not `.btn`) —
renders at 34. That 6px is the defect, repeated across the product.
`AdminAssignments.css` even carries a comment explaining that its pill and
its select were deliberately matched at 28px "so they line up"; the select
has been rendering at 40px ever since.

**So there are exactly two moves.**

1. *Standard row* — give the page's own button class the token and delete
   the literal. One line, and the select beside it already matches:

   ```css
   .my-page__btn { height: var(--button-height); padding: 0 var(--button-padding-x); }
   ```

2. *Genuinely dense row* — do NOT fight the specificity. Redefine the
   token on the row container; custom properties inherit, so the select
   (through `forms.css`) and the button (through its own rule) both follow,
   and no new number enters the codebase:

   ```css
   .my-page__filter-bar {
     --input-height: var(--button-height-sm);   /* 32px, both controls */
     --button-height: var(--button-height-sm);
   }
   ```

   This is the supported way to make a row compact. Adding specificity
   (`.admin-layout__content .my-page__select { … }`) works too and reads
   worse; prefer the token.

**Give every `<input>` a `type`.** `forms.css` reaches inputs through an
enumerated list — `input[type="text"]`, `[type="email"]`, and eight more.
HTML defaults a typeless `<input>` to text, so `<input value={x} …>` looks
like an ordinary text field and matched **none** of those selectors: it
skipped the height, the padding, the border and the focus ring, and fell
back to whatever its own page said. 178 admin inputs were in that state
before 2026-08-14. `input:not([type])` is in the selector list now, so
they are covered — but write the `type` anyway. It is what the next
person greps for.

**The shared button class is `.admin-btn`** (`AdminLearn.css`, used in 45
files). It reads `min-height: var(--button-height)`; `.admin-btn--sm`
reads `var(--button-height-sm)`. Reach for it before authoring another
`{page}__btn`, and never re-add vertical padding to it — padding was how
it drifted to 43px beside 40px fields in the first place.

**Floors.** Nothing interactive renders under 28px — the alignment sweep
fails it as `small-target`. In practice that means an inline row action is
`--button-height-sm` (32px), not a hand-rolled 26px.

**The row itself** uses the `.admin-form-row*` utilities in
`AdminLayout.css`; do not hand-roll `style={{ display:'flex' }}` filter
rows (they drift out of alignment when the row narrows).

- Row: `.admin-form-row` (flex, `align-items:flex-end`, wraps).
- Labeled column: `.admin-form-row__field` (+ `--narrow` / `--fill`).
- Inputs/selects: `.admin-form-row__input` / `__select`.
- Action button: `.admin-form-row__action` (`flex-shrink:0`,
  `white-space:nowrap`) so it never drops below the inputs.
- Every control in these utilities now reads its height from the tokens
  above, including `<input type="date|time|datetime-local">`, whose native
  calendar chrome otherwise overhangs its siblings.
- The global reset (`.admin-layout input/textarea/select`,
  checkbox/radio 16×16, file-input) neutralizes the marketing-form
  globals — don't re-introduce `width:100%` / `2px` borders / bottom
  margins on admin controls via inline styles.

**Proving it.** `node --env-file=.env.local scripts/ui-align-audit.mjs`
measures every admin route and reports any two controls on the same visual
row whose centres differ by ≥1.5px or whose heights differ by ≥4px. A
change to a control's size is finished when that count has not gone up.

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
