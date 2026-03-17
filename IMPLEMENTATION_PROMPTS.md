# STARR RECON — Implementation Prompts

**Last updated:** 2026-03-17 — Reflects current state of `main` after PR #299 (commit 4f0d790).

## Status of Original Bugs

| # | Bug | Status |
|---|-----|--------|
| 1 | Progress messages never reach frontend | **FIXED** (PR #297) |
| 2 | Live log entries stored under wrong keys | **FIXED** (PR #297) |
| 3 | County-specific logs never persisted to Supabase | **FIXED** (PR #297) |
| 4 | County-specific completed response missing `log` field | **FIXED** (PR #297 + PR #298) |
| 5 | Project status never updated to 'review' | **FIXED** (PR #297) |
| 6 | County-specific results never persisted to database | **FIXED** (PR #297) |
| 7 | Horizontal overflow on research page | **STILL BROKEN** — PR #299 merged empty, 0 of 9 CSS fixes applied |

---

## What's Left: One Bug, Nine CSS Edits

The only remaining issue is **Bug 7 — horizontal overflow** during pipeline runs. All 9 fixes are CSS-only changes across 3 files. No JavaScript/TypeScript logic changes needed.

### Quick Reference — All 9 Fixes

| # | File | Selector | What to add |
|---|------|----------|-------------|
| 1 | `app/admin/styles/AdminLayout.css` | `.admin-layout__main` | `min-width: 0; overflow-x: hidden;` |
| 2 | `app/admin/styles/AdminLayout.css` | `.admin-layout__content` | `min-width: 0; overflow-x: hidden;` |
| 3 | `app/admin/styles/AdminResearch.css` | `.research-stage2` | `min-width: 0; max-width: 100%; overflow-x: hidden;` |
| 4 | `app/admin/styles/AdminResearch.css` | `.research-stage2__launch` | `min-width: 0; overflow: hidden;` |
| 5 | `ResearchRunPanel.tsx` (inline `<style>`) | `.rrp__logviewer-stream` | `overflow-x: hidden;` |
| 6 | `ResearchRunPanel.tsx` (inline `<style>`) | `.rrp__activity-stream` | `overflow-x: hidden;` |
| 7 | `ResearchRunPanel.tsx` (inline `<style>`) | `.rrp__log-detail` | `overflow: hidden; word-break: break-word;` |
| 8 | `ResearchRunPanel.tsx` (inline `<style>`) | `.rrp__log-detail-row code` | `word-break: break-all; overflow-wrap: break-word;` |
| 9 | `ResearchRunPanel.tsx` (inline `<style>`) | `.rrp__activity-msg` | `min-width: 0; overflow-wrap: break-word; word-break: break-word;` |

---

## Prompt A — Fix Horizontal Overflow (Copy-Paste Ready)

> **Task:** Fix the horizontal scrollbar that appears on the research page 10-20 seconds into a pipeline run. The page gets "super wide" when log entries start streaming. This is Bug 7 — the only remaining bug. All fixes are CSS-only.
>
> ### Why it overflows
>
> CSS flexbox defaults `min-width` to `auto`, meaning flex children never shrink below their content width. When monospace log text or long URLs appear, the admin layout flex containers expand beyond the viewport. The current `overflow-x: hidden` on `.research-page` is ineffective because the *parent* containers have already expanded.
>
> ### Fix 1 — `app/admin/styles/AdminLayout.css`
>
> Find `.admin-layout__main` (line ~8). It currently looks like:
> ```css
> .admin-layout__main { flex:1; margin-left:260px; display:flex; flex-direction:column; min-height:100vh; transition:margin-left .3s; }
> ```
> Add `min-width: 0; overflow-x: hidden;` to the end of the declaration.
>
> Find `.admin-layout__content` (line ~9). It currently looks like:
> ```css
> .admin-layout__content { flex:1; padding:2rem; margin-top:64px; }
> ```
> Add `min-width: 0; overflow-x: hidden;` to the end of the declaration.
>
> **This is the critical fix.** Without `min-width: 0` on these flex parents, nothing downstream can prevent the overflow.
>
> ### Fix 2 — `app/admin/styles/AdminResearch.css`
>
> Find `.research-stage2` (line ~8440). Add these three properties:
> ```css
> min-width: 0;
> max-width: 100%;
> overflow-x: hidden;
> ```
>
> Find `.research-stage2__launch` (line ~8446). Add:
> ```css
> min-width: 0;
> overflow: hidden;
> ```
>
> ### Fix 3 — `app/admin/research/components/ResearchRunPanel.tsx` (inline `<style>` tag)
>
> This file has a `<style>` JSX tag containing all `.rrp__*` CSS rules. Make these 5 changes:
>
> **3a.** `.rrp__logviewer-stream` (line ~1078) — currently has `overflow-y: auto` but no X constraint. Add:
> ```css
> overflow-x: hidden;
> ```
>
> **3b.** `.rrp__activity-stream` (line ~1168) — same issue. Add:
> ```css
> overflow-x: hidden;
> ```
>
> **3c.** `.rrp__log-detail` (line ~1141) — flex column with no overflow constraint. Add:
> ```css
> overflow: hidden;
> word-break: break-word;
> ```
>
> **3d.** `.rrp__log-detail-row code` (line ~1146) — renders long URLs and JSON payloads. Add:
> ```css
> word-break: break-all;
> overflow-wrap: break-word;
> ```
>
> **3e.** `.rrp__activity-msg` (line ~1189) — flex child with no shrink constraint. Change from:
> ```css
> .rrp__activity-msg  { color: #1e293b; flex: 1; }
> ```
> To:
> ```css
> .rrp__activity-msg  { color: #1e293b; flex: 1; min-width: 0; overflow-wrap: break-word; word-break: break-word; }
> ```
>
> ### Do NOT change these (already correct)
> - `.rrp__log-row` — already has `overflow: hidden`
> - `.rrp__log-method` — already has `min-width: 0; overflow: hidden; text-overflow: ellipsis`
> - `.rrp__logviewer` — already has `overflow: hidden`
> - `.research-page` — already has `overflow-x: hidden` (keep it, but it alone is not enough)
>
> ### How to verify
> 1. Start a Bell County pipeline run
> 2. Wait 10-20 seconds for logs to stream
> 3. Expand a log entry with a long URL in the Input field
> 4. Confirm no horizontal scrollbar at any point
> 5. Resize browser to 900px width — still no horizontal scroll
> 6. Check the Review stage log viewer — no horizontal scroll

---

## Archived — Completed Fixes (For Reference)

### Bug 4: County-Specific Completed Response Missing `log` Field

**Status:** FIXED (PR #297 laid groundwork, PR #298 completed the fix)

PR #298 added `completedLogs: Map<string, LayerAttempt[]>` alongside `completedResults` in `worker/src/index.ts`. It caches live log entries in memory when a county-specific pipeline completes, serves them from the `/research/status/:projectId` and `/research/logs/:projectId` endpoints, and cleans them up via the existing 4-hour TTL in `cleanupOldResults()`.
