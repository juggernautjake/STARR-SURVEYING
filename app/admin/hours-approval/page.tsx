// app/admin/hours-approval/page.tsx — absorbed by the Hours portal (C4).
//
// C4 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The route stays and forwards. Deleting it would break every bookmark, and this pair in particular
// has been linked to from notification emails — a 404 there says the timesheet is gone.
//
// ── THE LINK HAS TO ARRIVE WITH ITS QUESTION (2026-10-05) ───────────────────────────────────────
//
// Every "X submitted 8h for Tuesday" notification links here with `?employee=&date=&status=`, and
// the approvals tab reads exactly those to open on that person's week. This redirect used to drop
// them, so every notification opened the current week for everybody — and a submission from last
// week looked like it had never arrived. They are forwarded now, which also repairs every
// notification already sitting in somebody's bell.

import { redirect } from 'next/navigation';

type Query = { [key: string]: string | string[] | undefined };

export default function Page({ searchParams }: { searchParams?: Query }) {
  const params = new URLSearchParams({ tab: 'approvals' });
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (key === 'tab' || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
  }
  redirect(`/admin/hours?${params.toString()}`);
}
