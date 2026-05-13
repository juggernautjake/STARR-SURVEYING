// app/admin/my-pay/page.tsx
//
// Legacy redirect — the My Pay view now lives in the Hub at
// /admin/me?tab=pay (admin-nav redesign Phase 2 slice 2c).
// MyPayPanel still ships from this folder so the Hub can import it.

import { redirect } from 'next/navigation';

export default function MyPayPage(): never {
  redirect('/admin/me?tab=pay');
}
