// app/api/admin/receipts/[id]/deep-read/route.ts — the slow, thorough read of one receipt.
//
// Owner, 2026-08-18: *"Can we make it so that the analysis takes longer, breaks the receipt down
// into multiple images, thoroughly scans each individual image, does more research on the items
// purchased and the address, and then pulls all of the info together to make a much better result?"*
//
// Deliberately a SEPARATE door from `/extract` rather than a flag on it, for three reasons:
//
//   * `/extract` is fired automatically after every upload and by the nightly sweep. Making it ten
//     times slower and ten times dearer by default would change the cost of every receipt the firm
//     files, including the crisp ones a single pass reads perfectly.
//   * It needs `maxDuration = 300`, and `/extract` runs at 60. A 60-second ceiling would kill this
//     mid-flight and record a failure on a receipt that was being read correctly.
//   * "Read this one properly" is a decision a person makes about a receipt they are looking at, and
//     it deserves its own button rather than being a hidden mode of another one.
//
// BOOKKEEPER ONLY. Unlike `/extract`, which any member of staff may run on their own receipt, this
// one is metered work — a dozen vision calls per press — and the button that fires it should be
// where the money decisions are made.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { deepReadReceipt } from '@/lib/receipts/deep-read';
import { RECEIPTS_BUCKET, buildReceiptUpdate } from '@/worker/src/services/receipt-extraction-core';

export const runtime = 'nodejs';

/** The pipeline is nine stages and lands between 90 s and 3 minutes. 300 is the platform ceiling and
 *  the pipeline is bounded well inside it; a run that somehow exceeded it would be killed with the
 *  row left `running`, which the existing stale-reclaim already cleans up. */
export const maxDuration = 300;

/** $/MTok for the vision model, mirroring `lib/receipts/extract.ts`. */
const INPUT_USD_PER_MTOK = 3.0;
const OUTPUT_USD_PER_MTOK = 15.0;

function costCentsFor(inputTokens: number, outputTokens: number): number {
  const usd = (inputTokens / 1_000_000) * INPUT_USD_PER_MTOK
    + (outputTokens / 1_000_000) * OUTPUT_USD_PER_MTOK;
  return Math.round(usd * 100);
}

export const POST = withErrorHandler(
  async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdmin(session.user.roles)) {
      return NextResponse.json({ error: 'Bookkeepers only' }, { status: 403 });
    }

    const segments = new URL(req.url).pathname.split('/').filter(Boolean);
    const id = segments[segments.length - 2];
    if (!id) return NextResponse.json({ error: 'Missing receipt id' }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as { bands?: number };

    const { data: row, error } = await supabaseAdmin
      .from('receipts')
      .select('id, photo_url, vendor_name, vendor_address, transaction_at, subtotal_cents, tax_cents,'
        + ' tip_cents, total_cents, payment_method, payment_last4, category, category_source,'
        + ' tax_deductible_flag, notes')
      .eq('id', id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    if (!row.photo_url) {
      return NextResponse.json({ error: 'This receipt has no photo to read.' }, { status: 400 });
    }
    if (String(row.photo_url).toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { error: 'PDF receipts are stored but not read by the AI — enter the fields by hand.' },
        { status: 400 },
      );
    }

    const { data: file, error: dlErr } = await supabaseAdmin.storage
      .from(RECEIPTS_BUCKET)
      .download(row.photo_url as string);
    if (dlErr || !file) {
      return NextResponse.json(
        { error: `Could not fetch the photo: ${dlErr?.message ?? 'no data'}` },
        { status: 502 },
      );
    }

    let result;
    try {
      result = await deepReadReceipt(Buffer.from(await file.arrayBuffer()), {
        bands: body.bands,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Thrown only when the environment cannot do the work at all — no API key. Named in the words
      // of the thing somebody has to go and fix.
      return NextResponse.json({ error: message, code: 'ai_unavailable' }, { status: 503 });
    }

    const costCents = costCentsFor(result.inputTokens, result.outputTokens);

    // The SAME merge rules the ordinary extractor uses: a field a person has already typed is never
    // overwritten by a machine reading, however thorough. `buildReceiptUpdate` is where that rule
    // lives, and re-implementing it here is how the two paths would drift apart.
    const update = buildReceiptUpdate(
      row as never,
      result.fields as never,
      costCents,
      new Date().toISOString(),
    );

    // The evidence, which is this route's whole reason for existing.
    update.deep_read_at = new Date().toISOString();
    update.deep_transcript = result.transcript;
    update.deep_discrepancies = result.discrepancies;
    update.deep_stages = result.stages;
    update.deep_vendor_check = result.vendorCheck ?? null;
    update.deep_crop = result.crop ?? null;
    update.deep_band_count = result.bandCount;
    update.deep_duration_ms = result.totalMs;
    update.deep_cost_cents = costCents;

    const { error: writeErr } = await supabaseAdmin.from('receipts').update(update).eq('id', id);
    if (writeErr) {
      // The read succeeded and the write did not. Returning the result anyway means the work is not
      // wasted and the operator sees what it found, with the failure named.
      return NextResponse.json(
        { result, warning: `Read succeeded but could not be saved: ${writeErr.message}` },
        { status: 200 },
      );
    }

    return NextResponse.json({
      result: {
        summary: result.summary,
        discrepancies: result.discrepancies,
        transcript: result.transcript,
        vendorCheck: result.vendorCheck,
        stages: result.stages,
        bandCount: result.bandCount,
        totalMs: result.totalMs,
        costCents,
        fields: result.fields,
      },
    });
  },
  { routeName: 'admin/receipts/deep-read' },
);
