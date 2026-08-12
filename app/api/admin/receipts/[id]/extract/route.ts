// app/api/admin/receipts/[id]/extract/route.ts — run (or re-run) the AI over one receipt.
//
// This is the door that was missing. The extraction existed and had exactly one caller: a CLI meant
// for a droplet. On Vercel nothing runs it, so a receipt uploaded from the website was inserted as
// `extraction_status = 'queued'` and stayed there — while the queue's UI reported "AI working…"
// about a worker that would never arrive.
//
// Called from two places:
//   * the capture page, immediately after each upload, fire-and-forget;
//   * the "Run AI" button on a row in the bookkeeper queue, with `{ force: true }` to re-read a
//     receipt whose first pass was wrong or ran before the prompt learned to read line items.
//
// WHO MAY CALL IT
//
// Any signed-in member of staff, for their OWN receipt. Anyone who may file an expense may ask the
// AI to read it — refusing would leave a crew member with a queued receipt and no way to advance it.
// Reading somebody else's receipt is a different question, and needs the bookkeeper role, because
// the answer this returns includes the vendor, the total and the card's last four.

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { extractReceipt } from '@/lib/receipts/extract';

/** Vision on a photo takes ~5–15 s. The platform default (10 s on some plans) would kill a
 *  legitimate extraction mid-call and record it as a failure, which is worse than slow. */
export const maxDuration = 60;

const BOOKKEEPER_ROLES = new Set(['admin', 'developer', 'tech_support']);

export const POST = withErrorHandler(
  async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // `withErrorHandler` wraps a single-argument handler, so the route params never reach us.
    // Sibling routes under this same folder read the id off the URL for exactly that reason; the
    // segment we want is the one BEFORE the trailing `/extract`.
    const segments = new URL(req.url).pathname.split('/').filter(Boolean);
    const id = segments[segments.length - 2];
    if (!id) {
      return NextResponse.json({ error: 'Missing receipt id' }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as { force?: boolean };

    // Ownership check. `receipts.user_id` is an auth.users id, so the comparison goes through the
    // same email → id lookup the upload route uses rather than trusting anything on the session.
    const roles: string[] = (session.user.roles as string[] | undefined) ??
      (session.user.role ? [session.user.role as string] : []);
    const isBookkeeper = roles.some((r) => BOOKKEEPER_ROLES.has(r));

    if (!isBookkeeper) {
      const { data: receipt } = await supabaseAdmin
        .from('receipts')
        .select('user_id')
        .eq('id', id)
        .maybeSingle();
      if (!receipt) {
        return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
      }
      const { data: users } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const me = users?.users.find(
        (u) => u.email?.toLowerCase() === session.user!.email!.toLowerCase(),
      );
      if (!me || me.id !== receipt.user_id) {
        return NextResponse.json({ error: 'Not your receipt' }, { status: 403 });
      }
    }

    try {
      const result = await extractReceipt(id, { force: body.force === true });
      return NextResponse.json({ result });
    } catch (err) {
      // Thrown only when the environment cannot do the work at all — no ANTHROPIC_API_KEY. Say so
      // in the words of the thing an owner has to go and fix, rather than "extraction failed".
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message, code: 'ai_unavailable' }, { status: 503 });
    }
  },
  { routeName: 'admin/receipts/extract' },
);
