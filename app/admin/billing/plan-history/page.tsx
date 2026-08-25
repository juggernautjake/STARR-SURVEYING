// app/admin/billing/plan-history — kept as a redirect, not deleted. C1.
//
// The panel this route rendered has been the `Plan history` tab of /admin/billing since
// `billing-real-tabs-2026-06-21`; both surfaces already shared one fetcher. What C1 of
// docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md changed is that the tab now lives in
// the URL, so there is somewhere exact to send this.
//
// The file stays so that every bookmark and every old link still lands on the right tab instead of
// 404ing — or, worse, landing on the overview and looking like the history had been lost. This one
// answers "what happened to my subscription", which is exactly the question somebody follows an old
// link to ask.
import { redirect } from 'next/navigation';

export default function Page(): never {
  redirect('/admin/billing?tab=history');
}
