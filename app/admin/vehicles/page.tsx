// app/admin/vehicles/page.tsx — absorbed by the Equipment portal (C3).
//
// The plan's reasoning, kept because it is the interesting part: *"/admin/vehicles joins as tab
// `vehicles` — it is fleet, and the dossiers show /admin/equipment already calls
// /api/admin/vehicles."* The two pages were reading the same data from two places in the nav, which
// is the shape this whole document is about.
//
// The route stays and forwards. Deleting it breaks every bookmark for no gain, and this one has
// lived at a top-level URL long enough to be in people's history.

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/equipment?tab=vehicles');
}
