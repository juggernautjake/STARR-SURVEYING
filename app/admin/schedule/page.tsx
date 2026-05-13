// app/admin/schedule/page.tsx
//
// Thin route wrapper around `SchedulePanel`. Same panel renders inside
// the Hub at /admin/me?tab=schedule (admin-nav redesign Phase 2 slice 2b/4).

import SchedulePanel from './SchedulePanel';

export default function SchedulePage() {
  return <SchedulePanel />;
}
