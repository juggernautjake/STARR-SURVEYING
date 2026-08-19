// app/admin/projects/layout.tsx
//
// The projects pages were first written against `jobs-page__*`, which is declared in
// `AdminJobs.css` — a stylesheet imported by `app/admin/jobs/layout.tsx` and therefore scoped to
// the /admin/jobs route tree. Nothing under /admin/projects ever loaded it, so every header,
// button and title rendered as raw browser default while reporting zero horizontal overflow.
//
// Projects now carry their own stylesheet rather than borrowing another route's.

import '../styles/AdminProjects.css';

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
