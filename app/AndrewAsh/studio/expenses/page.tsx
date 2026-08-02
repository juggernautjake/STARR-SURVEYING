// app/AndrewAsh/studio/expenses/page.tsx — what went out, and what it means in April.
//
// The point of this page is not bookkeeping for its own sake. It is that a $900 microphone logged
// here is a $900 deduction, and the same microphone unlogged is a $900 gift to the IRS. So the page
// leads with the deduction total rather than the spend total — the number that answers "was it worth
// the thirty seconds".
//
// Capital purchases are counted SEPARATELY and never folded into the in-year deduction. A booth or a
// $2,000 microphone is depreciated, and quietly adding it to this year's total would overstate the
// deduction by the whole purchase — the exact error that produces an amended return.

import type { Metadata } from 'next';
import Link from 'next/link';
import { Receipt } from 'lucide-react';

import NewExpenseButton from './NewExpenseButton';
import ExpenseRow from './ExpenseRow';
import { supabaseAdmin } from '@/lib/supabase';
import { categoryMeta, summarizeExpenses } from '@/lib/voice/expenses';
import { formatCents } from '@/lib/voice/money';
import { BASE_PATH } from '@/lib/voice/content';

export const metadata: Metadata = { title: 'Expenses' };
export const dynamic = 'force-dynamic';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: { year?: string };
}): Promise<React.ReactElement> {
  const thisYear = new Date().getFullYear();
  const year = /^\d{4}$/.test(searchParams.year ?? '') ? Number(searchParams.year) : thisYear;

  let rows: any[] = [];
  let clients: any[] = [];
  try {
    const [ex, cl] = await Promise.all([
      supabaseAdmin
        .from('va_expenses')
        .select('*')
        .gte('spent_on', `${year}-01-01`)
        .lte('spent_on', `${year}-12-31`)
        .order('spent_on', { ascending: false })
        .limit(1000),
      supabaseAdmin.from('va_clients').select('id, name').order('name'),
    ]);
    rows = ex.data ?? [];
    clients = cl.data ?? [];
  } catch {
    rows = [];
    clients = [];
  }

  const summary = summarizeExpenses(
    rows.map((r) => ({
      amountCents: r.amount_cents ?? 0,
      businessPct: r.business_pct ?? 100,
      isCapital: r.is_capital === true,
      category: r.category,
      spentOn: r.spent_on,
    })),
  );

  const unbilled = rows.filter((r) => r.billable && !r.invoice_id);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Only offer years that actually have data, plus this one — a dropdown of empty years is noise.
  const years = Array.from(new Set([thisYear, ...rows.map((r) => Number(String(r.spent_on).slice(0, 4)))]))
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => b - a);

  return (
    <>
      <div className="vaStudioHead">
        <div>
          <h1 className="vaStudioTitle">Expenses</h1>
          <p className="vaStudioSub">
            Photograph the receipt at the till, not later. Thirty seconds now is real money off the tax
            bill — see{' '}
            <Link href={`${BASE_PATH}/studio/guide#legal-not-advice`} style={{ color: 'var(--va-accent)' }}>
              what you can deduct
            </Link>
            .
          </p>
        </div>
        <NewExpenseButton clients={clients.map((c) => ({ id: c.id, name: c.name }))} />
      </div>

      {years.length > 1 && (
        <div className="vaTabRow">
          {years.map((y) => (
            <Link key={y} href={`${BASE_PATH}/studio/expenses?year=${y}`} className={`vaTab${y === year ? ' vaTabActive' : ''}`}>
              {y}
            </Link>
          ))}
        </div>
      )}

      <div className="vaTiles">
        <div className="vaTile">
          <span className="vaTileLabel">Deductible this year</span>
          <span className="vaTileValue vaTileValueAccent">{formatCents(summary.deductibleNowCents)}</span>
          <p className="vaTileNote">Business share, excluding capital purchases.</p>
        </div>
        <div className="vaTile">
          <span className="vaTileLabel">Total spent</span>
          <span className="vaTileValue">{formatCents(summary.totalCents)}</span>
          <p className="vaTileNote">{summary.count} entries in {year}.</p>
        </div>
        <div className="vaTile">
          <span className="vaTileLabel">Capital purchases</span>
          <span className="vaTileValue">{formatCents(summary.capitalCents)}</span>
          <p className="vaTileNote">Depreciated over time. Ask your accountant.</p>
        </div>
        {unbilled.length > 0 && (
          <div className="vaTile">
            <span className="vaTileLabel">Billable, not invoiced</span>
            <span className="vaTileValue" style={{ color: '#ff9c7e' }}>
              {formatCents(unbilled.reduce((s, r) => s + (r.amount_cents ?? 0), 0))}
            </span>
            <p className="vaTileNote">{unbilled.length} to add to an invoice.</p>
          </div>
        )}
      </div>

      {summary.byCategory.length > 0 && (
        <div className="vaPanel">
          <div className="vaPanelHead">
            <h2 className="vaPanelTitle">Where it went</h2>
            <span className="vaMuted" style={{ fontSize: '0.75rem' }}>Business share, by category</span>
          </div>
          <ul className="vaSpecList">
            {summary.byCategory.map((c) => {
              const pct = summary.businessCents > 0 ? (c.businessCents / summary.businessCents) * 100 : 0;
              return (
                <li key={c.category}>
                  <span className="vaSpecKey">
                    {c.label}
                    <span style={{ color: 'var(--va-text-muted)', marginLeft: 8, textTransform: 'none', letterSpacing: 0 }}>
                      {categoryMeta(c.category).scheduleC}
                    </span>
                  </span>
                  <span className="vaSpecValue vaNum">
                    {formatCents(c.businessCents)}
                    <span className="vaCatBar" aria-hidden>
                      <span style={{ width: `${pct}%` }} />
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="vaEmptyPanel">
          <Receipt size={28} aria-hidden style={{ color: 'var(--va-accent)', marginBottom: 14 }} />
          <p style={{ margin: '0 0 8px', color: 'var(--va-text)', fontSize: '0.9375rem' }}>Nothing logged for {year}.</p>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>
            Start with what you already own — microphone, interface, headphones, treatment. Anything
            bought this tax year counts.
          </p>
        </div>
      ) : (
        <table className="vaDataTable">
          <thead>
            <tr>
              <th>What</th>
              <th>Category</th>
              <th>When</th>
              <th className="vaNum">Amount</th>
              <th className="vaNum">Deductible</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <ExpenseRow
                key={r.id}
                expense={{
                  id: r.id,
                  description: r.description,
                  vendor: r.vendor,
                  amountCents: r.amount_cents,
                  spentOn: r.spent_on,
                  category: r.category,
                  businessPct: r.business_pct,
                  isCapital: r.is_capital,
                  billable: r.billable,
                }}
              />
            ))}
          </tbody>
        </table>
      )}

      <p className="vaHint" style={{ marginTop: 18 }}>
        These figures are bookkeeping, not tax advice. They follow the ordinary rules for a US sole
        proprietor filing Schedule C — an accountant will tell you what applies to you.
      </p>
    </>
  );
}
