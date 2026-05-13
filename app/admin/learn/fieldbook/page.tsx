// app/admin/learn/fieldbook/page.tsx
//
// Thin route wrapper around `FieldbookPanel`. Same panel renders inside
// the Hub at /admin/me?tab=fieldbook (admin-nav redesign Phase 2 slice 2b/6).

import FieldbookPanel from './FieldbookPanel';

export default function FieldbookPage() {
  return <FieldbookPanel />;
}
