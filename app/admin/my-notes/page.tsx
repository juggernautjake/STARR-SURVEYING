// app/admin/my-notes/page.tsx
//
// Thin route wrapper around `MyNotesPanel`. Same panel renders inside
// the Hub at /admin/me?tab=notes (admin-nav redesign Phase 2 slice 2b/6).

import MyNotesPanel from './MyNotesPanel';

export default function MyNotesPage() {
  return <MyNotesPanel />;
}
