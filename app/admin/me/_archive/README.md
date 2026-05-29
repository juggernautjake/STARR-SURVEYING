# `_archive/` — Phase-2 legacy hub primitives

Archived 2026-05-29 in **Slice 189** of `customizable-hub-and-work-mode-2026-05-28.md`.

These files used to compose the `/admin/me` hub before the v2 widget canvas
shipped in Slices 78–184. They're kept under this `_archive/` directory so:

1. Their git history stays intact for spelunking.
2. The vitest specs under `__tests__/_archive/admin/me/` still run — pure
   helpers like `parseHubTab` are widely useful even though the UI itself is
   retired.
3. Anyone tracking a regression introduced by the widget cutover can diff
   against the working pre-migration code in-place.

The `_` prefix means Next.js excludes this folder from filesystem-based
route detection. Nothing here is reachable by URL.

## Where the old responsibilities live now

| Legacy component        | Replaced by widget                                   |
| ----------------------- | ----------------------------------------------------- |
| `WhatsNewBanner`        | `RecentAnnouncements` widget (Slice 117)              |
| `HubToday`              | `TodaySchedule` widget (Slice 111)                    |
| `HubPinnedRecent`       | `PinnedPages` + `RecentActivity` widgets (Slices 94, 114) |
| `HubTabs` + tab panels  | Independent widgets in the canvas (no tab navigation) |
| `HubNotifications`      | Notifications surface in `AdminTopBar` + per-widget badges |
| `HubQuickActions`       | `QuickActions` widget (Slice 95)                      |
| `AdminMe.css`           | Restored to `app/admin/me/AdminMe.css` in Slice 195 — Next.js's underscore-prefix convention is documented for route folders only and the standalone bundler under prod builds wouldn't reliably resolve an `import './_archive/AdminMe.css'` from a server component. The file still carries the legacy selectors alongside the `.hub-greeting*` classes the new page needs. |

## Safe to delete?

Once a release cycle passes without anyone needing to consult the archived
behaviour, you can `git rm -r` this folder. The git history preserves
everything; nothing in the live tree imports from `_archive/` except the
CSS file (which the new page intentionally still uses for the greeting).
