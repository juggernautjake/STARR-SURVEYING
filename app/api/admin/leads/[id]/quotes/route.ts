// app/api/admin/leads/[id]/quotes/route.ts — record, revise and decide official quotes. A5.
//
// GET   /api/admin/leads/<id>/quotes   — every version, newest first
// POST  /api/admin/leads/<id>/quotes   — record a new version { amountCents, scopeNotes?, status? }
// PATCH /api/admin/leads/<id>/quotes   — decide one { quoteId, decision, declineReason? }
//
// All the judgement lives in `lib/leads/quotes.ts` — versioning, superseding, the mirror, and the refusal
// to accept a decline with no reason. This route is auth, parsing, and error shape, which is what a route
// should be: the rules are unit-tested without a database, and the same module is what a future importer
// or an AI action would call.
//
// Admin-gated like every other lead route. A quote is a commercial commitment; it is not something a
// field-crew login should be able to record.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { decideQuote, listQuotes, recordQuote } from '@/lib/leads/quotes';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdmin(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email };
}

/** `withErrorHandler` forwards only `req`, not Next's params, so the lead id comes off the pathname:
 *  /api/admin/leads/<id>/quotes — the id is the second-to-last segment. */
function leadIdFrom(req: NextRequest): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const id = segments[segments.length - 2];
  return id && id !== 'leads' ? id : null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const leadId = leadIdFrom(req);
  if (!leadId) return NextResponse.json({ error: 'Missing lead id' }, { status: 400 });
  return NextResponse.json({ quotes: await listQuotes(leadId) });
}, { routeName: 'admin/leads/[id]/quotes' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const leadId = leadIdFrom(req);
  if (!leadId) return NextResponse.json({ error: 'Missing lead id' }, { status: 400 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const amountCents = typeof body.amountCents === 'number' ? body.amountCents : Number(body.amountCents);
  const status = body.status === 'draft' ? 'draft' as const : 'sent' as const;

  const { quote, error } = await recordQuote({
    leadId,
    amountCents,
    scopeNotes: typeof body.scopeNotes === 'string' ? body.scopeNotes : null,
    quotedBy: gate.email,
    status,
    expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null,
  });

  // 400, not 500: a rejected quote is the caller's input being wrong, and the module's messages are
  // written to be shown to the person who typed it.
  if (!quote) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ quote }, { status: 201 });
}, { routeName: 'admin/leads/[id]/quotes' });

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof body.quoteId !== 'string') {
    return NextResponse.json({ error: 'Missing quoteId' }, { status: 400 });
  }
  if (body.decision !== 'accepted' && body.decision !== 'declined') {
    return NextResponse.json({ error: 'decision must be accepted or declined' }, { status: 400 });
  }

  const { quote, error } = await decideQuote({
    quoteId: body.quoteId,
    decision: body.decision,
    declineReason: typeof body.declineReason === 'string' ? body.declineReason : null,
    actor: gate.email,
  });

  if (!quote) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ quote });
}, { routeName: 'admin/leads/[id]/quotes' });
