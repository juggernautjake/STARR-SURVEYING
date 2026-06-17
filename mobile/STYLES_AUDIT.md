# Starr Field — mobile styles + formatting audit (2026-06-14)

> **Audience.** Anyone writing screens or components under `mobile/`.
>
> **Why.** The user's explicit ask was a "full audit of the mobile app
> styles and formatting for apple and android". This is the audit doc.
> The S3 slice ships the audit + the smallest concrete polish fix the
> audit identified (`warningCallout` palette extension). Larger fixes
> are tracked as follow-up slices so a single auditor pass doesn't
> turn into a multi-hour refactor.
>
> **Counterpart.** The web admin has its own contract at
> `docs/admin-styling-contract.md`. This doc covers only the
> React-native side under `mobile/`.

## What's already strong (don't touch)

- **Three-scheme theme** in `mobile/lib/theme.ts` — light / dark /
  **sun** (high-contrast for direct sun on a phone in 100 °F). That
  third scheme is a real differentiator no other field app ships;
  preserve it.
- **`useResolvedScheme()` + `colors[scheme]` consumption pattern**
  in `mobile/lib/themePreference.tsx`. Hook into it; don't
  duplicate `useColorScheme()` calls.
- **`controls` token export** in `theme.ts` — every input + button
  honors the same 56 px height + 10 px radius. The cross-control
  alignment (TextField + Button in the same row) works because of
  this; keep using it.
- **EAS / app.json permissions + bundle id + deep links** —
  audited and correct (see `mobile/README_TESTFLIGHT.md`). No
  polish needed.
- **Safe-area insets via `react-native-safe-area-context`** —
  `SafeAreaView` is used on every top-level screen. Notch +
  Dynamic Island devices already get the right padding.

## What drifts today

### Hard-coded `#RRGGBB` literals inside React Native styles

The auditor found ~60 hex literals across `mobile/app/` and
`mobile/lib/` that bypass the palette. Three categories:

1. **One-off warning + callout colors** (amber receipt callouts in
   `(tabs)/money/capture.tsx` + `(tabs)/money/index.tsx`). These
   shipped before the warning role was added to the theme.
   **Fixed in S3** via a `warningCallout` palette extension
   (`mobile/lib/theme.ts`).
2. **Inverted-on-dark literals** (`'#FFFFFF'` on a `'#000000'`
   video player background in `(tabs)/capture/[pointId]/video-
   player.tsx`). These are intentional — the video player is
   always dark, regardless of the resolved scheme, because a
   light video player would blow out the contrast on the video
   itself. Document the exception inline; **do NOT migrate**.
3. **Brand-color drift** (`'#1D3095'`, `'#152050'`,
   `'#BD1218'`). These ARE in the theme as
   `palette.accent` / `colors.dark.background` / etc. but get
   hard-coded for the public-facing accept-invite splash so the
   layout reads correctly even before the theme provider mounts.
   **Acceptable for now** — the accept-invite splash is
   pre-provider — but track as S3b if we ever move to a typed
   `BRAND_NAVY` / `BRAND_NAVY_D` / `BRAND_RED` constant block.

### Inconsistent text scale handling

Dynamic Type on iOS + font scale on Android are not consistently
respected. Some `Text` components use raw `fontSize: 13`; others use
the theme's `--text-sm` equivalent. **Tracked as S3c.** Smallest
meaningful fix: a `useScaledFontSize(base)` hook that respects
`PixelRatio.getFontScale()` and a per-screen `allowFontScaling={false}`
escape for cases where overflow matters (e.g. point coordinates in a
small grid cell). Out of scope for S3 (ergonomics polish; not a
correctness bug).

### Tablet layouts

Today every screen stacks single-column on iPad / Android tablet.
The plan flagged a two-pane list + detail view as the right target
for tablet form factors. **Tracked as S3d.** Smallest path: a
`useIsTablet()` hook (`Dimensions.get('window').width >= 768`) and a
conditional `<JobsList />` + `<JobDetail />` layout on the jobs tab.
Out of scope for S3 — it's a real layout refactor that needs its
own slice.

### Empty / loading / error states

The mobile screens DO have empty + loading + error states (the
office-side contract is generally well-followed on mobile). The
gap is that they're inconsistent: some use `<Placeholder />`, some
use inline `<View><Text>` blocks. **Tracked as S3e** — wire every
screen onto the existing `<Placeholder />` component with the
state + message + icon as props.

### Status pill / chip color parity

The mobile `StageChip` + `StatusChip` components in `mobile/lib/`
use a different color set from the web admin's `STATUS_OPTIONS`
table. The result: a lead pinned to "quoted" looks amber-orange on
mobile but yellow on web. **Tracked as S3f.** Color sync requires
the web's `STATUS_OPTIONS` table to import from a shared
constants module the mobile build can also see — either a new
`shared/lead-status.ts` or pulling the existing
`mobile/lib/theme.ts` into the web build path. Both are
non-trivial; tracked separately.

## What ships in S3 today

| Item | Status |
|---|---|
| Audit doc itself | **DONE — this file** |
| `warningCallout` palette extension | **DONE** |
| `WarningCallout` shared component | **DONE** |
| Migrate `money/capture.tsx` amber callout to the new component | **DONE** |
| Migrate `money/index.tsx` amber callout (two spots) to the new component | **DONE** |
| Text-scale audit + hook | **S3c** |
| Tablet two-pane layout | **S3d** |
| State-component normalization | **S3e** |
| Status-pill color parity with web | **S3f** |
| Brand-color constant block (`BRAND_NAVY` etc.) | **S3b** (only if we move pre-provider screens off literals) |

## Recipe: how to add a new shared color role

1. Add the role to the `Palette` interface in `mobile/lib/theme.ts`.
2. Add per-scheme values for `light` / `dark` / `sun` in the
   `colors` record. The sun scheme MUST keep enough contrast to
   read in direct sun (use the deepest red / deepest navy you
   tolerate visually, never a muted mid-tone).
3. Build a shared component if the role appears on more than one
   screen. Don't ask call sites to write `palette.warningCallout.bg`
   + `palette.warningCallout.border` + `palette.warningCallout.title`
   every time — one component, three props.
4. Source-lock the migration in `__tests__/admin-styling/` (the
   `mobile-runbook` test folder is also fine for mobile-only
   shapes).
