// app/api/admin/receipts/reextract/route.ts — slice V5b of
// docs/planning/completed/RECEIPT_REVIEW_SLIDESHOW_2026-08-14.md
//
// Owner, 2026-08-14: *"sometimes the AI gets info wrong, so we need to be able to rerun AI analysis
// for all receipts."*
//
// ── WHY THIS IS NOT `sweepQueuedReceipts` ───────────────────────────────────────────────────────
//
// That sweep exists and deliberately never forces: it drains the `queued` backlog, and a nightly
// cron that re-billed every receipt it had already read would be an unbounded recurring charge
// nobody asked for. This is the opposite request — re-read receipts that are already `done`,
// because the first pass was wrong or the prompt has since improved.
//
// So it forces, it is admin-only, and it is explicitly bounded.
//
// ── IT SPENDS MONEY, SO IT COUNTS FIRST ─────────────────────────────────────────────────────────
//
// Each extraction is a vision call against a photo and writes `extraction_cost_cents`. `GET` returns
// the count the current filter would re-read so the UI can name it before asking; `POST` does the
// work. Two verbs rather than a `dryRun` flag, because a boolean that decides whether real money is
// spent is one typo away from spending it.
//
// ── AND IT RUNS IN BOUNDED BATCHES ──────────────────────────────────────────────────────────────
//
// One click over a 400-receipt filter must not start 400 concurrent model calls. `MAX_PER_CALL`
// caps a single request and the response says how many are left, so the client loops with a visible
// count instead of the server holding a connection open for twenty minutes and timing out.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { extractReceipt } from '@/lib/receipts/extract';
import { parseReceiptFilters, truthy, vendorSearchExpression } from '@/lib/receipts/filters';

/** Vision on a photo takes ~5–15s. Six is comfortably inside the 300s ceiling with room for the
 *  slowest one, and keeps a single click's spend legible. */
const MAX_PER_CALL = 6;
export const maxDuration = 300;

/**
 * The same narrowing the list applies, so "re-read these" means the receipts on screen.
 *
 * Generic over the builder rather than casting: PostgREST's filter methods each return `this`, so a
 * type parameter carries the chain through unchanged. The `any` this replaced worked and threw away
 * the guarantee that `.eq('categoy', …)` is a typo rather than a query that matches nothing.
 */
interface ReceiptQuery<T> {
  is(column: string, value: null): T;
  not(column: string, op: string, value: unknown): T;
  eq(column: string, value: unknown): T;
  gte(column: string, value: string): T;
  lte(column: string, value: string): T;
  or(expression: string): T;
}

function applyFilters<T extends ReceiptQuery<T>>(
  q: T,
  f: ReturnType<typeof parseReceiptFilters>,
  userId: string | null,
): T {
  let query = q;
  query = query.is('deleted_at', null);
  // A receipt with no photo can never be extracted — including it would report a failure per row
  // and spend nothing, which reads as the feature being broken.
  query = query.not('photo_url', 'is', null);
  if (f.status && f.status !== 'needs_review') query = query.eq('status', f.status);
  if (f.jobId) query = query.eq('job_id', f.jobId);
  if (userId) query = query.eq('user_id', userId);
  if (f.category) query = query.eq('category', f.category);
  if (f.paymentMethod) query = query.eq('payment_method', f.paymentMethod);
  if (f.cardId) query = query.eq('payment_card_id', f.cardId);
  if (f.last4) query = query.eq('payment_last4', f.last4);
  if (f.from) query = query.gte(f.dateColumn, `${f.from}T00:00:00.000Z`);
  if (f.to) query = query.lte(f.dateColumn, `${f.to}T23:59:59.999Z`);
  const expr = vendorSearchExpression(f.q);
  if (expr) query = query.or(expr);
  return query;
}

function filtersFrom(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  return parseReceiptFilters({
    status: sp.get('status'), from: sp.get('from'), to: sp.get('to'),
    dateField: sp.get('dateField'), jobId: sp.get('jobId'), q: sp.get('q'),
    category: sp.get('category'), paymentMethod: sp.get('paymentMethod'),
    last4: sp.get('last4'), cardId: sp.get('cardId'),
    includeDeleted: truthy(sp.get('include_deleted')),
    limit: sp.get('limit'),
  });
}

async function resolveUserId(email: string | null): Promise<string | null> {
  if (!email) return null;
  const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const match = data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return match?.id ?? null;
}

/** How many the current filter would re-read. Cheap — a HEAD count, no rows returned. */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const f = filtersFrom(req);
  const email = new URL(req.url).searchParams.get('email');
  const userId = await resolveUserId(email);

  const base = supabaseAdmin.from('receipts').select('id', { count: 'exact', head: true });
  const { count, error } = await applyFilters(base, f, userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    count: count ?? 0,
    maxPerCall: MAX_PER_CALL,
    // Named so the UI can say what it is about to spend rather than "this may take a while".
    estimatedCostCents: Math.round((count ?? 0) * 2),
  });
}, { routeName: 'receipts/reextract' });

/** Re-read up to MAX_PER_CALL of them, oldest-read first so repeated calls sweep the whole set. */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'The AI is not configured on this deployment, so nothing can be re-read.', code: 'ai_unavailable' },
      { status: 503 },
    );
  }

  const f = filtersFrom(req);
  const url = new URL(req.url);
  const email = url.searchParams.get('email');
  const userId = await resolveUserId(email);
  // The client passes the ids it has already done, so a loop makes progress instead of re-reading
  // the same six rows forever. Ordering alone cannot guarantee that: an extraction updates
  // `extraction_completed_at`, but a row that FAILS keeps its place in any ordering by it.
  const body = (await req.json().catch(() => ({}))) as { done?: string[] };
  const alreadyDone = Array.isArray(body.done) ? body.done.filter((x) => typeof x === 'string') : [];

  let select = supabaseAdmin.from('receipts').select('id');
  select = applyFilters(select, f, userId);
  if (alreadyDone.length > 0) select = select.not('id', 'in', `(${alreadyDone.join(',')})`);
  const { data: rows, error } = await select
    .order('extraction_completed_at', { ascending: true, nullsFirst: true })
    .limit(MAX_PER_CALL);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = ((rows ?? []) as { id: string }[]).map((r) => r.id);
  const results = [];
  for (const id of ids) {
    // Sequential, not Promise.all: six concurrent vision calls against one API key is how a bulk
    // action earns a 429 and reports six failures for a set that was fine.
    results.push(await extractReceipt(id, { force: true }));
  }

  const countBase = supabaseAdmin.from('receipts').select('id', { count: 'exact', head: true });
  const { count: total } = await applyFilters(countBase, f, userId);
  const doneNow = [...alreadyDone, ...ids];

  return NextResponse.json({
    processed: ids.length,
    done: results.filter((r) => r.status === 'done').length,
    failed: results.filter((r) => r.status === 'failed').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    costCents: results.reduce((s, r) => s + (r.costCents ?? 0), 0),
    results,
    doneIds: doneNow,
    remaining: Math.max(0, (total ?? 0) - doneNow.length),
  });
}, { routeName: 'receipts/reextract' });
