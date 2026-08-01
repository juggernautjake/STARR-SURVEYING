// app/api/admin/alerts/route.ts — what the app noticed without being asked (audit §5, item 16).
//
//   GET            → { alerts } — everything currently true, worst first.
//   POST { deliver } → mark the undelivered ones as announced, and return them.
//
// ── GET DOES NOT MARK ANYTHING AS DELIVERED ─────────────────────────────────────────────────────
//
// Reading the list is not the same as telling someone. A GET that marked alerts delivered would mean
// the first person to open the page silently consumes everyone else's notifications — and the bug
// only shows up as "I never got told", which nobody reports because they do not know there was
// something to be told.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { collectProactiveAlerts, markDelivered, undelivered } from '@/lib/ai/proactive';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const all = await collectProactiveAlerts();
  const email = session.user.email;
  const admin = isAdmin(session.user.roles);

  // An alert with a named audience goes to that person. Everything else is firm-wide and needs an
  // admin — "this job is over estimate" is not a thing to tell the crew who worked it.
  const visible = all.filter((a) => (a.audience ? a.audience.includes(email) : admin));

  return NextResponse.json(
    { alerts: visible, counts: { urgent: visible.filter((a) => a.severity === 'urgent').length, total: visible.length } },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const all = await collectProactiveAlerts();
  const fresh = await undelivered(all);

  if (body.deliver === true && fresh.length > 0) {
    await markDelivered(fresh, [session.user.email]);
  }
  return NextResponse.json({ alerts: fresh, delivered: body.deliver === true });
});
