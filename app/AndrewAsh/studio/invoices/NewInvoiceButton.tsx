'use client';
// app/AndrewAsh/studio/invoices/NewInvoiceButton.tsx — raise an invoice.
//
// Line items are entered in DOLLARS and converted to cents on the way out. Andrew thinks in dollars;
// the database thinks in cents; `parseCents` is the one boundary where that conversion happens.
//
// The running total updates as he types, computed by the SAME function the server uses. If the two
// ever disagreed, the number he approved and the number the client is charged would differ — so they
// are deliberately not two implementations.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { computeInvoiceTotals, formatCents, parseCents, parseQuantity } from '@/lib/voice/money';
import { BASE_PATH } from '@/lib/voice/content';

interface Client {
  id: string;
  name: string;
  company: string | null;
}

interface Row {
  description: string;
  qty: string;
  unit: string;
}

export default function NewInvoiceButton({ clients }: { clients: Client[] }): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const [rows, setRows] = useState<Row[]>([{ description: '', qty: '1', unit: '' }]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(
    () =>
      rows
        .filter((r) => r.description.trim() || r.unit.trim())
        .map((r) => ({
          description: r.description,
          quantity: parseQuantity(r.qty || '1'),
          unitCents: parseCents(r.unit || '0'),
        })),
    [rows],
  );

  const totals = useMemo(() => computeInvoiceTotals(items), [items]);

  async function create(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!clientId) {
      setError('Choose a client.');
      return;
    }
    if (items.length === 0) {
      setError('Add at least one line.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/voice/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, title, lineItems: items, notes }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not create that invoice.');
      router.push(`${BASE_PATH}/studio/invoices/${body.invoice.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that invoice.');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="vaBtn vaBtnSolid vaBtnSm"
        onClick={() => setOpen(true)}
        disabled={clients.length === 0}
        title={clients.length === 0 ? 'Add a client first' : undefined}
      >
        <Plus size={14} aria-hidden /> New invoice
      </button>
    );
  }

  return (
    <form onSubmit={create} className="vaPanel" style={{ marginBottom: 0, width: 'min(100%, 560px)' }}>
      {error && (
        <div className="vaNotice vaNoticeBad" role="alert">
          {error}
        </div>
      )}

      <div className="vaField">
        <label className="vaLabel" htmlFor="va-inv-client">Client</label>
        <select id="va-inv-client" className="vaSelect" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
          <option value="">Choose…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.company ? ` — ${c.company}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="vaField">
        <label className="vaLabel" htmlFor="va-inv-title">What is it for?</label>
        <input
          id="va-inv-title"
          className="vaInput"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Phone system — greeting and menu prompts"
        />
      </div>

      <p className="vaLabel" style={{ marginTop: 6 }}>Lines</p>
      {rows.map((row, i) => (
        <div key={i} className="vaLineRow">
          <input
            className="vaInput"
            placeholder="Description"
            value={row.description}
            onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, description: e.target.value } : r)))}
          />
          <input
            className="vaInput"
            inputMode="decimal"
            placeholder="Qty"
            value={row.qty}
            onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, qty: e.target.value } : r)))}
          />
          <input
            className="vaInput"
            inputMode="decimal"
            placeholder="$ each"
            value={row.unit}
            onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, unit: e.target.value } : r)))}
          />
          <button
            type="button"
            onClick={() => setRows(rows.length === 1 ? [{ description: '', qty: '1', unit: '' }] : rows.filter((_, j) => j !== i))}
            aria-label="Remove line"
            className="vaLineRemove"
          >
            <Trash2 size={13} aria-hidden />
          </button>
        </div>
      ))}

      <button
        type="button"
        className="vaBtn vaBtnGhost vaBtnSm"
        onClick={() => setRows([...rows, { description: '', qty: '1', unit: '' }])}
      >
        <Plus size={13} aria-hidden /> Add a line
      </button>

      <div className="vaInvoiceTotal">
        <span>Total</span>
        <strong>{formatCents(totals.totalCents)}</strong>
      </div>

      <div className="vaField" style={{ marginTop: 14 }}>
        <label className="vaLabel" htmlFor="va-inv-notes">Notes for the client (optional)</label>
        <textarea
          id="va-inv-notes"
          className="vaTextarea"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Thanks — payable within 14 days. Bank details on the payment page."
        />
      </div>

      <div className="vaStudioActions">
        <button type="submit" className="vaBtn vaBtnSolid vaBtnSm" disabled={busy}>
          {busy ? <Loader2 size={14} aria-hidden className="vaSpin" /> : null}
          Create as draft
        </button>
        <button type="button" className="vaBtn vaBtnGhost vaBtnSm" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
