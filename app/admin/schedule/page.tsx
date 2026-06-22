// app/admin/schedule/page.tsx
//
// schedule-redirect-2026-06-22 — was redirecting to /admin/me?tab=schedule,
// but the hub-tab handler was archived (_archive/components/HubTabs.tsx)
// and never replaced, so /admin/schedule effectively rendered the bare
// hub. Reroute to /admin/calendar — the working org-wide calendar that
// already supports month/week/day views (slice C1+). The hub's
// today-schedule widget still consumes SchedulePanel for the at-a-glance
// view; this redirect just covers the standalone navigation.

import { redirect } from 'next/navigation';

export default function SchedulePage(): never {
  redirect('/admin/calendar');
}
