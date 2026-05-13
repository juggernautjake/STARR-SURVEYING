// app/admin/my-hours/page.tsx
//
// Thin route wrapper around `MyHoursPanel`. Same panel renders inside
// the Hub at /admin/me?tab=hours (admin-nav redesign Phase 2 slice 2b/6).

import MyHoursPanel from './MyHoursPanel';

export default function MyHoursPage() {
  return <MyHoursPanel />;
}
