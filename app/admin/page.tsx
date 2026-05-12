// app/admin/page.tsx
//
// /admin landing → redirect to /admin/dashboard.
//
// The AdminSidebar's "Main" group already lists Dashboard as the
// first entry (`AdminSidebar.tsx:91-95`), so /admin (bare) is
// effectively an alias. Without this redirect, /admin renders the
// AdminLayoutClient chrome with an empty `children` slot — bad UX.

import { redirect } from 'next/navigation';

export default function AdminIndex(): never {
  redirect('/admin/dashboard');
}
