// /admin/marketing/exports — kept as a redirect, not deleted. A1.
//
// The page body moved into the tabbed shell at /admin/marketing (see `_tabs/`). This file stays so
// that every bookmark, every link in an old email, and every `// Spec:` reference to the old URL
// still lands in the right place instead of 404ing.
//
// A server component doing one `redirect()`: no client bundle, no flash of an empty page, and the
// browser is told plainly where the content went.
import { redirect } from 'next/navigation';

export default function Page(): never {
  redirect('/admin/marketing?tab=conversions');
}
