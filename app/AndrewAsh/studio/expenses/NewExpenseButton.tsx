'use client';
// app/AndrewAsh/studio/expenses/NewExpenseButton.tsx — logging a purchase in under thirty seconds.
//
// Speed is the whole feature. Two required fields, everything else defaulted, and the date defaults
// to today because that is when the receipt is in your hand.
//
// ── THE CATEGORY PICKER SHOWS THE HINT, NOT THE TAX LINE ────────────────────────────────────────
//
// "Equipment — microphones, interfaces, headphones, acoustic panels" tells Andrew where his purchase
// goes. "Part V / depreciation" does not, and would make a thirty-second form feel like a tax return.
// The Schedule C mapping is real and lives one screen away, on the summary.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { EXPENSE_CATEGORY_META } from '@/lib/voice/expenses';
import { parseCents } from '@/lib/voice/money';

const METHODS = [
  { id: 'card', label: 'Card' },
  { id: 'bank', label: 'Bank transfer' },
  { id: 'cash', label: 'Cash' },
  { id: 'paypal', label: 'PayPal' },
  { id: 'venmo', label: 'Venmo' },
  { id: 'other', label: 'Other' },
];

export default function NewExpenseButton({ clients }: { clients: { id: string; name: string }[] }): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [spentOn, setSpentOn] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState('equipment');
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [businessPct, setBusinessPct] = useState(100);
  const [isCapital, setIsCapital] = useState(false);
  const [billable, setBillable] = useState(false);
  const [clientId, setClientId] = useState('');
  const [notes, setNotes] = useState('');

  const meta = EXPENSE_CATEGORY_META.find((c) => c.id === category);

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const cents = parseCents(amount);
    if (!description.trim()) {
      setError('What was it for?');
      return;
    }
    if (cents <= 0) {
      setError('Enter an amount.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/voice/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          vendor,
          amountCents: cents,
          spentOn,
          category,
          paymentMethod,
          businessPct,
          isCapital,
          billable,
          clientId: billable && clientId ? clientId : null,
          notes,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not save that.');

      // Reset and stay open. Expenses arrive in batches — a shoebox of receipts on a Sunday — and
      // closing the form after each one makes logging six of them six times the work.
      setDescription('');
      setVendor('');
      setAmount('');
      setNotes('');
      setIsCapital(false);
      setBillable(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="vaBtn vaBtnSolid vaBtnSm" onClick={() => setOpen(true)}>
        <Plus size={14} aria-hidden /> Log an expense
      </button>
    );
  }

  return (
    <form onSubmit={save} className="vaPanel" style={{ marginBottom: 0, width: 'min(100%, 520px)' }}>
      {error && (
        <div className="vaNotice vaNoticeBad" role="alert">
          {error}
        </div>
      )}

      <div className="vaFieldRow vaFieldRow2">
        <div className="vaField">
          <label className="vaLabel" htmlFor="va-ex-desc">What was it?</label>
          <input
            id="va-ex-desc"
            className="vaInput"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Shure SM7B microphone"
            autoFocus
            required
          />
        </div>
        <div className="vaField">
          <label className="vaLabel" htmlFor="va-ex-amount">How much</label>
          <input
            id="va-ex-amount"
            className="vaInput"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="399.00"
            required
          />
        </div>
      </div>

      <div className="vaFieldRow vaFieldRow2">
        <div className="vaField">
          <label className="vaLabel" htmlFor="va-ex-vendor">Who from (optional)</label>
          <input id="va-ex-vendor" className="vaInput" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Sweetwater" />
        </div>
        <div className="vaField">
          <label className="vaLabel" htmlFor="va-ex-date">When</label>
          <input id="va-ex-date" type="date" className="vaInput" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
        </div>
      </div>

      <div className="vaField">
        <label className="vaLabel" htmlFor="va-ex-cat">Category</label>
        <select id="va-ex-cat" className="vaSelect" value={category} onChange={(e) => setCategory(e.target.value)}>
          {EXPENSE_CATEGORY_META.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        {meta && <p className="vaHint">{meta.hint}</p>}
      </div>

      <div className="vaField">
        <label className="vaLabel" htmlFor="va-ex-pct">Business use — {businessPct}%</label>
        <input
          id="va-ex-pct"
          type="range"
          className="vaRange"
          min={0}
          max={100}
          step={5}
          value={businessPct}
          onChange={(e) => setBusinessPct(Number(e.target.value))}
        />
        <p className="vaHint">
          A microphone is 100%. A laptop you also use personally is not — and the difference is exactly
          what an auditor asks about.
        </p>
      </div>

      <div className="vaField">
        <label className="vaLabel" htmlFor="va-ex-method">Paid by</label>
        <select id="va-ex-method" className="vaSelect" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
          {METHODS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>

      <label className="vaCheckRow">
        <input type="checkbox" checked={isCapital} onChange={(e) => setIsCapital(e.target.checked)} />
        <span>
          Big equipment purchase — deduct over time rather than all this year
          {meta?.usuallyCapital && <strong style={{ color: 'var(--va-accent)' }}> (usual for {meta.label.toLowerCase()})</strong>}
        </span>
      </label>

      <label className="vaCheckRow">
        <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
        <span>Bill this back to a client</span>
      </label>

      {billable && clients.length > 0 && (
        <div className="vaField">
          <label className="vaLabel" htmlFor="va-ex-client">Which client</label>
          <select id="va-ex-client" className="vaSelect" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Choose…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="vaField">
        <label className="vaLabel" htmlFor="va-ex-notes">Notes (optional)</label>
        <input id="va-ex-notes" className="vaInput" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="vaStudioActions">
        <button type="submit" className="vaBtn vaBtnSolid vaBtnSm" disabled={busy}>
          {busy ? <Loader2 size={14} aria-hidden className="vaSpin" /> : <Plus size={14} aria-hidden />}
          Save and add another
        </button>
        <button type="button" className="vaBtn vaBtnGhost vaBtnSm" onClick={() => setOpen(false)} disabled={busy}>
          Done
        </button>
      </div>
    </form>
  );
}
