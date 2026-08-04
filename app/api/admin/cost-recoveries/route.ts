// app/api/admin/cost-recoveries/route.ts — pass-through costs, and whether we got the money back
// (plan F2b).
//
// The owner's ask, in his words: *"if we pay a sanitarian for something and then bill the customer
// for it, that should show as no net gain."*
//
// F2 built the model that answers it and F2's whole argument was that **"no net gain" is a
// conclusion, not a flag**. Pay $450, bill $400, and a boolean says "pass-through, nets to zero"
// while the job quietly lost $50. `computeRecovery` therefore does arithmetic over the real linked
// amounts and returns `NO_NET_GAIN` only when the difference is exactly zero.
//
// That module had **no caller**. This route is it, and the shape of the query is what preserves the
// argument end to end:
//
//   * the **links come with the cost**, in one query, because computing recovery from a cost row
//     alone is exactly the boolean F2 exists to refuse — a cost with its links dropped looks
//     unrecovered, and a screen would then invite billing the customer a second time;
//   * **voided invoices are read from the invoice**, not from a flag beside the link. Seed 573 makes
//     that point explicitly: two places to record the same thing is how they come to disagree. So
//     the void status is embedded from `customer_invoices` and mapped onto `RecoveryLink.voided`,
//     which is what `computeRecovery` excludes from the recovered total while keeping the link.
//
// The arithmetic itself stays in `lib/finance/cost-recovery.ts` and runs server-side, so the browser
// never holds a second opinion about whether a job made money.

import { NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  computeRecovery,
  summarizeRecoveries,
  type CostRecovery,
  type RecoveryLink,
} from '@/lib/finance/cost-recovery';
import { isMissingTable, missingTableMessage } from '@/lib/finance/missing-table';

export const runtime = 'nodejs';

/** An invoice is voided in exactly one place: its own status. See the note in seed 573. */
const VOIDED = 'voided';

interface LinkRow {
  invoice_id: string;
  amount_cents: number;
  line_description: string | null;
  /** PostgREST returns an embedded to-one as an object, or an array when it cannot prove the
   *  relationship is to-one. Both are handled rather than assumed — guessing wrong here would make
   *  every invoice look un-voided, which silently counts voided money as recovered. */
  customer_invoices:
    | { invoice_number: string | null; status: string | null }
    | { invoice_number: string | null; status: string | null }[]
    | null;
}

interface RecoveryRow {
  id: string;
  cost_cents: number;
  payee: string | null;
  description: string | null;
  job_id: string | null;
  not_recoverable: boolean;
  not_recoverable_reason: string | null;
  created_at: string;
  cost_recovery_links: LinkRow[] | null;
}

const firstInvoice = (embedded: LinkRow['customer_invoices']) =>
  Array.isArray(embedded) ? (embedded[0] ?? null) : embedded;

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('cost_recoveries')
    .select(
      'id, cost_cents, payee, description, job_id, not_recoverable, not_recoverable_reason, created_at, ' +
        'cost_recovery_links ( invoice_id, amount_cents, line_description, ' +
        'customer_invoices ( invoice_number, status ) )',
    )
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({
        recoveries: [],
        totals: null,
        tableExists: false,
        message: missingTableMessage(
          'pass-through cost',
          'It comes from seed 573 (`cost_recoveries` and `cost_recovery_links`)',
        ),
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as RecoveryRow[];

  const models: CostRecovery[] = rows.map((row) => ({
    costCents: row.cost_cents,
    markedNotRecoverable: row.not_recoverable,
    links: (row.cost_recovery_links ?? []).map((l): RecoveryLink => {
      const inv = firstInvoice(l.customer_invoices);
      return {
        invoiceId: l.invoice_id,
        invoiceNumber: inv?.invoice_number ?? null,
        amountCents: l.amount_cents,
        voided: inv?.status === VOIDED,
      };
    }),
  }));

  const recoveries = rows.map((row, i) => ({
    id: row.id,
    payee: row.payee,
    description: row.description,
    jobId: row.job_id,
    createdAt: row.created_at,
    notRecoverableReason: row.not_recoverable_reason,
    costCents: row.cost_cents,
    // The links are returned alongside the verdict so the screen can show WHICH invoice recovered
    // it. A verdict with no working shown is one a bookkeeper has to take on faith.
    links: models[i].links,
    recovery: computeRecovery(models[i]),
  }));

  // Rolled up by the same module, so the header and the rows cannot disagree. `summarizeRecoveries`
  // reports the shortfall separately from the net on purpose: a positive net from margin elsewhere
  // would otherwise hide money paid out and never billed.
  return NextResponse.json({
    recoveries,
    totals: summarizeRecoveries(models),
    tableExists: true,
  });
});
