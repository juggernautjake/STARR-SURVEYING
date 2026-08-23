// app/admin/design/page.tsx — the Page Designer's front door.
//
// Phase 0 / slice W1 of docs/planning/in-progress/DESIGN_STUDIO_2026-08-23.md.
//
// The role gate is the middleware's (`/admin/*` requires a session) plus the route registry's
// `roles: ['admin', 'developer']`, which is what keeps it out of the nav for everybody else. This
// is a build tool, not a business surface: it exposes the whole app's structure, and a half-finished
// mockup on a foreman's screen would read as a promise.

import type { Metadata } from 'next';
import DesignHome from './DesignHome';

export const metadata: Metadata = { title: 'Page Designer' };

export default function DesignPage() {
  return <DesignHome />;
}
