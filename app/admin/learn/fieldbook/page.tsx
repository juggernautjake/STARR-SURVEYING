// app/admin/learn/fieldbook/page.tsx
//
// Legacy redirect — the fieldbook view now lives in the Hub at
// /admin/me?tab=fieldbook (admin-nav redesign Phase 2 slice 2c).
// FieldbookPanel still ships from this folder so the Hub can import it.

import { redirect } from 'next/navigation';

export default function FieldbookPage(): never {
  redirect('/admin/me?tab=fieldbook');
}
