# Software Update Distribution — Planning Document

**Status:** RFC / sub-plan of `STARR_SAAS_MASTER_PLAN.md` §5.5
**Owner:** Jacob (Starr Software)
**Created:** 2026-05-13
**Target repo path:** `docs/planning/in-progress/SOFTWARE_UPDATE_DISTRIBUTION.md`

> **One-sentence pitch:** Release management surface at `/platform/releases` for tagging new versions, writing release notes, scheduling rollouts, and triggering mobile EAS OTA channels — paired with a customer-side "What's new" banner driven by version-bump detection.

---

## 0. Decisions locked

| Q | Decision | Rationale |
|---|---|---|
| **Master Q6 — Desktop client?** | **Deferred** — web + mobile sufficient for v1 | Saves ~3 months. Revisit if pattern of "I'd pay extra for desktop" feedback emerges after first 20 customers. |
| **Web deploy mechanism** | Vercel (already in use) — auto-deploy on main push | Existing |
| **Mobile update channel** | EAS Updates with channel-based rollout (already configured in `mobile/eas.json`) | Existing |
| **Release-notes data flow** | Server-side `releases` table → customer-side banner on version bump | Loose coupling; resilient to mobile/web version drift |

---

## 1. Goals

1. **Operator publishes a release in <60 seconds.** Title, notes (Markdown), affected bundle(s), rollout strategy.
2. **Customer sees a "What's new" banner** on next login if their org's bundle was touched + they haven't acked.
3. **Mobile clients pull updates silently** via EAS; required updates force re-launch.
4. **Web clients get instant updates** via Vercel deploy; release-notes banner is the only customer-visible signal.
5. **Audit every release** — published by, when, audience, delivery counts, ack rate.
6. **No "update failed" customer support tickets.** Auto-update is invisible when working; failure is loud + retryable.

### Non-goals

- Desktop client distribution (deferred — see §0).
- Per-tenant release pinning ("freeze us on v2.3 until we approve v2.4"). Possible at Firm Suite tier but deferred.
- Beta / early-access program. Add when there are >50 customers.
- Self-hosted on-premise deployment. Not applicable to SaaS model.

---

## 2. Release lifecycle

```
operator drafts → publishes (immediate / scheduled / canary) → rolls out → customers acknowledge

   draft           pending           publishing            published
    │                │                  │                     │
    └───────► [+ tag] ──► [+ schedule] ──► [+ rollout %] ──► [retired*]
                                                                  *only when
                                                                  superseded
```

**Stages:**
- **Draft**: operator composing; not yet visible.
- **Pending**: scheduled for a future time; visible to operator only.
- **Publishing**: in active rollout (canary 10% / 50% / 100%); some customers see it, others don't.
- **Published**: 100% rolled out; all relevant customers see banner.
- **Retired**: superseded by a newer release on the same bundle. Banner clears.

---

## 3. Release composer — `/platform/releases/new`

```
┌──────────────────────────────────────────────────────────────────┐
│ New release                                                        │
├──────────────────────────────────────────────────────────────────┤
│ Version:        [v2.4.0_________________]   (semver; required)    │
│ Git tag:        [v2.4.0]                    (auto from main HEAD)  │
│ Affected bundles: [✓] CAD  [✓] Office  [_] Recon  [_] Field  [_] Academy │
│                                                                    │
│ Release type:  ( ) Feature  ( ) Bugfix  ( ) Breaking  ( ) Security │
│                                                                    │
│ Required update: [ ] Force mobile clients to update                │
│                                                                    │
│ Release notes (Markdown):                                          │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ ## New                                                        │ │
│ │ - AI-suggested annotations in CAD editor                      │ │
│ │ - Per-job batch import for Office                             │ │
│ │                                                                │ │
│ │ ## Fixed                                                       │ │
│ │ - DXF export no longer freezes (#42)                          │ │
│ │ - Login redirect loop on Safari                               │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│ Rollout strategy:                                                  │
│   ( ) Immediate — all customers see it now                         │
│   ( ) Canary 10% → 50% → 100% over 24 hours                        │
│   ( ) Scheduled at [2026-05-13 14:00 CT]                           │
│   ( ) Specific tenants only: [+ Add orgs]                          │
│                                                                    │
│ Mobile OTA: [✓] Trigger EAS update on publish                      │
│ Mobile channel: ( ) production  ( ) preview  ( ) internal          │
│                                                                    │
│ Audience preview: 24 organizations · 89 users will be notified     │
│                                                                    │
│ [Save draft] [Schedule] [Publish now]                              │
└──────────────────────────────────────────────────────────────────┘
```

Audit log entry on every state transition.

---

## 4. Customer-side surfaces

### 4.1 "What's new" banner on Hub

When `app.version > user.last_acked_version` and the new release touches a bundle this org has access to:

```
┌──────────────────────────────────────────────────────────────────┐
│ 🎉 What's new in v2.4.0                                           │
│ New AI-suggested annotations in CAD; faster Office bulk imports;  │
│ critical DXF export bug fixed.                                     │
│                              [Read full notes] [Dismiss]           │
└──────────────────────────────────────────────────────────────────┘
```

Sits at the top of `/admin/me` (between AdminPageHeader and HubGreeting). Dismissed via `release_acks` insert.

### 4.2 Release archive — `/admin/announcements`

Per CUSTOMER_PORTAL.md §3.9. List of every release affecting this org's bundles + maintenance windows. Search + filter.

### 4.3 Mobile

Existing Expo Updates API (`Updates.checkForUpdateAsync()`) fires on app launch. If a new bundle is available:

- **Not required**: silent download in background; applied on next launch. Customer sees "Updated to v2.4.0" toast.
- **Required**: download + force re-launch. Toast: "Update required — restarting…"

EAS update message becomes the in-app changelog snippet.

---

## 5. Backend wiring

### 5.1 Publish flow

1. Operator clicks "Publish now" at `/platform/releases/[id]`.
2. Server-side:
   - Update `releases.published_at = now()`.
   - Resolve audience: every org with at least one of the affected bundles in their `subscriptions.bundles`.
   - Create `org_notifications` rows for each affected org + user. Channel: in-app (always), email (per-user pref).
   - If `mobile_ota` was checked: dispatch a webhook to a server-side helper that calls `eas update --channel <selected>`. (EAS CLI not directly callable from a serverless function; trigger a GitHub Action or a dedicated container.)
   - Audit-log entry.
3. WebSocket fanout via existing `/api/ws/ticket` extended to a generic per-user notification channel.

### 5.2 Version detection

Server exposes `/api/app/version` returning the deployed app version (from `process.env.VERCEL_GIT_COMMIT_SHA` mapped to a semver tag, or a `app/version.json` shipped on every build).

Client compares against `localStorage['lastAckedVersion']`. Mismatch → fetch latest release that's `published_at IS NOT NULL` + relevant to user's org bundles → show banner.

### 5.3 EAS automation

`mobile/eas.json` already configured. The publish-action helper:

```bash
# Triggered by operator publish action via /api/platform/releases/[id]/publish
eas update \
  --channel "$EAS_CHANNEL" \
  --message "$RELEASE_NOTES_SHORT" \
  --non-interactive
```

Triggered via a GitHub Action workflow `release-mobile-ota.yml` invoked by the operator console. Result piped back to `releases.metadata.eas_update_id`.

---

## 6. Phased delivery

Maps to master plan Phase G. ~2 weeks.

| Slice | Description | Estimate |
|---|---|---|
| **G-1** | `releases` table schema (already shipped in seeds/267) | — |
| **G-2** | `/platform/releases` list + draft + publish + archive | 3 days |
| **G-3** | Audience resolution + org_notifications fanout | 2 days |
| **G-4** | Customer-side "What's new" banner on Hub | 2 days | ✅ Shipped — `app/api/app/version/route.ts` (API + per-user latest-release lookup) + `app/admin/me/components/WhatsNewBanner.tsx` (amber gradient banner above HubGreeting; reads /api/app/version?for=user, dismissal persists in localStorage). Durable dismissal (writes to `release_acks` table) waits for the matching Phase D-7 API endpoint. |
| **G-5** | `/admin/announcements` archive | 1 day | ✅ Shipped — `app/admin/announcements/page.tsx` + `app/api/admin/announcements/route.ts`. Bundle-filtered list with release-type pill (feature/fix/breaking/security) + Markdown body + `?id=<release>` deep-link. |
| **G-6** | Mobile Expo Updates check on app launch + force-update enforcement | 2 days |
| **G-7** | EAS OTA trigger via GitHub Action | 2 days |
| **G-8** | Canary rollout (10% / 50% / 100% over 24h) cron | 2 days |
| **G-9** | Delivery analytics on `/platform/releases/[id]` (sent / seen / acked counts) | 1 day |

**Total: ~2 weeks**.

---

## 7. Open questions

1. **Versioning scheme.** Semver (v2.4.0) or date-based (2026.05.13)? Recommend semver — clearer to customers, supports patch releases.
2. **Banner dismissal persistence.** Per-user or per-org? Recommend per-user — different team members read at different times.
3. **Required updates.** What constitutes "required"? Recommend: breaking API changes + critical security fixes only. Operator-side checkbox; not the default.
4. **Pre-release / beta channel.** Should we offer a beta channel customers can opt into? Recommend deferred until we have 50+ customers.
5. **Release notes localization.** English only for v1; multi-language deferred.

---

## 8. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Mobile OTA pushes broken JS bundle | High | Canary 10% → monitor crash rate → 50% → monitor → 100%. Auto-rollback on crash-rate spike. |
| Release notes contain a customer-facing bug ("we accidentally announced something not shipped") | Medium | Draft → review → schedule pattern; operator-required confirmation before publish |
| EAS quota hit | Low | EAS free tier covers our scale; paid tier scales generously |
| Customer dismisses banner without reading; misses critical change | Medium | Required updates use a different UI (modal, not banner); breaking changes always Required |

---

## 9. Cross-references

- `STARR_SAAS_MASTER_PLAN.md` §5.5
- `OPERATOR_CONSOLE.md` §3.7 (release management UI)
- `CUSTOMER_PORTAL.md` §3.9 (release announcements archive)
- `seeds/267_saas_customer_portal_schema.sql` — `releases` + `release_acks` tables already shipped
- `mobile/eas.json` — existing EAS configuration
- `app/admin/me/components/HubGreeting.tsx` — adds the What's-new banner above the greeting
