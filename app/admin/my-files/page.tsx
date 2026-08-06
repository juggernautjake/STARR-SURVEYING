// app/admin/my-files/page.tsx — your personal file storage.
//
// ── RESTORED 2026-08-06, THE SAME DEFECT AS /admin/my-hours ─────────────────────────────────────
//
// Owner: *"on a lot of the widgets there are links like 'Go to my hours →' that don't actually link
// to the pages they need to link to."*
//
// The 2026-08-04 pass restored `/admin/my-hours`, `/admin/my-pay`, `/admin/my-notes` and
// `/admin/profile` after consolidation Slice 2 deleted their `page.tsx` files and pointed the menu
// at `/admin/me?tab=…`. **This page and `/admin/learn/fieldbook` were missed** — both are registered
// in `ADMIN_ROUTES` with `showInRail` on, so both have been offered in the icon rail, the mobile
// drawer and ⌘K while still being four-line redirects into a Hub that reads no `tab` parameter.
//
// `tab=files` is not even one of the five `LegacyTabNotice` explains, so this one did not get the
// migration notice either — it landed on an undifferentiated widget canvas with no explanation at
// all. `MyFilesPanel` was never deleted; like the others, it had lost its door.

import type { Metadata } from 'next';
import MyFilesPanel from './MyFilesPanel';

export const metadata: Metadata = { title: 'My Files' };

export default function MyFilesPage() {
  return <MyFilesPanel />;
}
