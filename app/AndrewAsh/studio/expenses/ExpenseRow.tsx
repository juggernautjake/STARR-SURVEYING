'use client';
// app/AndrewAsh/studio/expenses/ExpenseRow.tsx — one row, deletable.
//
// A whole client component for a delete button is more than it looks: the expenses table is a server
// component so it can query directly, and a server component cannot hold an onClick. Isolating the
// interactivity to the row keeps the table itself on the server.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';
import { categoryMeta, currentYearDeductionCents } from '@/lib/voice/expenses';
import { formatCents } from '@/lib/voice/money';

interface Expense {
  id: string;
  description: string;
  vendor: string | null;
  amountCents: number;
  spentOn: string;
  category: string;
  businessPct: number;
  isCapital: boolean;
  billable: boolean;
}

export default function ExpenseRow({ expense }: { expense: Expense }): React.ReactElement {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const deduction = currentYearDeductionCents({
    amountCents: expense.amountCents,
    businessPct: expense.businessPct,
    isCapital: expense.isCapital,
  });

  return (
    <tr style={busy ? { opacity: 0.5 } : undefined}>
      <td data-label="What">
        <span style={{ color: 'var(--va-text)', fontWeight: 600 }}>{expense.description}</span>
        {expense.vendor && (
          <span style={{ display: 'block', color: 'var(--va-text-muted)', fontSize: '0.8125rem' }}>{expense.vendor}</span>
        )}
        <span style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
          {expense.isCapital && <span className="vaStatusPill">Capital</span>}
          {expense.billable && <span className="vaStatusPill vaStatusNew">Billable</span>}
          {expense.businessPct < 100 && <span className="vaStatusPill">{expense.businessPct}% business</span>}
        </span>
      </td>
      <td data-label="Category">{categoryMeta(expense.category).label}</td>
      <td data-label="When">{expense.spentOn}</td>
      <td data-label="Amount" className="vaNum">{formatCents(expense.amountCents)}</td>
      <td data-label="Deductible" className="vaNum">
        {deduction.cents > 0 ? (
          formatCents(deduction.cents)
        ) : (
          // A capital purchase shows a dash with the reason on hover rather than $0, which would read
          // as "not deductible" when the truth is "deducted differently".
          <span className="vaMuted" title={deduction.note ?? undefined}>
            over time
          </span>
        )}
      </td>
      <td data-label="">
        <button
          type="button"
          className="vaBtn vaBtnGhost vaBtnSm"
          disabled={busy}
          aria-label={`Delete ${expense.description}`}
          onClick={async () => {
            if (!window.confirm(`Delete "${expense.description}"?`)) return;
            setBusy(true);
            await fetch(`/api/voice/expenses/${expense.id}`, { method: 'DELETE' });
            router.refresh();
          }}
        >
          {busy ? <Loader2 size={13} aria-hidden className="vaSpin" /> : <Trash2 size={13} aria-hidden />}
        </button>
      </td>
    </tr>
  );
}
