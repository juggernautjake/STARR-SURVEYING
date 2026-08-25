// app/admin/billing/invoices — kept as a redirect, not deleted. C1.
//
// The panel this route rendered has been the `Invoices` tab of /admin/billing since
// `billing-real-tabs-2026-06-21`; both surfaces already shared one fetcher. What C1 of
// docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md changed is that the tab now lives in
// the URL, so there is somewhere exact to send this.
//
// The file stays so that every bookmark, every link in an old email and every `// Spec:` reference
// to the old URL still lands on the right tab instead of 404ing — or, worse, landing on the
// overview and looking like the invoices had gone.
//
// A server component doing one `redirect()`: no client bundle, no flash of an empty page, and the
// browser is told plainly where the content went.
import { redirect } from 'next/navigation';

export default function Page(): never {
  redirect('/admin/billing?tab=invoices');
}
