// app/AndrewAsh/studio/page.tsx — the dashboard.
//
// ── WHAT A DASHBOARD IS FOR ─────────────────────────────────────────────────────────────────────
//
// Not "everything at a glance". It answers two questions, in this order:
//
//   1. What needs me right now?     → unanswered inquiries, overdue invoices, unsigned contracts
//   2. How is the business doing?   → cash in, outstanding, expenses, what to set aside for tax
//
// Anything that is not one of those two is a link, not a tile. A dashboard that shows twelve numbers
// is a dashboard where none of them get looked at.
//
// The needs-attention list comes FIRST and is empty most days. An empty state that says "nothing
// needs you" is a genuinely useful thing to see, and it is why the section is not hidden when empty.

import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileSignature,
  Inbox,
  PlusCircle,
  Receipt,
  TrendingUp,
} from 'lucide-react';

import { supabaseAdmin } from '@/lib/supabase';
import { getVoiceSession } from '@/lib/voice/auth';
import { formatCents, balanceCents, daysUntilDue } from '@/lib/voice/money';
import { computeProfitAndLoss } from '@/lib/voice/expenses';
import { BASE_PATH } from '@/lib/voice/content';

export const metadata: Metadata = { title: 'Studio' };
export const dynamic = 'force-dynamic';

interface AttentionItem {
  id: string;
  label: string;
  detail: string;
  href: string;
  tone: 'warn' | 'info';
}

/** Every dashboard query in one place, each independently fault-tolerant.
 *
 *  The tables may not exist yet — this platform is reviewed before its seeds are applied — so a
 *  failed query yields a zero rather than a 500. A dashboard that cannot render is worse than one
 *  showing zeros with an explanation. */
async function loadDashboard() {
  const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };

  const [inquiries, invoices, payments, expenses, contracts, pages] = await Promise.all([
    safe(async () => (await supabaseAdmin.from('va_inquiries').select('id, name, intent, status, created_at').eq('status', 'new').order('created_at', { ascending: false }).limit(10)).data ?? [], []),
    safe(async () => (await supabaseAdmin.from('va_invoices').select('id, invoice_number, total_cents, paid_cents, status, due_date, client_id').not('status', 'in', '("draft","void")')).data ?? [], []),
    safe(async () => (await supabaseAdmin.from('va_payments').select('amount_cents, received_at').eq('status', 'succeeded')).data ?? [], []),
    safe(async () => (await supabaseAdmin.from('va_expenses').select('amount_cents, business_pct, is_capital, category, spent_on')).data ?? [], []),
    safe(async () => (await supabaseAdmin.from('va_contracts').select('id, contract_number, title, status, sent_at').eq('status', 'sent')).data ?? [], []),
    safe(async () => (await supabaseAdmin.from('va_pages').select('id, title, status, draft_blocks').eq('kind', 'project')).data ?? [], []),
  ]);

  return { inquiries, invoices, payments, expenses, contracts, pages };
}

export default async function StudioDashboard(): Promise<React.ReactElement> {
  const session = getVoiceSession();
  const { inquiries, invoices, payments, expenses, contracts, pages } = await loadDashboard();
  const today = new Date();
  const year = today.getFullYear();

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const receivedThisYear = (payments as any[])
    .filter((p) => new Date(p.received_at).getFullYear() === year)
    .reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);

  const outstanding = (invoices as any[]).reduce(
    (sum, inv) => sum + balanceCents(inv.total_cents ?? 0, inv.paid_cents ?? 0),
    0,
  );

  const pnl = computeProfitAndLoss({
    paymentsReceivedCents: receivedThisYear,
    invoicedOutstandingCents: outstanding,
    expenses: (expenses as any[])
      .filter((e) => new Date(e.spent_on).getFullYear() === year)
      .map((e) => ({
        amountCents: e.amount_cents ?? 0,
        businessPct: e.business_pct ?? 100,
        isCapital: e.is_capital === true,
        category: e.category,
      })),
  });

  // ── What needs attention ──
  const attention: AttentionItem[] = [];

  for (const inq of (inquiries as any[]).slice(0, 5)) {
    attention.push({
      id: `inq-${inq.id}`,
      label: `${inq.name} is waiting on a reply`,
      detail: `${inq.intent === 'coaching' ? 'Coaching' : 'Voice-over'} inquiry`,
      href: `${BASE_PATH}/studio/inquiries/${inq.id}`,
      tone: 'info',
    });
  }

  for (const inv of invoices as any[]) {
    const days = daysUntilDue(inv.due_date, today);
    if (days !== null && days < 0 && balanceCents(inv.total_cents, inv.paid_cents) > 0) {
      attention.push({
        id: `inv-${inv.id}`,
        label: `Invoice ${inv.invoice_number} is ${Math.abs(days)} days overdue`,
        detail: formatCents(balanceCents(inv.total_cents, inv.paid_cents)) + ' outstanding',
        href: `${BASE_PATH}/studio/invoices/${inv.id}`,
        tone: 'warn',
      });
    }
  }

  for (const c of contracts as any[]) {
    attention.push({
      id: `con-${c.id}`,
      label: `${c.title} is waiting to be signed`,
      detail: `Sent ${c.sent_at ? new Date(c.sent_at).toLocaleDateString('en-US') : 'recently'}`,
      href: `${BASE_PATH}/studio/contracts/${c.id}`,
      tone: 'info',
    });
  }

  const unpublished = (pages as any[]).filter((p) => Array.isArray(p.draft_blocks) && p.draft_blocks.length);
  for (const p of unpublished) {
    attention.push({
      id: `page-${p.id}`,
      label: `"${p.title}" has unpublished changes`,
      detail: 'Nobody can see these yet',
      href: `${BASE_PATH}/studio/pages/${p.id}`,
      tone: 'info',
    });
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const firstName = session?.displayName?.split(' ')[0] ?? 'Andrew';
  const hour = today.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <div className="vaStudioHead">
        <div>
          <h1 className="vaStudioTitle">
            {greeting}, {firstName}.
          </h1>
          <p className="vaStudioSub">
            {attention.length === 0
              ? 'Nothing needs you right now. Good time to send some pitches.'
              : `${attention.length} thing${attention.length === 1 ? '' : 's'} need${attention.length === 1 ? 's' : ''} a look.`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href={`${BASE_PATH}/studio/guide`} className="vaBtn vaBtnOutline vaBtnSm">
            <BookOpen size={14} aria-hidden /> Start here
          </Link>
          <Link href={`${BASE_PATH}/studio/pages`} className="vaBtn vaBtnSolid vaBtnSm">
            <PlusCircle size={14} aria-hidden /> New project
          </Link>
        </div>
      </div>

      {/* ── NEEDS ATTENTION ── */}
      <div className="vaPanel">
        <div className="vaPanelHead">
          <h2 className="vaPanelTitle">What needs you</h2>
        </div>

        {attention.length === 0 ? (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', color: 'var(--va-text-muted)' }}>
            <CheckCircle2 size={20} aria-hidden style={{ color: 'var(--va-positive)', flex: 'none', marginTop: 2 }} />
            <p style={{ margin: 0, fontSize: '0.9375rem' }}>
              Inbox clear, nothing overdue, nothing unsigned, nothing unpublished. The highest-value
              thing you can do with a clear queue is send ten pitches — see{' '}
              <Link href={`${BASE_PATH}/studio/guide#cheapest-first`} style={{ color: 'var(--va-accent)' }}>
                the cheapest ways to get gigs
              </Link>
              .
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {attention.slice(0, 8).map((item) => (
              <Link
                key={item.id}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  border: '1px solid var(--va-line)',
                  borderRadius: 4,
                  textDecoration: 'none',
                  background: 'var(--va-surface-raised)',
                }}
              >
                {item.tone === 'warn' ? (
                  <AlertTriangle size={16} aria-hidden style={{ color: 'var(--va-danger)', flex: 'none' }} />
                ) : (
                  <Inbox size={16} aria-hidden style={{ color: 'var(--va-accent)', flex: 'none' }} />
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', color: 'var(--va-text)', fontSize: '0.9375rem' }}>{item.label}</span>
                  <span style={{ display: 'block', color: 'var(--va-text-muted)', fontSize: '0.8125rem' }}>{item.detail}</span>
                </span>
                <ArrowRight size={15} aria-hidden style={{ color: 'var(--va-text-muted)', flex: 'none' }} />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── MONEY ── */}
      <div className="vaTiles">
        <div className="vaTile">
          <span className="vaTileLabel">Received in {year}</span>
          <span className="vaTileValue vaTileValueAccent">{formatCents(pnl.incomeCents)}</span>
          <p className="vaTileNote">Money that has actually arrived.</p>
        </div>
        <div className="vaTile">
          <span className="vaTileLabel">Outstanding</span>
          <span className="vaTileValue">{formatCents(pnl.outstandingCents)}</span>
          <p className="vaTileNote">Invoiced and not yet paid. Do not spend it.</p>
        </div>
        <div className="vaTile">
          <span className="vaTileLabel">Expenses ({year})</span>
          <span className="vaTileValue">{formatCents(pnl.expenseCents)}</span>
          <p className="vaTileNote">Business share, after use percentages.</p>
        </div>
        <div className="vaTile">
          <span className="vaTileLabel">Set aside for tax</span>
          <span className="vaTileValue">{formatCents(pnl.estimatedTaxSetAsideCents)}</span>
          <p className="vaTileNote">
            {pnl.setAsideRatePct}% of {formatCents(pnl.netCents)} net. A savings prompt, not a tax bill.
          </p>
        </div>
      </div>

      <div className="vaPanel">
        <div className="vaPanelHead">
          <h2 className="vaPanelTitle">Jump to</h2>
        </div>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}>
          {[
            { href: `${BASE_PATH}/studio/inquiries`, label: 'Inquiries', icon: Inbox, note: `${(inquiries as unknown[]).length} new` },
            { href: `${BASE_PATH}/studio/invoices`, label: 'Invoices', icon: Receipt, note: `${formatCents(outstanding)} out` },
            { href: `${BASE_PATH}/studio/contracts`, label: 'Contracts', icon: FileSignature, note: `${(contracts as unknown[]).length} awaiting signature` },
            { href: `${BASE_PATH}/studio/expenses`, label: 'Expenses', icon: TrendingUp, note: 'Log a receipt' },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="vaTile">
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--va-accent)', marginBottom: 10 }}>
                <item.icon size={17} aria-hidden />
                <span style={{ color: 'var(--va-text)', fontSize: '0.9375rem', fontWeight: 600 }}>{item.label}</span>
              </span>
              <p className="vaTileNote" style={{ margin: 0 }}>{item.note}</p>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
