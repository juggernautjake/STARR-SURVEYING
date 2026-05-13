// app/admin/my-files/page.tsx
//
// Legacy redirect — the My Files view now lives in the Hub at
// /admin/me?tab=files (admin-nav redesign Phase 2 slice 2c).
// MyFilesPanel still ships from this folder so the Hub can import it.

import { redirect } from 'next/navigation';

export default function MyFilesPage(): never {
  redirect('/admin/me?tab=files');
}
