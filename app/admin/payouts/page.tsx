'use client';
// app/admin/payouts/page.tsx
//
// Employee payouts ledger. Lists every recorded payout in the
// selected window and lets the boss record a new one (Venmo /
// CashApp / Stripe / Check / Cash / etc.).
//
// Phase R-13 of OWNER_REPORTS.md.

import { useCallback, useEffect, useMemo, useState } from 'react';

interface Payout {
  id: string;
  userEmail: string;
  amountCents: number;
  method: string;
  reference: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  notes: string | null;
  paidAt: string;
  createdBy: string;
}

interface EmployeeOption { email: string; name: string; isActive: boolean }

const METHODS = [
  { value: 'venmo', label: 'Venmo' },
  { value: 'cashapp', label: 'CashApp' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'check', label: 'Check' },
  { value: 'cash', label: 'Cash' },
  { value: 'ach', label: 'ACH' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'other', label: 'Other' },
];

const METHOD_COLORS: Record<string, string> = {
  venmo:   '#3D95CE',
  cashapp: '#00D632',
  stripe:  '#635BFF',
  check:   '#6B7280',
  cash:    '#10B981',
  ach:     '#1D3095',
  zelle:   '#6D1ED4',
  other:   '#9CA3AF',
};

function fmtMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [byMethod, setByMethod] = useState<Record<string, number>>({});
  const [totalCents, setTotalCents] = useState(0);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [draftEmail, setDraftEmail] = useState('');
  const [draftAmount, setDraftAmount] = useState('');
  const [draftMethod, setDraftMethod] = useState('venmo');
  const [draftReference, setDraftReference] = useState('');
  const [draftPaidAt, setDraftPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [draftNotes, setDraftNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filterEmployee) params.set('employee', filterEmployee);
    if (filterMethod) params.set('method', filterMethod);
    return params.toString();
  }, [filterEmployee, filterMethod]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/payouts?${queryString}`, { cache: 'no-store' });
      if (!res.ok) {
        setError(`Couldn't load payouts (status ${res.status}).`);
        return;
      }
      const d = (await res.json()) as { payouts: Payout[]; totalCents: number; byMethod: Record<string, number> };
      setPayouts(d.payouts);
      setTotalCents(d.totalCents);
      setByMethod(d.byMethod);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    }
  }, [queryString]);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/admin/reports/employees', { cache: 'no-store' });
      if (res.ok) {
        const d = (await res.json()) as { employees: EmployeeOption[] };
        setEmployees(d.employees);
      }
    })();
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submitPayout() {
    setFormError(null);
    const dollars = parseFloat(draftAmount);
    if (!draftEmail || !dollars || dollars <= 0) {
      setFormError('Employee + positive amount required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail: draftEmail,
          amountCents: Math.round(dollars * 100),
          method: draftMethod,
          reference: draftReference.trim() || undefined,
          paidAt: new Date(draftPaidAt).toISOString(),
          notes: draftNotes.trim() || undefined,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setDraftEmail(''); setDraftAmount(''); setDraftReference(''); setDraftNotes('');
        await load();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setFormError(data.error ?? `Failed (status ${res.status}).`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="payouts-page">
      <header>
        <div>
          <h1>Payouts</h1>
          <p>Record + audit every employee payment outside the formal payroll run.</p>
        </div>
        {!showForm && (
          <button className="payouts-btn-primary" onClick={() => setShowForm(true)}>+ Record payout</button>
        )}
      </header>

      {showForm && (
        <section className="payouts-form">
          <h2>Record payout</h2>
          <div className="payouts-form-grid">
            <label>
              <span>Employee</span>
              <select value={draftEmail} onChange={(e) => setDraftEmail(e.target.value)}>
                <option value="">— Pick employee —</option>
                {employees.filter((e) => e.isActive).map((e) => (
                  <option key={e.email} value={e.email}>{e.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Amount ($)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={draftAmount}
                onChange={(e) => setDraftAmount(e.target.value)}
                placeholder="0.00"
              />
            </label>
            <label>
              <span>Method</span>
              <select value={draftMethod} onChange={(e) => setDraftMethod(e.target.value)}>
                {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
            <label>
              <span>Reference (txn id / check #)</span>
              <input
                value={draftReference}
                onChange={(e) => setDraftReference(e.target.value)}
                placeholder="optional"
              />
            </label>
            <label>
              <span>Paid on</span>
              <input type="date" value={draftPaidAt} onChange={(e) => setDraftPaidAt(e.target.value)} />
            </label>
            <label className="payouts-form-wide">
              <span>Notes</span>
              <input
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
                placeholder="optional — e.g. covers job #234 side work"
              />
            </label>
          </div>
          {formError && <div className="payouts-error">{formError}</div>}
          <div className="payouts-form-actions">
            <button onClick={() => setShowForm(false)} disabled={submitting} className="payouts-btn-secondary">Cancel</button>
            <button onClick={submitPayout} disabled={submitting} className="payouts-btn-primary">
              {submitting ? 'Recording…' : 'Record payout'}
            </button>
          </div>
        </section>
      )}

      <section className="payouts-summary">
        <div className="payouts-total">
          <span className="payouts-total-label">Total paid out</span>
          <span className="payouts-total-value">{fmtMoney(totalCents)}</span>
        </div>
        <div className="payouts-by-method">
          {Object.entries(byMethod).sort((a, b) => b[1] - a[1]).map(([method, cents]) => (
            <span key={method} className="payouts-pill" style={{ background: METHOD_COLORS[method] ?? '#9CA3AF' }}>
              {method}: {fmtMoney(cents)}
            </span>
          ))}
        </div>
      </section>

      <section className="payouts-filters">
        <label>
          Employee
          <select value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)}>
            <option value="">All employees</option>
            {employees.map((e) => <option key={e.email} value={e.email}>{e.name}</option>)}
          </select>
        </label>
        <label>
          Method
          <select value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)}>
            <option value="">All methods</option>
            {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
      </section>

      {error ? (
        <div className="payouts-empty">{error}</div>
      ) : !payouts ? (
        <div className="payouts-empty">Loading…</div>
      ) : payouts.length === 0 ? (
        <div className="payouts-empty">No payouts recorded yet.</div>
      ) : (
        <table className="payouts-table">
          <thead>
            <tr>
              <th>Paid on</th>
              <th>Employee</th>
              <th>Method</th>
              <th>Reference</th>
              <th>Notes</th>
              <th className="right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.paidAt).toLocaleDateString()}</td>
                <td>{p.userEmail}</td>
                <td>
                  <span className="payouts-pill payouts-pill-sm" style={{ background: METHOD_COLORS[p.method] ?? '#9CA3AF' }}>
                    {p.method}
                  </span>
                </td>
                <td><code>{p.reference ?? '—'}</code></td>
                <td>{p.notes ?? '—'}</td>
                <td className="right"><strong>{fmtMoney(p.amountCents)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <style jsx>{`
        .payouts-page {
          max-width: 1100px;
          margin: 0 auto;
          padding: 1.5rem;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          color: #0F1419;
        }
        header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 1.25rem;
        }
        header h1 { font-family: 'Sora', sans-serif; font-size: 1.8rem; margin: 0 0 0.25rem; }
        header p { color: #6B7280; margin: 0; }
        .payouts-btn-primary {
          padding: 0.55rem 1.1rem;
          background: #1D3095;
          color: #FFF;
          border: 0;
          border-radius: 6px;
          font-weight: 600;
          font-size: 0.88rem;
          cursor: pointer;
          font-family: inherit;
        }
        .payouts-btn-secondary {
          padding: 0.55rem 1.1rem;
          background: #FFF;
          color: #374151;
          border: 1px solid #D1D5DB;
          border-radius: 6px;
          font-weight: 500;
          font-size: 0.88rem;
          cursor: pointer;
          font-family: inherit;
        }
        .payouts-form {
          background: #FFF;
          border: 1px solid #E5E7EB;
          border-radius: 10px;
          padding: 1.25rem;
          margin-bottom: 1.25rem;
        }
        .payouts-form h2 {
          font-family: 'Sora', sans-serif;
          font-size: 1.1rem;
          margin: 0 0 0.85rem;
        }
        .payouts-form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 0.7rem;
          margin-bottom: 0.85rem;
        }
        .payouts-form-grid label {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          font-size: 0.78rem;
          color: #6B7280;
          font-weight: 600;
        }
        .payouts-form-grid input,
        .payouts-form-grid select {
          padding: 0.5rem 0.65rem;
          border: 1px solid #D1D5DB;
          border-radius: 5px;
          font-size: 0.88rem;
          font-family: inherit;
        }
        .payouts-form-wide { grid-column: 1 / -1; }
        .payouts-form-actions {
          display: flex;
          gap: 0.6rem;
          justify-content: flex-end;
        }
        .payouts-error {
          background: #FEE2E2;
          border: 1px solid #FCA5A5;
          color: #BD1218;
          padding: 0.55rem 0.85rem;
          border-radius: 6px;
          margin-bottom: 0.85rem;
          font-size: 0.85rem;
        }
        .payouts-summary {
          display: flex;
          gap: 1.5rem;
          align-items: center;
          background: #FFF;
          border: 1px solid #E5E7EB;
          border-radius: 10px;
          padding: 1rem 1.25rem;
          margin-bottom: 1rem;
          flex-wrap: wrap;
        }
        .payouts-total { display: flex; flex-direction: column; }
        .payouts-total-label {
          font-size: 0.72rem;
          color: #6B7280;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-weight: 600;
        }
        .payouts-total-value {
          font-family: 'Sora', sans-serif;
          font-size: 1.6rem;
          font-weight: 700;
        }
        .payouts-by-method {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
        }
        .payouts-pill {
          padding: 0.2rem 0.6rem;
          color: #FFF;
          border-radius: 999px;
          font-size: 0.82rem;
          font-weight: 600;
        }
        .payouts-pill-sm {
          font-size: 0.74rem;
          padding: 0.1rem 0.5rem;
        }
        .payouts-filters {
          display: flex;
          gap: 0.85rem;
          margin-bottom: 1rem;
        }
        .payouts-filters label {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          font-size: 0.78rem;
          color: #6B7280;
          font-weight: 600;
        }
        .payouts-filters select {
          padding: 0.4rem 0.6rem;
          border: 1px solid #D1D5DB;
          border-radius: 5px;
          font-size: 0.85rem;
          font-family: inherit;
          min-width: 180px;
        }
        .payouts-empty {
          background: #FFF;
          border: 1px solid #E5E7EB;
          border-radius: 10px;
          padding: 2rem;
          text-align: center;
          color: #6B7280;
        }
        .payouts-table {
          width: 100%;
          background: #FFF;
          border: 1px solid #E5E7EB;
          border-radius: 10px;
          border-collapse: separate;
          border-spacing: 0;
          overflow: hidden;
          font-size: 0.88rem;
        }
        .payouts-table th, .payouts-table td {
          text-align: left;
          padding: 0.6rem 0.85rem;
          border-bottom: 1px solid #F3F4F6;
        }
        .payouts-table th {
          background: #F9FAFB;
          font-weight: 600;
          color: #6B7280;
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .right { text-align: right; }
        .payouts-table code {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 0.82rem;
          color: #374151;
        }
      `}</style>
    </div>
  );
}
