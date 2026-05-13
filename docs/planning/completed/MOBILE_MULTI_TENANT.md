# Mobile Multi-Tenant — Planning Document

**Status:** Spec complete. Foundation shipped (M-11e deep-link config + accept-invite placeholder screen; M-11h iOS/Android verification files). Every other slice (M-11a-d auth refactor + org picker + switcher + bundle gating, M-11f offline-queue tagging, M-11g-i EAS + store submission) is gated on web M-9 auth refactor or operator credentials (Apple Developer, Google Play). Resume after M-9 ships. Archived to `completed/` 2026-05-13.
**Owner:** Jacob (Starr Software)
**Created:** 2026-05-13
**Last updated:** 2026-05-13 (foundation shipped; remaining deferred on M-9 or operator credentials)
**Target repo path:** `docs/planning/completed/MOBILE_MULTI_TENANT.md`

> **One-sentence pitch:** Pivot the Starr Field mobile app from single-tenant Starr-Surveying-only auth to multi-tenant org-context with bundle gating, org-switcher, accept-invite deep links, and EAS-driven release distribution — preserving the existing offline-first capture UX.

---

## 0. Decisions locked

| Q | Decision | Rationale |
|---|---|---|
| **Bundle ID** | `com.starrsoftware.starrfield` stays — single app for all tenants | Branded at OS level as "Starr Field"; customers don't get a custom-branded app in v1 |
| **Org switcher UI** | Topbar dropdown when user has ≥2 orgs | Same pattern as web (CUSTOMER_PORTAL §4.5) |
| **Bundle gating** | Mirror web-side `requiredBundle` check; tabs hide instead of grayed-out | Cleaner UX than disabled tabs |
| **Invite acceptance deep link** | `starrfield://accept-invite/[token]` with Expo Linking | Native deep-link pattern; falls back to web if app not installed |
| **Offline org-context** | Cached `active_org_id` in SecureStore + AsyncStorage | Survives app re-launch + supports offline use |

---

## 1. Goals

1. **Auth carries `active_org_id`** in every request; backend RLS policies fire correctly.
2. **Org switcher** in the Me tab → tap to change active org → cascade refresh.
3. **Bundle gates hide tabs** the org doesn't have. Office bundle gates Jobs/Time/Receipts/Money; Recon bundle (if standalone) shows a research-only tab set; Field bundle is the default.
4. **Accept-invite deep link** works from a mobile email: tap link → opens app to confirmation screen → accept → joins org.
5. **OTA updates work** through EAS channels (already configured in `mobile/eas.json`).
6. **Offline-first stays intact** — pending uploads queued locally + replayed when signal returns; queued items carry their `org_id`.

### Non-goals

- Custom-branded mobile app per customer firm (Firm Suite tier feature, deferred).
- Native iOS / Android-specific multi-tenant features (push routing per org). Use Expo abstractions.
- Multiple active orgs simultaneously (one active at a time; switch to change).
- Mobile operator console (operators use web).

---

## 2. Auth flow changes

`mobile/lib/auth.tsx` today uses Supabase Auth directly. Pivot:

1. Sign-in form posts to `/api/auth/mobile-signin` (custom Next.js route that wraps NextAuth) — receives `access_token` + `refresh_token` + `active_org_id` + `memberships[]`.
2. Tokens stored in `expo-secure-store` (encrypted).
3. Active org id stored in `AsyncStorage` (fast read, non-sensitive).
4. Every Supabase request appends `org_id` header; backend reads + validates against memberships before applying RLS.

Sign-in flow when user has multiple orgs:

```
sign-in form
    │
    ▼
post /api/auth/mobile-signin
    │
    ▼
response: { ..., memberships: [Acme, Brown & Co], active_org_id: null }
    │
    ▼
org picker screen ──► tap "Acme Surveying"
    │
    ▼
PATCH /api/auth/active-org { org_id }
    │
    ▼
re-fetch profile + active_org_id stored
    │
    ▼
land on Home tab
```

---

## 3. Org switcher

In the existing Me tab (`mobile/app/(tabs)/me/index.tsx`):

```
┌──────────────────────────────────────┐
│  ← Me                                  │
│                                        │
│  Active org:                           │
│   ┌──────────────────────────────┐   │
│   │ 🏢 Acme Surveying      [▾]   │   │
│   └──────────────────────────────┘   │
│                                        │
│   Tap to switch to:                    │
│    Brown & Co                          │
│    + Join another organization         │
│                                        │
│  Alice Carter                          │
│  alice@acme.com                        │
│  Role: Admin                           │
│  …                                     │
└──────────────────────────────────────┘
```

Tap switcher → PATCH `/api/auth/active-org` → JWT refreshed → all tab content invalidates + re-fetches with new `org_id`.

For users with one org: switcher shows org name as a static badge (no dropdown).

---

## 4. Bundle gating on tabs

Existing tab structure in `mobile/app/(tabs)/_layout.tsx`:

| Tab | Bundle required |
|---|---|
| Home | (always) |
| Jobs | Office or Firm Suite |
| Time | Office or Firm Suite |
| Money (receipts) | Office or Firm Suite |
| Me | (always) |

For an org on Field-only:
- Home: visible
- Jobs: visible (Field bundle includes basic job visibility)
- Time: visible (Field bundle includes clock-in/out)
- Money (receipts): hidden
- Me: visible

For an org on Recon-only (rare on mobile but possible):
- Home: visible (showing research projects)
- Jobs: hidden
- Time: hidden
- Money: hidden
- Me: visible

Implementation: `useActiveOrg()` returns `bundles[]`; tab visibility computed per render. Hide tab + bottom-nav re-flows.

---

## 5. Deep link: accept invite

Configure Expo Linking in `mobile/app.json`:

```json
"linking": {
  "prefixes": ["starrfield://", "https://starrsoftware.com"],
  "config": {
    "screens": {
      "AcceptInvite": "accept-invite/:token"
    }
  }
}
```

Invite email body includes both:
- `https://starrsoftware.com/accept-invite/[token]` (web; opens browser)
- `starrfield://accept-invite/[token]` (mobile; opens app if installed)

Mobile app handles the deep link → fetches invite preview → confirmation screen → accept.

For iOS: requires Apple App Site Association file at `https://starrsoftware.com/.well-known/apple-app-site-association`. For Android: intent filter in app.json — already supported by Expo.

---

## 6. Offline-first preservation

The current app queues uploads (photos, points, receipts) in AsyncStorage when offline. Pivot:

- Each queued item gets the `org_id` it was created under at capture time (NOT at replay time — the user might have switched orgs by then).
- Replay loop reads `queue.org_id` and posts with that header, regardless of active org at replay time.
- If the user no longer has access to that org (rare — left the firm), the upload fails with a "this data belonged to Acme Surveying which you no longer have access to. Discard or export?" dialog.

---

## 7. Phased delivery

Maps to master plan slice M-11. ~2-3 weeks.

| Slice | Description | Estimate |
|---|---|---|
| **M-11a** | `mobile/lib/auth.tsx` — call new /api/auth/mobile-signin; receive memberships + active_org_id | 3 days | ⏸ Deferred — gated on web M-9 auth refactor. The /api/auth/mobile-signin route returns the same JWT shape M-9 establishes on web; building it before M-9 means rebuilding the shape later. Pick up immediately after M-9 lands. |
| **M-11b** | Org picker screen + AsyncStorage active_org_id cache | 2 days | ⏸ Deferred — consumes M-11a's session response shape. |
| **M-11c** | Org switcher in Me tab + cascade refresh | 2 days | ⏸ Deferred — consumes M-11a + needs /api/auth/active-org PATCH endpoint (gated on M-9 web JWT shape). |
| **M-11d** | Bundle gating on tabs + useActiveOrg() hook | 2 days | ⏸ Deferred — needs the mobile useActiveOrg() to read active org from JWT (M-11a output). Bundle catalog (lib/saas/bundles.ts) already exists; mobile mirrors it as `mobile/lib/saas/bundles.ts` when M-11d ships. |
| **M-11e** | Accept-invite deep link with Expo Linking | 2 days | ✅ Linking config + placeholder screen shipped — `mobile/app.json` adds `ios.associatedDomains: ['applinks:starrsoftware.com']` + `android.intentFilters` for https://starrsoftware.com/accept-invite/*; `mobile/app/accept-invite/[token].tsx` placeholder screen reads token from useLocalSearchParams + renders fallback "Open in browser" CTA. Full in-app acceptance flow gated on master plan M-9 auth refactor. |
| **M-11f** | Offline queue org_id tagging | 1 day | ⏸ Deferred — consumes M-11a's active org id. One file change in mobile/lib (whichever stores the queue) once M-11a-c are live. |
| **M-11g** | EAS production submission with multi-tenant build | 1 day | ⏸ Deferred — operator-credential-gated. `mobile/eas.json` has placeholder Apple Developer + Play Console credentials; ship is `eas build` invocation once credentials are in place. No code work. |
| **M-11h** | iOS App Site Association file + Android intent filter | 1 day | ✅ Files shipped — `public/.well-known/apple-app-site-association` (universal-link config for accept-invite path) + `public/.well-known/assetlinks.json` (Android App Links). `vercel.json` headers ensure `Content-Type: application/json` on both (Apple/Google require this). Both files have `TEAMID` / `sha256_cert_fingerprints` placeholders the operator fills in from Apple Developer team + Play Console app signing key when those credentials exist. |
| **M-11i** | App Store + Play Store submission with v2 binary | (operator-gated; depends on Apple Dev + Play Console credentials) |

**Total: ~2 weeks engineering** (M-11i is operator-gated on real credentials).

---

## 8. Open questions

1. **Sign-in provider.** Today the mobile app uses Supabase Auth directly (separate from web NextAuth). Recommend: switch to NextAuth via a custom mobile-friendly route to unify the JWT shape. Alternative: keep Supabase Auth + add org claims via JWT custom claims.
2. **Biometric lock + org switch.** Should biometric unlock be per-org? Recommend: per-user (your face/finger unlocks the app); active org persists across unlocks.
3. **Push notifications.** Expo Push already supported. Phase G integrates with operator broadcasts. Recommend: in-app first, push later.
4. **App display name.** Stays "Starr Field" regardless of active org? Or shows "Starr Field — Acme"? Recommend: stays "Starr Field" at OS level; in-app shows active org context.

---

## 9. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Mobile build breaks during the auth pivot | Medium | Branch separately; keep web Phase A complete + stable before mobile starts |
| Offline queue gets stuck with stale org_id | Medium | Replay timeout + "discard or export" dialog; audit log on replay failures |
| Deep link opens wrong screen / loses state | Low | Standard Expo Linking patterns; tested with both cold + warm starts |
| App Store rejection on resubmit (changed auth flow) | Low | Auth changes are server-side; binary changes are minor; submission notes explain |

---

## 10. Cross-references

- `STARR_SAAS_MASTER_PLAN.md` §3.3 (identity stack)
- `MULTI_TENANCY_FOUNDATION.md` §6.2 slice M-11 (mobile refactor)
- `CUSTOMER_PORTAL.md` §4.5 (org-switcher pattern)
- `docs/planning/completed/STARR_FIELD_MOBILE_APP_PLAN.md` — mobile spec (pre-pivot)
- `mobile/lib/auth.tsx` — existing auth wiring (refactor target)
- `mobile/eas.json` — EAS Build config (unchanged)
- `mobile/app.json` — add linking config
