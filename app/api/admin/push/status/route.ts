// app/api/admin/push/status/route.ts — can this deployment actually deliver a notification?
//
// PWA plan W4c. `EnableNotifications` decides what to show from `NEXT_PUBLIC_PUSH_VAPID_KEY`, which
// is the only push fact a browser can see. It is not the only one that matters.
//
// ── THE STATE THE CLIENT CANNOT SEE ─────────────────────────────────────────────────────────────
//
// `web-push` is deliberately not a dependency of this repo, so with VAPID keys set and the package
// absent, every client-side check passes: the browser subscribes, the row saves, the UI says
// notifications are on — and `sendPush` returns `[]` forever. The crew member is told alerts are on
// and simply never gets one.
//
// The subscribe route already refuses that exact shape for its own case: *"a row that looks like an
// enabled device and can never receive a notification — the user would believe alerts are on and
// simply never get one, which is worse than a visible failure here."* Same rule, one layer up.
//
// Session-gated rather than admin-gated, matching `/api/admin/push/subscribe`: anyone who can be
// notified can ask whether notifications work. It reports a capability, never a key.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { pushStatus } from '@/lib/push/web-push';

export const runtime = 'nodejs';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // The word, and nothing else. Whether a key exists is a capability; the key itself is a secret,
  // and a status endpoint is exactly where one gets leaked by being helpful.
  return NextResponse.json({ status: pushStatus() });
});
