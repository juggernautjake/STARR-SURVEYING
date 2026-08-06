// app/admin/learn/fieldbook/page.tsx — your field notes and research bookmarks.
//
// ── RESTORED 2026-08-06, THE SAME DEFECT AS /admin/my-files ─────────────────────────────────────
//
// Registered in `ADMIN_ROUTES` as "My Fieldbook" in the Hub workspace, on the rail — so the icon
// rail, the mobile drawer and ⌘K have all been offering it while this file redirected to
// `/admin/me?tab=fieldbook`, a Hub that reads only `edit` and `debug`. `tab=fieldbook` is not one of
// the five tabs `LegacyTabNotice` covers, so there was not even a notice: the menu entry simply
// landed on the widget canvas.
//
// `FieldbookPanel` is whole and was already the full-page body before consolidation Slice 2 removed
// this page. Restoring the door is the entire fix.

import type { Metadata } from 'next';
import FieldbookPanel from './FieldbookPanel';

export const metadata: Metadata = { title: 'My Fieldbook' };

export default function FieldbookPage() {
  return <FieldbookPanel />;
}
