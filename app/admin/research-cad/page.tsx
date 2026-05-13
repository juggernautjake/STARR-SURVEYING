// app/admin/research-cad/page.tsx
//
// Research & CAD workspace landing (admin-nav redesign Phase 3 slice 3a
// §5.2.4). Combines the sparse Research + CAD sidebar sections into one
// workspace. Phase 4 adds widgets (recent projects, testing-lab runs,
// open CAD drawings).

import WorkspaceLanding from '../components/nav/WorkspaceLanding';

export default function ResearchCadLanding() {
  return <WorkspaceLanding workspace="research-cad" />;
}
