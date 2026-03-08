# Phase 17: Report Sharing & Client Portal

**Starr Software — AI Property Research Pipeline Phase**

**Status:** ✅ COMPLETE v1.0 (April 2026)  
**Phase Duration:** Weeks 65–66  
**Depends On:** Phases 1–16  
**Maintained By:** Jacob, Starr Surveying Company, Belton, Texas (Bell County)

**Goal:** Allow surveyors to share completed research reports with clients via a public URL link, with per-token permission tiers, optional expiry, view-count limits, and optional password protection:
1. A **ReportShareService** (`worker/src/services/report-share-service.ts`) that manages share tokens with an in-memory store for testing and Supabase persistence in production
2. A **Supabase schema** (`seeds/095_phase17_report_shares.sql`) for the `report_shares` table with RLS, indexes, trigger, and helper function
3. A **public share endpoint** (`app/api/share/[token]/route.ts`) that validates tokens and returns permission-filtered report data — no authentication required
4. An **admin API** (`app/api/admin/research/[projectId]/share/route.ts`) for surveyors to create, list, and revoke share tokens
5. A **client-facing viewer** (`app/share/[token]/page.tsx`) — a read-only, mobile-responsive React page with permission-aware rendering and password prompt

---

## Problem Statement

> After Phase 16 completed the county configuration layer, the research pipeline produces rich reports. However, delivering those reports to clients still requires exporting PDFs or copying data manually. Phase 17 adds a zero-friction sharing mechanism: a surveyor generates a link in the admin dashboard, chooses a permission tier, optionally sets an expiry or password, and sends the URL directly to the title company, attorney, or property owner. The client sees a clean, branded read-only view — no login required.

---

## Architecture: Phase 17 Additions

```
PHASE 16 (county config)                   PHASE 17 (report sharing)
────────────────────────────────────────   ────────────────────────────────────────
CountyConfigRegistry                     →  ReportShareService.createShare()
county_portal_configs (Supabase)         →  report_shares (Supabase table)
/api/admin/research/county-config        →  /api/admin/research/{projectId}/share
                                              GET  — list shares
                                              POST — create share token
                                              DELETE?token= — revoke token
                                         →  /api/share/{token}  (public, no auth)
                                              GET?password= — validate + return data
                                         →  /share/{token}  (Next.js public page)
                                              Password prompt if protected
                                              Permission-filtered report view
                                              "Powered by Starr Compass" branding
```

---

## What Was Built

### v1.0 (April 2026)

| Module | File | Purpose |
|--------|------|---------|
| Share Service | `worker/src/services/report-share-service.ts` | Token lifecycle: create, validate, recordView, revoke, update, listShares |
| DB Schema | `seeds/095_phase17_report_shares.sql` | `report_shares` table, indexes, RLS, trigger, `get_active_shares()` |
| Public API | `app/api/share/[token]/route.ts` | Public GET endpoint — validates token, returns filtered report data |
| Admin API | `app/api/admin/research/[projectId]/share/route.ts` | Authenticated GET / POST / DELETE for share management |
| Client Viewer | `app/share/[token]/page.tsx` | Read-only public report viewer with permission filtering and password prompt |
| Tests | `__tests__/recon/phase17-report-sharing.test.ts` | 55 unit tests |

---

## ReportShareService Details

### Token creation (`createShare`)

```typescript
const svc = new ReportShareService();
const result = await svc.createShare('project-uuid', 'jacob@starrsurveying.com', {
  permission: 'summary_only',
  expiresInDays: 30,
  maxViews: 10,
  label: 'Shared with First American Title',
  password: 'securepass',
});
// result.shareUrl  → 'https://app.starrsurveying.com/share/<uuid>'
// result.token     → UUID v4
// result.shareRecord.passwordHash → SHA-256 hex of 'securepass'
```

### Permission tiers

| Permission | What the client sees |
|------------|---------------------|
| `full_report` | All project fields |
| `summary_only` | Address, county, state, confidence score, status — no legal description or boundary |
| `boundary_only` | Address, legal description, boundary summary only |
| `documents_excluded` | All fields except document list |

### Token validation (`validateToken`)

Returns the share record or `null` if:
- Token not found
- Token is revoked (`isRevoked = true`)
- Token has expired (`expiresAt` is in the past)
- View count has reached `maxViews`
- Password required but not provided, or incorrect

### isViewAllowed guard

```typescript
const { allowed, reason } = svc.isViewAllowed(shareRecord);
// allowed: false, reason: 'Token has expired'
```

Checked in both `validateToken` (in-memory) and the public API route (Supabase).

---

## SQL Schema Details

### `report_shares` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, auto-generated |
| `token` | text | UNIQUE — URL-safe UUID |
| `project_id` | uuid | FK → `research_projects(id)` ON DELETE CASCADE |
| `permission` | text | CHECK IN ('full_report', 'summary_only', 'boundary_only', 'documents_excluded') |
| `created_by` | text | Surveyor email |
| `expires_at` | timestamptz | NULL = never expires |
| `view_count` | integer | Incremented on each valid access |
| `max_views` | integer | NULL = unlimited |
| `label` | text | Human-readable label |
| `password_hash` | text | SHA-256 hex — NULL if no password |
| `is_revoked` | boolean | Default false |
| `last_viewed_at` | timestamptz | Updated on each valid access |
| `created_at` | timestamptz | Auto-set |
| `updated_at` | timestamptz | Auto-updated via trigger |

### RLS Policies

- **`report_shares_select_own`** — authenticated users can SELECT their own shares
- **`report_shares_insert_own`** — authenticated users can INSERT shares they create
- **`report_shares_update_own`** — authenticated users can UPDATE their own shares
- **`report_shares_delete_own`** — authenticated users can DELETE their own shares
- **`report_shares_all_service_role`** — service role has full access (used by admin API and public endpoint)

### `get_active_shares(p_project_id uuid)`

Returns all non-revoked, non-expired share tokens for a project, ordered by `created_at DESC`.

---

## Client Viewer Details

### Permission rendering

- **`full_report`** — shows address, county, state, confidence score, legal description, boundary summary, status
- **`summary_only`** — shows only address, county, state, confidence score, status (no legal description, no boundary)
- **`boundary_only`** — shows address, legal description, boundary summary (no status, no confidence)
- **`documents_excluded`** — shows all except document attachments

### Password prompt

If the API returns `401` with `is_password_protected: true`, the viewer renders a password form. Incorrect passwords show an inline error toast without exposing the token.

### Branding

Every share page footer reads: *Powered by **Starr Compass** — AI Property Research by Starr Surveying Company, Belton, TX*

---

## API Reference

### Public (no auth)

```
GET /api/share/{token}?password={pw}
→ 200 { shareRecord, reportData }
→ 401 { error: "Password required", is_password_protected: true }
→ 401 { error: "Incorrect password", is_password_protected: true }
→ 404 { error: "Not found" }
```

### Admin (requires auth)

```
GET    /api/admin/research/{projectId}/share
→ 200 { shares: ReportShareToken[] }

POST   /api/admin/research/{projectId}/share
Body:  { permission?, expiresInDays?, maxViews?, label?, password? }
→ 201 { shareUrl, token, shareRecord }

DELETE /api/admin/research/{projectId}/share?token={token}
→ 200 { revoked: true, token }
→ 404 { error: "Share token not found" }
```

---

## Security Notes

- Tokens are UUID v4 — 122 bits of entropy, not guessable
- Passwords are stored as SHA-256 hashes (not plaintext)
- The public endpoint never exposes `password_hash` in responses
- RLS ensures authenticated users can only manage their own tokens
- Cascade delete: tokens are automatically removed when the parent project is deleted
