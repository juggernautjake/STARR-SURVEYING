# Mobile + Customer-Query Gap Plan — 2026-06-14

> **Context** — A wide architecture survey (background subagents, 2026-06-14)
> proved the foundation listed in the user's ask already exists:
>
> - The `mobile/` Expo Router app is real, with auth, jobs/capture/money/me/gear
>   tabs, receipt camera→AI extraction, point-tagged photo capture, working
>   offline upload queue, EAS profiles, deep links, and all iOS/Android
>   permissions configured.
> - The Supabase schema already has `jobs`, `contacts`, `job_team`, `receipts`
>   (with `extraction_status`/`ai_confidence_per_field` for Claude vision),
>   `notifications`, `leads` (`/seeds/292_leads.sql`), `field_data_points`,
>   and `field_media` with a `data_point_id` foreign key.
> - `/app/admin/leads/page.tsx` exists and lists leads with the right status
>   pipeline (`new`→`contacted`→`quoted`→`accepted`→`declined`/`lost`).
> - The public contact form at `/app/api/contact/route.ts` (~1,280 lines) sends
>   two well-formatted Resend emails (business + customer confirmation) with
>   attachment support.
>
> **What's actually missing** is the wiring BETWEEN these systems. That's
> what this plan ships. No greenfield rewrites; surgical extensions.

## Direction (the short version)

Four real gaps, ordered by user impact:

1. **Q1 — Contact-form → `leads` table.** The form sends email but never INSERTs
   into the table whose page is already built. Surveyors see customer queries
   in their inbox but not in the admin UI. Fix at the API route.
2. **Q2 — Lead notifications to role-bearing employees.** When a quote comes
   in, `notifyMany()` the people with the `admin` / `employee` /
   `equipment_manager` / `field_crew` roles so the bell icon lights up before
   they check email.
3. **M1 — Mobile build for iPhone (you + your dad).** EAS credentials are
   placeholders; flip them, run `eas build --profile preview --platform ios`,
   install via TestFlight internal. No code changes — just the operator steps.
4. **D1 — TRV import auto-attach for point media.** Mobile-captured photos
   already carry `data_point_id`. When the office imports a TRV that introduces
   matching point names, the import handler should scan `field_media` by
   `data_point_id` (or by `point_name` for the no-id-yet case) and surface the
   thumbnails on the point row.

Three deferred items, with explicit rationale (NOT shipped here):

- **M-11a — Mobile role bundle gating.** Deferred behind the web-side M-9
  JWT refactor that hasn't shipped. Until web emits role claims in the
  Supabase JWT, the mobile app can't read them. (Documented in
  `STARR_FIELD_MOBILE_APP_PLAN.md`.)
- **CAD-PORTAL — Customer query portal.** A surveyor-facing inbox already
  ships via leads + notifications. A *customer*-facing thread view is its
  own product surface; out of scope until the four items above stabilize.
- **Anthropic-vision-on-mobile.** Receipt OCR already runs server-side; the
  mobile flow queues and polls. Moving inference to the device adds
  $ on every job and shaves <2 s off the round-trip — not worth it yet.

## Constraints baked into every slice

- **Do NOT duplicate existing surfaces.** `leads` page exists. Notifications
  table exists. Mobile photo capture exists. Receipts exist. Every slice
  EXTENDS one of these; never creates a parallel one.
- **No new orgs / scopes.** Reuse `default_org_id` on the user row.
- **Surfaces stay backwards-compatible.** The email send keeps firing
  unchanged after Q1. The mobile EAS dev/preview/production profiles only
  get credential edits, not structure changes.
- **Tests follow source-lock pattern.** Same `__tests__/` convention used by
  the desktop + perf plan.

## Phase Q — Customer query intake reaches the office

**Q1 shipped 2026-06-14** — `lib/leads/intake.ts` exports
`INTAKE_ROUTING_ROLES`, `buildLeadRowFromForm` (pure mapper) and
`insertLeadFromForm` (safe-insert; logs + returns null on failure).
`/app/api/contact/route.ts` builds the intake payload once via
`buildLeadIntake()` and runs the INSERT after the email send on BOTH
the production and dev-mode return paths so local UI work on
`/admin/leads` has real rows without Resend configured. Calculator vs
contact-form intent preserved in `source` ('Pricing Calculator' /
'Website'). Source-locked by `__tests__/leads/intake.test.ts` (16
assertions on the pure mapper + safe-insert behavior + route
integration).

**Q2 shipped 2026-06-14** — `lib/leads/intake.ts` adds
`findIntakeRecipients` (queries `registered_users.roles` for an
`.overlaps(INTAKE_ROUTING_ROLES)` match, drops banned and unapproved
users, never throws) and `notifyIntakeRecipients` (fires
`notifyMany` with type `'lead.new'`, body
`<serviceType> · <propertyAddress> · Ref: <ref> · 🔥 RUSH?`, deep
link `/admin/leads?focus=<leadId>`, `escalation_level: 'high'` when
the calculator's rush flag was set, `'normal'` otherwise). Wired into
both the production return path and the dev-mode short-circuit so the
bell icon lights up locally too.

**Q3b shipped 2026-06-14** — Leads page polish completes Phase Q.
- **URL-persisted status filter.** `useRouter` + `useSearchParams`
  seed initial filter state from `?status=<key>`, and a new
  `setStatusFilterAndUrl` callback mirrors every pill click to the
  URL via `router.replace` (no history pollution). A "show me new
  only" view is now shareable + the back button restores the right
  pill instead of resetting to All.
- **Mark contacted quick action.** A single-tap button beside the
  status select on every still-`new` lead card. Carries
  `data-action="mark-contacted"` for future styling hooks; advances
  the lead via the existing PATCH path so the same UI feedback
  applies.
- **Notification auto-dismissal.** `/api/admin/leads` PATCH side-
  effects the moment `status` moves off `new`: an
  `UPDATE notifications SET is_dismissed = true` keyed by
  `source_type='leads' AND source_id=<leadId> AND type='lead.new'
  AND is_dismissed = false` clears the bell-icon entry the second
  the office claims the lead, so the unread count reflects work-
  in-progress rather than work-already-claimed. Best-effort: a
  dismissal failure logs but never breaks the status change.
- Source-locked by `__tests__/leads/q3b-page-polish.test.ts` (10
  assertions: URL-persist initial seed, replace-not-push behavior,
  click handlers rewired, button gating to `new`-only,
  data-action, PATCH dismiss query shape, and the swallowed-error
  contract).

Full suite after Q3b: 8224 green (+10 from this slice).

**Q3 (focus param half) shipped 2026-06-14** — `/admin/leads`
reads `?focus=<leadId>` via `useSearchParams`, attaches a ref to the
matching card, `scrollIntoView({ behavior: 'smooth' })` on mount,
and outlines the focused card with `var(--color-primary)` so the
linked-from-notification card is obvious. Card carries
`data-focused="true"` for future styling hooks. The status-filter
URL persistence + a `Mark contacted` quick-action remain in scope
for Q3b once the new design surface from S1 lands.

Full suite after Q1+Q2+Q3: 8190 green (+11 from this slice).

### Q1 — Contact-form writes a `leads` row
After the existing email send in `/app/api/contact/route.ts`, INSERT a
`leads` row using `supabaseAdmin`. Field mapping:

| `leads` column      | Source on form                                 |
|---------------------|------------------------------------------------|
| `name`              | `body.name`                                    |
| `email`             | `body.email`                                   |
| `phone`             | `body.phone`                                   |
| `company`           | `body.company`                                 |
| `source`            | `'Website'` (always, for now)                  |
| `status`            | `'new'`                                        |
| `property_address`  | join of `propertyAddress` / `city`             |
| `survey_type`       | `body.serviceType`                             |
| `estimated_acreage` | `body.acreage` (when present)                  |
| `notes`             | `body.projectDetails` + the unique ref number  |
| `created_by`        | `'website-form'` (sentinel for "not a logged-in employee") |

Failure mode: if the email send succeeds but the INSERT throws, log + report
but DON'T return a 500 to the customer. The email is the legal record;
the table is a UI convenience. Source-lock with a test that injects a
mock `supabaseAdmin` and asserts the INSERT shape per branch (full form
vs. minimal contact-only form vs. pricing-calculator form).

### Q2 — Notify employees with intake roles
After Q1's INSERT, dispatch an in-app notification to every user whose
`roles` array intersects with the intake-routing roles
(`['admin', 'employee', 'equipment_manager', 'field_crew']` —
configurable via a single exported constant `INTAKE_ROUTING_ROLES`).

Notification shape:
```
{
  type: 'lead.new',
  title: 'New customer query: <name>',
  body: '<surveyType> · <city>, <state> · ref <referenceNumber>',
  icon: 'mail',
  link: '/admin/leads?focus=<leadId>',
  source_type: 'leads',
  source_id: '<leadId>',
  escalation_level: rush ? 'high' : 'normal',
}
```

`/admin/leads` learns to read the `focus` query param and scroll/expand
that lead's row on mount. Source-lock both the notification dispatch
shape AND the leads-page focus param.

### Q3 — Leads admin page polish
Two small polish items so the page is genuinely useful as a query inbox:
- **Status filter persists in URL** so a "show me new only" view is shareable.
- **Mark-as-contacted button** writes `status='contacted'` + clears the
  matching notification (helper already exists in `lib/notifications.ts`).

## Phase M — Get the mobile app on your iPhone

> **No new code in this phase — operator runbook only.** The mobile app
> ships everything you need; the gap is Apple Developer credentials.

**M0 shipped 2026-06-14** — Runbook + pre-flight validator. The
operator-facing TestFlight steps (M1–M5) are still ops-only, but
now they have BOTH a written runbook AND a script-level guardrail
that refuses to dispatch `eas build` / `eas submit` while
`mobile/eas.json` still has any `REPLACE_WITH_*` placeholder.
- `mobile/README_TESTFLIGHT.md` — full step-by-step from "before
  you touch a keyboard" through "smoke test the field flow",
  including the App Store Connect record fields, the EAS commands
  to run, both phones' install paths, and a troubleshooting table.
- `mobile/scripts/check-eas-config.mjs` — pure walker that flags
  every `REPLACE_WITH_*` leaf with its dotted path. Run via
  `npm run check-eas`; new build/submit scripts
  (`build:ios` / `build:android` / `submit:ios` / `submit:android`)
  all gate behind it via `npm run check-eas && eas …`.
- Source-locked by
  `__tests__/mobile-runbook/check-eas-config.test.ts` (11
  assertions across the placeholder walker, the still-placeholder
  state of the committed `eas.json` (no credentials in git!), the
  package.json script wiring, and the runbook contents).

With M0 in place, M1–M5 become a 45-minute operator run:
fill in three values, follow the runbook, app is on both phones.

### M1 — EAS credentials filled in
Replace placeholders in `mobile/eas.json`:
- `appleId`: your Apple ID email (the one with developer access)
- `ascAppId`: the App Store Connect numeric app ID
  (visible in ASC after creating the app record)
- `appleTeamId`: the 10-character team identifier from your Apple
  developer account

For your dad: register his Apple ID under your developer team as a tester.

### M2 — One-time iOS app record on App Store Connect
- Bundle ID `com.starrsoftware.starrfield` — already in `app.json`
- Create the app in App Store Connect with that bundle ID; SKU and primary
  language can be anything sensible (`STARRFIELD0001`, `English (U.S.)`)
- DO NOT submit to the store yet — TestFlight internal track is enough for
  you and your dad

### M3 — First TestFlight build
```bash
cd mobile
npm install --force        # one-time
eas login                   # interactive — sign in with your Apple ID
eas build --profile preview --platform ios
```

The first build will ask if EAS should manage your provisioning profile +
distribution certificate. Say yes (it's the recommended path; "I don't
have one" is the right answer to both follow-ups).

Build takes ~15 min on the EAS cloud. When it finishes, run:

```bash
eas submit --profile production --platform ios --latest
```

This sends the just-built `.ipa` to App Store Connect → TestFlight.

### M4 — Install on phones
- You: install the TestFlight app from the App Store; accept the invite
  email Apple sends after `eas submit` lands.
- Your dad: add his Apple ID as an Internal Tester in App Store Connect
  (`Users and Access → Testers`); he gets the same TestFlight invite.

### M5 — Smoke test on each phone
Run the field flow once on each device:
1. Sign in (the existing email + password flow works against production
   Supabase out of the box).
2. Open the Money tab → tap the capture FAB → snap a receipt → preview →
   approve. Verify it appears in `/admin/receipts` on web within 30 s.
3. Open Jobs → pick a real job → tap Points → tap a point → Photos →
   capture a photo. Verify it appears under that point in the job detail
   view on web.

If any of (1)/(2)/(3) fails on device, those become their own slices
(M5a/b/c). Don't pre-emptively build for failures — fix what actually
breaks on real hardware.

### M6 — Android (deferred until iOS is stable)
The same flow ships for Android, but you and your dad both have iPhones.
Deferring keeps focus tight. When you need it:
- Add `serviceAccountKeyPath` for Google Play (or `eas credentials` setup)
- `eas build --profile preview --platform android` produces an APK you
  can sideload onto any Android phone for testing without the Play Store

## Phase D — Mobile photos auto-attach on TRV import

**D1 (schema + reconcile helper) shipped 2026-06-14** —
Mobile already writes `field_media` rows with `data_point_id` set when
the point exists at capture time (strategy 1). When the point does NOT
yet exist on the office side (mobile offline / pre-import capture),
the surveyor still typed the point name on the rover screen, so we
just needed a column to remember it.

`seeds/293_field_media_point_name.sql` adds `point_name TEXT NULL` to
`field_media` plus a partial index on `(job_id, point_name) WHERE
data_point_id IS NULL` so the reconcile query stays cheap.

`lib/field-data/reconcile.ts` exports `reconcileOrphanFieldMedia(client,
{ jobId, points })` — for each new `field_data_points` row, UPDATEs
the matching orphan media rows by `(job_id, point_name, data_point_id
IS NULL)` and returns counts (total + per-point + remaining orphans).
Never throws; partial-success contract so a single bad row can't sink
the surrounding TRV import. Source-locked by
`__tests__/field-data/reconcile.test.ts` (7 assertions covering both
binding paths, empty inputs, defensive empty-name skip, per-point
error continuation, and the schema seed shape).

**D1b shipped 2026-06-14** — mobile capture writes `point_name`.
- `mobile/lib/db/schema.ts` adds `point_name: column.text` to the
  local `field_media` table, positioned right after `data_point_id`
  so column order matches the seed.
- `mobile/lib/fieldMedia.ts` exports a pure `normalizePointName`
  helper (trim → upper-case → empty-to-null) and the
  `useAttachPhoto()` hook now takes an optional `pointName` on
  `AttachPhotoInput`. The destructure pulls it; the normalized value
  is written as the 4th column of the INSERT. Empty/whitespace
  inputs land as NULL, mixed case is forced to upper so `bm-01` and
  `BM-01` collide on the office-side reconcile join.
- Source-locked by
  `__tests__/field-data/mobile-point-name-capture.test.ts` (9
  assertions on the schema, the type surface, the destructure, the
  normalize call, the INSERT column list, and the casing/trim
  contract). Locked by source-string so the office test tree
  doesn't pull in React-native.
- Callers (`mobile/app/(tabs)/capture/[pointId]/photos.tsx`,
  `mobile/app/(tabs)/jobs/[id]/points/[pointId].tsx`) still pass
  the same args today; adopting `pointName` from the point-detail
  screen's currently-typed value is a UI tweak (D1d, ~10 LOC) so
  not folded here.

**D1d shipped 2026-06-14** — every per-point capture screen now
passes `point.name` through to the matching attach hook.
- `mobile/lib/fieldMedia.ts` — `AttachVoiceInput` and
  `AttachVideoInput` grow the same optional `pointName?: string |
  null` D1b added to `AttachPhotoInput`. Both hooks destructure
  the prop, run it through the shared `normalizePointName`
  helper, and write it as the 4th column of the corresponding
  `INSERT INTO field_media (id, job_id, data_point_id, point_name,
  …)`. All three media surfaces now populate the same column.
- `mobile/app/(tabs)/capture/[pointId]/photos.tsx` — passes
  `pointName: point.name ?? null` to both `attachPhoto({...})` and
  `attachVideo({...})`.
- `mobile/app/(tabs)/capture/[pointId]/voice.tsx` — passes the
  same prop to `attachVoice({...})`.
- Source-locked by
  `__tests__/field-data/mobile-screens-pass-point-name.test.ts` (8
  assertions covering both type-surface additions, both INSERT
  column-list updates, the normalizer-call-count invariant, and
  the three screen pass-throughs).

**Remaining D1 follow-up (D1c):** wire `reconcileOrphanFieldMedia(...)`
into the office's TRV import handler. The current TRV-to-points flow
runs entirely on the CAD canvas and never lands in Supabase, so the
slice needs the CAD canvas to grow a "publish points to Supabase"
button first. That's a larger surface than this plan covers — kept
deferred until a separate planning doc opens for the CAD↔Supabase
publish surface.

Full suite after D1 (schema+helper): 8197 green (+7 from this slice).

### D1 — Photos appear on the point row after import
Mobile already writes `field_media` rows with `data_point_id` set when the
photo was captured at a known point. The TRV import path on web creates
`field_data_points` rows but doesn't look backward for matching media.

Three matching strategies, in priority order:

1. **`data_point_id` direct match.** Mobile rows captured AFTER a point
   was synced down already carry the right UUID. Just surface them.
2. **`point_name` join.** Mobile rows captured before the point existed
   (the surveyor was offline, the point hadn't yet round-tripped to web)
   carry a `point_name` text field. The import handler can `UPDATE
   field_media SET data_point_id = <new uuid> WHERE data_point_id IS
   NULL AND point_name = <imported.name> AND job_id = <import.job_id>`.
3. **Manual reconcile.** Leave a "Reconcile media" button on the job
   detail page that lists media without a point match and lets the
   office user drag-drop assignments.

Ship strategies 1 + 2 in D1. Strategy 3 (D2) only if there's actual
demand after a few weeks of real use.

Source-lock with a fixture: a TRV import where the test feeds three
candidate `field_media` rows (one matching by id, one matching by name,
one unmatched), asserts the right two attach + the third stays orphaned.

## Risk register

- **Lead INSERT failure mid-form-submit.** Mitigation in Q1: the email send
  stays the source-of-truth; INSERT failures log + alert but don't 500.
- **Notification flood.** If every casual contact triggers a notify, the bell
  becomes noise. Mitigation in Q2: only fire on form_type === 'quote-request'
  / 'pricing-calculator' / explicit "I want a quote" path; pure-contact
  inquiries email-only. Tune the trigger set inside Q2.
- **TRV import re-runs creating duplicate media bindings.** Mitigation in
  D1: the UPDATE in strategy 2 keys on `data_point_id IS NULL`; a second
  import can't re-bind a row that already has an id.
- **EAS build failure on first run.** Common cause: Apple developer team
  agreement not signed for the year. Workflow surfaces a clear URL; the
  fix is two clicks on developer.apple.com.

## Phase S — Styling pass (post-wiring)

User asked (2026-06-14) for a full styling audit + full build on the
new query surfaces (desktop AND mobile), plus a full mobile app styles
audit for iOS and Android. Sequenced AFTER the wiring slices so we
polish the final surface, not an interim one.

### S1 — New-query surface design build
- `/admin/leads` page: dense table → card+detail-pane layout that reads
  on a tablet, full-screen on phone (the user reviews queries from the
  truck), shows status pill, customer + property + survey type, and a
  one-tap "Mark contacted" + "Open in jobs" affordance.
- New `/admin/leads/[id]` detail page (deep-linkable via the Q2
  notification `link` field) with the full submission body, attachment
  thumbnails, the reference number, and quick conversion to a Job.
- Source-lock the layout structure + the accessible-color contrasts
  that drive the status pills.

### S2 — Web admin design-system audit
Document, then enforce, the surfaces under `/admin/` that the new query
flow touches: leads, jobs, contacts, receipts. Catalogue:
- shared CSS files in `app/admin/styles/` (use the existing pattern, do
  NOT introduce a new system),
- a contract for empty/loading/error states (today, half the pages
  blank-screen on no rows),
- responsive breakpoints (the user reviews on both desktop + iPad),
- dark-mode parity (some admin pages have light-only color tokens).

Result: a `docs/admin-styling-contract.md` plus targeted fixes on the
surfaces this plan touches. No rewrites of unrelated surfaces.

### S3 — Mobile app styles + formatting audit
Full audit of `mobile/` for iOS and Android visual parity:
- Tab bar + headers consistent with the brand red/blue from
  `mobile/lib/theme.ts`.
- Text scale handles Dynamic Type on iOS + font scale on Android.
- Safe-area insets respected on notch / Dynamic Island devices.
- Tablet layouts (iPad + 10"+ Android) use a two-pane list+detail view
  instead of stacking.
- Status pills + the StageChip / StatusChip components in `mobile/lib/`
  match the web's color tokens (a query "new" pill should look the same
  in the office and in the field).
- Every screen has a real empty state, a real loading state, and a
  real error state (today some are blank).
- Light + dark mode parity confirmed by inspection on the four target
  fixtures: iPhone 15 / iPad 11" / Pixel 8 / Android tablet.

Source-lock the components touched. Don't try to ship a perfect dark
mode in one slice; ship the audit doc + the top-3 issues first.

## Slice order (recommended)

Risk-ordered, smallest-meaningful-first:

1. **Q1** — Contact-form writes a `leads` row (1 PR, mostly the API change)
2. **Q2** — Lead notifications to intake roles (1 PR, ~80 lines + test)
3. **Q3** — Leads page polish (1 PR, focus param + URL persistence)
4. **M1** — EAS credentials (no PR; ops-only)
5. **M2–M5** — Apple/TestFlight runbook + first phone install
6. **D1** — TRV import auto-attach (1 PR with a fixture)
7. **S1** — New-query surface design build (desktop + mobile-web responsive)
8. **S2** — Web admin design-system audit doc + targeted fixes
9. **S3** — Mobile app styles + formatting audit (iOS + Android)

Items 1–3 land before item 4 so you have a working "queries land in the
office" loop the same hour your dad's TestFlight build installs.
Items 7–9 follow so we polish the final shape, not an interim one.

## TL;DR

| Surface | Status |
|---------|--------|
| Mobile app structure / camera / upload queue / receipts / point capture | **DONE** |
| Mobile auth against Supabase | **DONE** |
| Public contact form + email send | **DONE** |
| `leads` table + admin page | **DONE** |
| Contact form → `leads` INSERT | **MISSING → Q1** |
| Employee notification on new query | **MISSING → Q2** |
| iPhone install for you + your dad | **OPS-ONLY → M1–M5** |
| TRV import attaches mobile photos | **MISSING → D1** |
| Customer-facing query portal | **DEFERRED — out of scope** |
| Mobile role-bundle gating | **DEFERRED — gated on web M-9** |
