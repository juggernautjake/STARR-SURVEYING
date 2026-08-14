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
import { sweepQueuedReceipts, countQueuedReceipts } from '@/lib/receipts/extract';
import { sweepSamePurchase } from '@/lib/receipts/pair-sweep';
import { rematchOpenReceipts } from '@/lib/receipts/rematch-cards';

/** Each receipt is a Vision call, run in sequence. 300 s is the ceiling this plan allows. */
export const maxDuration = 300;
const MAX_DURATION_MS = 300_000;

/** Held back from the sweep's budget so this handler can still count what is left and return a
 *  response. A run killed by the platform mid-JSON is a run whose log line never appears, which is
 *  the state that made the original stuck queue invisible. */
const CRON_MARGIN_MS = 15_000;

/** Rows fetched per round trip inside the sweep. NOT a cap on the run: since 2026-08-13 the sweep
 *  re-fetches and keeps going until the queue is dry or its budget is spent, because at one page an
 *  hour a shoebox of receipts took a working day to read. */
const BATCH_SIZE = 25;

export const GET = withErrorHandler(async (req: NextRequest) => {
  const startedAt = Date.now();
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron/receipt-extraction] CRON_SECRET not set');
    return NextResponse.json({ error: 'CRON_SECRET not configured.' }, { status: 500 });
  }
  if ((req.headers.get('authorization') ?? '') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── The two catch-up sweeps do NOT run every tick ──────────────────────────────────────────────
  //
  // This cron went from hourly to every two minutes so a receipt is never waiting long for the AI.
  // Extraction earns that frequency; these two do not. Both are full scans — pairing reads 120 days
  // of receipts, the card check reads every row whose card question is unsettled — and both exist to
  // catch rows that arrived before some rule did. Running them 720 times a day instead of 24 would
  // be a thirtyfold cost increase to re-derive the same answer about the same rows.
  //
  // So they run twice an hour by the clock, AND immediately after any tick that actually extracted
  // something — which is the only event that can create a new pair or a new card to recognise. The
  // clock arm is what keeps them running on a deployment with no API key, where extraction never
  // reports work but receipts extracted long ago still need pairing.
  const minute = new Date().getUTCMinutes();
  const catchUpDue = minute % 30 < 2;

  const runCatchUps = async () => {
    const pairing = await sweepSamePurchase();
    if (pairing.paired > 0 || pairing.repaired > 0 || pairing.errors.length > 0) {
      console.log(
        `[cron/receipt-extraction] same-purchase: ${pairing.paired} linked of ${pairing.scanned} scanned`
          + (pairing.repaired ? `, ${pairing.repaired} charge splits filled in` : '')
          + (pairing.errors.length ? ` — ${pairing.errors.length} failed` : ''),
      );
    }
    // Registering a card already triggers this, but that only helps a receipt somebody is actively
    // chasing. Running it here is what makes the answer converge on its own.
    const cardMatching = await rematchOpenReceipts();
    if (cardMatching.updated > 0) {
      console.log(
        `[cron/receipt-extraction] card check: ${cardMatching.updated} updated of `
          + `${cardMatching.considered} open — ${cardMatching.resolved} now matched to a card on file`,
      );
    }
    return { pairing, cardMatching };
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    // Not a 500. The sweep has nothing to do and saying why is more useful than a stack trace in a
    // cron log nobody reads — a missing key is a deployment fact, not a runtime fault. The catch-ups
    // still run, because neither needs a Vision call.
    const catchUps = catchUpDue ? await runCatchUps() : null;
    return NextResponse.json(
      { skipped: true, reason: 'ANTHROPIC_API_KEY is not set on this deployment.', ...catchUps },
      { status: 200 },
    );
  }

  // Extraction FIRST, and it gets the whole budget. It is the part somebody is waiting on — the
  // catch-ups below re-derive facts about rows already read, and a receipt whose total is still
  // blank is the one a person is looking at.
  //
  // The sweep DRAINS rather than taking one page: it keeps claiming until the queue is empty or the
  // budget is spent. The budget is what is left of `maxDuration`, minus a margin this handler keeps
  // so it can still count the remainder and return a response.
  const spentMs = Date.now() - startedAt;
  const results = await sweepQueuedReceipts(BATCH_SIZE, {
    budgetMs: Math.max(0, MAX_DURATION_MS - spentMs - CRON_MARGIN_MS),
  });
  const done = results.filter((r) => r.status === 'done').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  // Rows another entry point had already claimed. Counted separately so the log line does not read
  // as a fault: the sweep reaching a receipt the capture page is already extracting is the normal
  // race, and the claim refusing it is the guard working.
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const costCents = results.reduce((sum, r) => sum + (r.costCents ?? 0), 0);

  // What is STILL waiting after this run. Without it a drain that ran out of time is indistinguish-
  // able from one that finished the queue, and "did it get through them all?" — the owner's actual
  // question — has no answer anywhere. Runs every two minutes, so a remainder is a schedule, not a
  // backlog; it is logged as a fact rather than a warning.
  const remaining = await countQueuedReceipts();

  // Now the catch-ups — on the clock, or because this tick read receipts that may have created a
  // pair or produced a card nobody has recognised yet.
  const catchUps = catchUpDue || done > 0 ? await runCatchUps() : null;

  // Always log a line, including for an empty sweep. A silent run makes a stuck cron
  // indistinguishable from a healthy idle one — the exact confusion that let the queued backlog sit
  // unnoticed for months in the first place.
  console.log(
    `[cron/receipt-extraction] ${done} done, ${failed} failed, ${skipped} already running, `
      + `${costCents}¢ — ${remaining} still queued`,
  );

  return NextResponse.json({
    attempted: results.length, done, failed, skipped, costCents, remaining, ...catchUps,
  });
}, { routeName: 'cron/receipt-extraction' });
