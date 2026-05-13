// app/admin/my-pay/page.tsx
//
// Thin route wrapper around `MyPayPanel`. Same panel renders inside the
// Hub at /admin/me?tab=pay (admin-nav redesign Phase 2 slice 2b/5).

import MyPayPanel from './MyPayPanel';

export default function MyPayPage() {
  return <MyPayPanel />;
}
