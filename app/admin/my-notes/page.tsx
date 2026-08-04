// app/admin/my-notes/page.tsx — your personal notes.
//
// ── RESTORED 2026-08-04, FOR THE SAME REASON AS /admin/profile ──────────────────────────────────
//
// Owner: *"whenever I click on 'My Hours' in the nav menu, it takes me to the hub. It almost seems
// like every nav menu link routes back to the hub. It seems like routing is broken."*
//
// Routing was not broken. **Five nav entries pointed at `/admin/me?tab=…`** — which *is* the Hub —
// and the `tab` parameter stopped meaning anything when Slice 189 retired the Hub's tab bar. So the
// menu offered five destinations that all landed on the same undifferentiated page.
//
// `MyNotesPanel` was never deleted. Consolidation Slice 2 removed this `page.tsx` and left the panel
// behind, reachable from nothing but the UX harness — the same shape as the settings page, found the
// same day. The component is whole; it had lost its door.
//
// The Hub still carries the equivalent widget, and that is not a duplicate of this page: a widget is
// a glance on a dashboard somebody assembles, and this is the full surface with everything on it.
// What was wrong was a menu entry that promised the second and delivered neither.

import type { Metadata } from 'next';
import MyNotesPanel from './MyNotesPanel';

export const metadata: Metadata = { title: 'My Notes' };

export default function MyNotesPage() {
  return <MyNotesPanel />;
}
