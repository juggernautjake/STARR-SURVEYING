// app/admin/my-files/page.tsx
//
// Thin route wrapper around `MyFilesPanel`. The same panel renders inside
// the Hub at /admin/me?tab=files (admin-nav redesign Phase 2 slice 2b/3).

import MyFilesPanel from './MyFilesPanel';

export default function MyFilesPage() {
  return <MyFilesPanel />;
}
