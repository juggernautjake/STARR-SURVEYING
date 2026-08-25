// app/admin/equipment/templates/page.tsx — absorbed by the Equipment portal (C3).
//
// C3 of §8 in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md. The page itself moved to
// `app/admin/equipment/_tabs/` UNTOUCHED and renders as a tab; this route stays and forwards.
//
// ── WHY THE ROUTE STAYS ─────────────────────────────────────────────────────────────────────────
//
// Deleting it would break every bookmark, every link in an old email, and every deep link somebody
// pasted into a message. A 404 says the page is gone; it is not — it moved one level up and became
// a tab. A redirect is the only version of this that is true.
//
// `?tab=` is what makes the forward honest at all: a portal holding its tab in component state
// could only ever land you on its default, which looks exactly like the thing you asked for having
// gone missing. That is C1's argument, and it is why C2 came before this slice.
//
// ── AND WHY THE COMPONENT MOVED UNTOUCHED ───────────────────────────────────────────────────────
//
// `/admin/marketing` set the precedent and gave the reason: *"Rewriting them in the same slice that
// re-arranged them would have made a regression impossible to attribute — if a number came out
// wrong afterwards, nobody could tell whether the consolidation or the rewrite did it."*

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/equipment?tab=templates');
}
