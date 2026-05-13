// app/admin/office/page.tsx
//
// Office workspace landing (admin-nav redesign Phase 3 slice 3a §5.2.6).
// HR / payroll / comms / settings — replaces the old People + Rewards
// & Pay + Communication + Notes & Files + Account sections. Phase 4
// adds widgets (receipts pending, payroll status, recent payouts).

import WorkspaceLanding from '../components/nav/WorkspaceLanding';

export default function OfficeLanding() {
  return <WorkspaceLanding workspace="office" />;
}
