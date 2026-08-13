// app/api/cron/receipt-extraction/route.ts — the safety net under receipt AI.
//
// The capture page kicks an extraction the moment a receipt lands, which handles the ordinary case.
// This sweep exists for the cases it cannot:
//
//   * a receipt uploaded from the mobile app, which inserts its row directly and never calls the
//     web endpoint;
//   * a tab closed between the upload finishing and the extraction request being sent;
//   * a Vision call that failed once on a transient 529;
//   * every receipt already sitting in the backlog from the months when nothing ran the worker —
//     which is the reason this route exists at all, and is the first thing it will clear.
//
// Hourly rather than nightly: a receipt whose fields appear the same afternoon can be approved in
// the same sitting, and a bookkeeper who has to come back tomorrow tends not to.
//
// Auth: `Authorization: Bearer <CRON_SECRET>`, matching every other cron here.

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/apiErrorHandler';
import { sweepQueuedReceipts } from '@/lib/receipts/extract';

/** A batch of receipts, each a Vision call, run in sequence. 300 s is the ceiling this plan allows
 *  and the batch size below is chosen to finish inside it with room to spare. */
export const maxDuration = 300;

/** Sized so a full batch of slow calls still lands inside `maxDuration`: 25 × ~10 s ≈ 250 s.
 *  Anything left over is picked up by the next hourly run rather than being lost. */
const BATCH_SIZE = 25;

export const GET = withErrorHandler(async (req: NextRequest) => {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron/receipt-extraction] CRON_SECRET not set');
    return NextResponse.json({ error: 'CRON_SECRET not configured.' }, { status: 500 });
  }
  if ((req.headers.get('authorization') ?? '') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    // Not a 500. The sweep has nothing to do and saying why is more useful than a stack trace in a
    // cron log nobody reads — a missing key is a deployment fact, not a runtime fault.
    return NextResponse.json(
      { skipped: true, reason: 'ANTHROPIC_API_KEY is not set on this deployment.' },
      { status: 200 },
    );
  }

  const results = await sweepQueuedReceipts(BATCH_SIZE);
  const done = results.filter((r) => r.status === 'done').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  // Rows another entry point had already claimed. Counted separately so the log line does not read
  // as a fault: the sweep reaching a receipt the capture page is already extracting is the normal
  // race, and the claim refusing it is the guard working.
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const costCents = results.reduce((sum, r) => sum + (r.costCents ?? 0), 0);

  // Always log a line, including for an empty sweep. A silent run makes a stuck cron
  // indistinguishable from a healthy idle one — the exact confusion that let the queued backlog sit
  // unnoticed for months in the first place.
  console.log(`[cron/receipt-extraction] ${done} done, ${failed} failed, ${skipped} already running, ${costCents}¢`);

  return NextResponse.json({ attempted: results.length, done, failed, skipped, costCents });
}, { routeName: 'cron/receipt-extraction' });
