// app/admin/work/page.tsx
//
// Work workspace landing (admin-nav redesign Phase 3 slice 3a §5.2.2).
// Lists every accessible Work-workspace route as a card. Phase 4 adds
// at-a-glance widgets (active jobs, hours-approval queue, today's
// deliverables) on top.

import WorkspaceLanding from '../components/nav/WorkspaceLanding';

export default function WorkLanding() {
  return <WorkspaceLanding workspace="work" />;
}
