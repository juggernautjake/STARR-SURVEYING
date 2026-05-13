// app/admin/my-jobs/page.tsx
//
// Thin route wrapper around `MyJobsPanel`. The same panel renders inside
// the Hub at /admin/me?tab=jobs (admin-nav redesign Phase 2 slice 2b/2).
// Slice 2c flips this to a redirect once every personal tab body is live.

import MyJobsPanel from './MyJobsPanel';

export default function MyJobsPage() {
  return <MyJobsPanel />;
}
