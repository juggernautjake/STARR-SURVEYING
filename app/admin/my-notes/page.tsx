// app/admin/my-notes/page.tsx
//
// Legacy redirect — the My Notes view now lives in the Hub at
// /admin/me?tab=notes (admin-nav redesign Phase 2 slice 2c).
// MyNotesPanel still ships from this folder so the Hub can import it.

import { redirect } from 'next/navigation';

export default function MyNotesPage(): never {
  redirect('/admin/me?tab=notes');
}
