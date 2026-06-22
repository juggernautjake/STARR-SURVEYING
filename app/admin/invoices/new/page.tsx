'use client';

// app/admin/invoices/new/page.tsx
//
// P3b of payment-infrastructure-2026-06-18.md — office composer.
// Type the customer + line items, hit "Create + send" → POST
// /api/admin/invoices, then POST /api/admin/invoices/<id>/send. The
// customer gets an email with a payment link that routes to
// /pay/<slug>.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { computeInvoiceTotals, lineItemTotal } from '@/lib/payments/invoice-number';
import { formatDollars } from '@/lib/payments/live';
import { resolveDepositAmountCents, type DepositType } from '@/lib/payments/upfront-rule';
import '../../payments-admin.css';

interface LineItemDraft {
  description: string;
  quantity: number;
  unit_price_cents: number;
}

// invoice-composer-job-picker-2026-06-22 — minimal subset of jobs the
// typeahead needs to render results + commit a job_id.
interface JobOption {
  id: string;
  job_number: string;
  name: string;
  client_name: string | null;
}

const EMPTY_ROW: LineItemDraft = { description: '', quantity: 1, unit_price_cents: 0 };

export default function NewInvoicePage(): React.ReactElement {
  const router = useRouter();
  const [customer, setCustomer] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    billing_street: '',
    billing_city: '',
    billing_state: 'TX',
    billing_zip: '',
  });
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([{ ...EMPTY_ROW }]);
  const [taxDollars, setTaxDollars] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [notes, setNotes] = useState('');
  // invoice-composer-job-picker-2026-06-22 — link this invoice to an
  // existing job at create-time. linkedJob is the committed pick; the
  // typeahead state owns the search-as-you-type results.
  const [linkedJob, setLinkedJob] = useState<JobOption | null>(null);
  const [jobSearch, setJobSearch] = useState('');
  const [jobSearchDebounced, setJobSearchDebounced] = useState('');
  const [jobOptions, setJobOptions] = useState<JobOption[]>([]);
  const [jobSearching, setJobSearching] = useState(false);
  const [jobDropdownOpen, setJobDropdownOpen] = useState(false);
  const jobDropdownRef = useRef<HTMLDivElement>(null);
  // S5 — required upfront / deposit. 'none' = customer may pay any amount.
  const [depositType, setDepositType] = useState<DepositType>('none');
  const [depositValueStr, setDepositValueStr] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    invoice_number: string;
    pay_link: string;
    recipient: string;
    sent: boolean;
    send_error: string | null;
  } | null>(null);

  const totals = useMemo(() => {
    const taxCents = Math.round((parseFloat(taxDollars) || 0) * 100);
    const rows = lineItems
      .filter((r) => r.description.trim().length > 0)
      .map((r) => ({ total_cents: lineItemTotal(r.quantity, r.unit_price_cents) }));
    return computeInvoiceTotals(rows, taxCents);
  }, [lineItems, taxDollars]);

  const depositValue = parseFloat(depositValueStr) || 0;
  const depositPreviewCents = resolveDepositAmountCents({
    deposit_type: depositType,
    deposit_value: depositValue,
    total_cents: totals.total_cents,
  });

  // invoice-composer-job-picker-2026-06-22 — debounce the search input
  // so we don't fire a fetch on every keystroke. 220ms feels snappy
  // without flooding the API.
  useEffect(() => {
    const t = window.setTimeout(() => setJobSearchDebounced(jobSearch), 220);
    return () => window.clearTimeout(t);
  }, [jobSearch]);

  // Fetch matching jobs whenever the debounced query changes (and is
  // long enough to be useful). Hits the existing /api/admin/jobs GET
  // which already supports ?search=… across name / job_number /
  // client_name / address.
  useEffect(() => {
    const q = jobSearchDebounced.trim();
    if (q.length < 2) { setJobOptions([]); return; }
    let cancelled = false;
    setJobSearching(true);
    fetch(`/api/admin/jobs?search=${encodeURIComponent(q)}&limit=8`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => {
        if (cancelled) return;
        const rows = ((j.jobs ?? []) as Array<{
          id: string; job_number: string; name: string; client_name: string | null;
        }>).map((r) => ({
          id: r.id,
          job_number: r.job_number,
          name: r.name,
          client_name: r.client_name,
        }));
        setJobOptions(rows);
      })
      .catch(() => { if (!cancelled) setJobOptions([]); })
      .finally(() => { if (!cancelled) setJobSearching(false); });
    return () => { cancelled = true; };
  }, [jobSearchDebounced]);

  // Click-outside closes the dropdown so the user can click anywhere
  // to dismiss.
  useEffect(() => {
    if (!jobDropdownOpen) return;
    function onClick(e: MouseEvent) {
      if (jobDropdownRef.current && !jobDropdownRef.current.contains(e.target as Node)) {
        setJobDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [jobDropdownOpen]);

  function pickJob(job: JobOption) {
    setLinkedJob(job);
    setJobSearch('');
    setJobDropdownOpen(false);
    setJobOptions([]);
    // Auto-fill the customer name from the job's client_name if the
    // composer doesn't have one yet (don't clobber what the user
    // already typed).
    if (!customer.customer_name.trim() && job.client_name) {
      setCustomer((c) => ({ ...c, customer_name: job.client_name ?? '' }));
    }
  }
  function clearJob() { setLinkedJob(null); }

  function setRow(i: number, patch: Partial<LineItemDraft>) {
    setLineItems((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() { setLineItems((rows) => [...rows, { ...EMPTY_ROW }]); }
  function removeRow(i: number) {
    setLineItems((rows) => (rows.length === 1 ? rows : rows.filter((_, idx) => idx !== i)));
  }

  async function onCreateAndSend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const populatedRows = lineItems.filter((r) => r.description.trim().length > 0);
    if (populatedRows.length === 0) {
      setError('Please add at least one line item.');
      return;
    }
    if (!customer.customer_email.trim()) {
      setError('Please enter a customer email so we can send the invoice.');
      return;
    }

    setSending(true);
    const body = {
      customer_email: customer.customer_email,
      customer_name: customer.customer_name,
      customer_phone: customer.customer_phone,
      billing_address: {
        street: customer.billing_street || null,
        city: customer.billing_city || null,
        state: customer.billing_state || null,
        zip: customer.billing_zip || null,
      },
      line_items: populatedRows.map((r) => ({
        description: r.description.trim(),
        quantity: r.quantity,
        unit_price_cents: r.unit_price_cents,
        total_cents: lineItemTotal(r.quantity, r.unit_price_cents),
      })),
      tax_cents: Math.round((parseFloat(taxDollars) || 0) * 100),
      deposit_type: depositType,
      deposit_value: depositType === 'none' ? null : depositValue,
      due_at: dueAt || null,
      notes: notes || null,
      // invoice-composer-job-picker-2026-06-22 — wire the picked job
      // through to the API so the dashboard's job badge lights up.
      job_id: linkedJob?.id ?? null,
    };

    const createRes = await fetch('/api/admin/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!createRes.ok) {
      setSending(false);
      setError((await createRes.json().catch(() => ({}))).error ?? 'Failed to create invoice.');
      return;
    }
    const { invoice } = (await createRes.json()) as { invoice: { id: string; invoice_number: string } };

    const sendRes = await fetch(`/api/admin/invoices/${invoice.id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    setSending(false);
    if (!sendRes.ok) {
      setError((await sendRes.json().catch(() => ({}))).error ?? 'Invoice was created, but sending failed.');
      return;
    }
    const sendJson = (await sendRes.json()) as { sent: boolean; pay_link: string; recipient: string; send_error: string | null };
    setSuccess({
      invoice_number: invoice.invoice_number,
      pay_link: sendJson.pay_link,
      recipient: sendJson.recipient,
      sent: sendJson.sent,
      send_error: sendJson.send_error,
    });
  }

  if (success) {
    return (
      <main className="invoice-page" data-payments-admin data-testid="invoice-create-success">
        <div className="invoice-page__card">
          <h1 className="invoice-page__title">Invoice {success.invoice_number} ready</h1>
          <p className="invoice-page__lede">
            {success.sent
              ? `Sent to ${success.recipient}.`
              : `Saved as ${success.invoice_number} — email send did not complete.`}
          </p>
          {success.send_error && (
            <p className="invoice-page__error" data-testid="invoice-send-warning" role="alert">
              Email warning: {success.send_error}
            </p>
          )}
          <div className="invoice-page__pay-link">
            <label>Direct payment link — share it with the customer:</label>
            <a href={success.pay_link} target="_blank" rel="noreferrer" data-testid="invoice-pay-link">
              {success.pay_link}
            </a>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
              <button
                type="button"
                className="invoice-btn invoice-btn--ghost"
                data-testid="invoice-copy-link"
                onClick={() => {
                  navigator.clipboard?.writeText(success.pay_link).then(
                    () => { setLinkCopied(true); window.setTimeout(() => setLinkCopied(false), 2000); },
                    () => {},
                  );
                }}
              >
                {linkCopied ? 'Copied ✓' : 'Copy link'}
              </button>
              <a href={success.pay_link} target="_blank" rel="noreferrer" className="invoice-btn invoice-btn--ghost">
                Open customer page
              </a>
            </div>
          </div>
          <div className="invoice-page__actions">
            <button
              type="button"
              className="invoice-btn invoice-btn--ghost"
              onClick={() => { setSuccess(null); setLineItems([{ ...EMPTY_ROW }]); setNotes(''); setTaxDollars(''); setDepositType('none'); setDepositValueStr(''); }}
            >
              Create another
            </button>
            <Link href="/admin/invoicing" className="invoice-btn">
              All invoices
            </Link>
          </div>
        </div>
        <style jsx>{styles}</style>
      </main>
    );
  }

  return (
    <main className="invoice-page" data-payments-admin data-testid="invoice-create-page">
      <form className="invoice-page__card" onSubmit={onCreateAndSend}>
        <h1 className="invoice-page__title">Create + send invoice</h1>
        <p className="invoice-page__lede">
          The customer gets an email with a one-click payment link.
        </p>

        {/* invoice-composer-job-picker-2026-06-22 — pick an existing
            job to link this invoice to. Typeahead hits /api/admin/jobs.
            Picked jobs show as a pill that can be cleared with ✕. The
            customer-name field auto-fills from the job's client_name
            on pick, but doesn't clobber if you've already typed. */}
        <section className="invoice-section">
          <h2 className="invoice-section__title">Linked job (optional)</h2>
          {linkedJob ? (
            <div className="invoice-job-picker__pill" data-testid="invoice-linked-job">
              <span className="invoice-job-picker__pill-number">{linkedJob.job_number}</span>
              <span className="invoice-job-picker__pill-name">{linkedJob.name}</span>
              {linkedJob.client_name && (
                <span className="invoice-job-picker__pill-client">· {linkedJob.client_name}</span>
              )}
              <button
                type="button"
                className="invoice-job-picker__clear"
                onClick={clearJob}
                aria-label="Unlink this job"
                title="Unlink this job"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="invoice-job-picker" ref={jobDropdownRef}>
              <input
                type="search"
                value={jobSearch}
                onChange={(e) => { setJobSearch(e.target.value); setJobDropdownOpen(true); }}
                onFocus={() => setJobDropdownOpen(true)}
                placeholder="Search by job number, name, client, or address…"
                className="invoice-job-picker__input"
                autoComplete="off"
                data-testid="invoice-job-search"
              />
              {jobDropdownOpen && jobSearchDebounced.trim().length >= 2 && (
                <div className="invoice-job-picker__dropdown" role="listbox">
                  {jobSearching && jobOptions.length === 0 && (
                    <div className="invoice-job-picker__hint">Searching…</div>
                  )}
                  {!jobSearching && jobOptions.length === 0 && (
                    <div className="invoice-job-picker__hint">No jobs match &ldquo;{jobSearchDebounced}&rdquo;.</div>
                  )}
                  {jobOptions.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      className="invoice-job-picker__option"
                      onClick={() => pickJob(job)}
                      role="option"
                      aria-selected={false}
                    >
                      <span className="invoice-job-picker__option-number">{job.job_number}</span>
                      <span className="invoice-job-picker__option-name">{job.name}</span>
                      {job.client_name && (
                        <span className="invoice-job-picker__option-client">{job.client_name}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              <p className="invoice-job-picker__hint" style={{ marginTop: '0.4rem' }}>
                Linking an invoice to a job lets the dashboard surface them together. Leave blank if this is a standalone invoice.
              </p>
            </div>
          )}
        </section>

        <section className="invoice-section">
          <h2 className="invoice-section__title">Customer</h2>
          <div className="invoice-row">
            <label>
              <span>Name</span>
              <input
                value={customer.customer_name}
                onChange={(e) => setCustomer({ ...customer, customer_name: e.target.value })}
                placeholder="Mary Smith"
              />
            </label>
            <label>
              <span>Email *</span>
              <input
                type="email"
                required
                value={customer.customer_email}
                onChange={(e) => setCustomer({ ...customer, customer_email: e.target.value })}
                placeholder="mary@example.com"
                data-testid="invoice-customer-email"
              />
            </label>
            <label>
              <span>Phone</span>
              <input
                value={customer.customer_phone}
                onChange={(e) => setCustomer({ ...customer, customer_phone: e.target.value })}
                placeholder="(555) 555-1234"
              />
            </label>
          </div>
          <div className="invoice-row">
            <label>
              <span>Street</span>
              <input
                value={customer.billing_street}
                onChange={(e) => setCustomer({ ...customer, billing_street: e.target.value })}
                placeholder="123 Main St"
              />
            </label>
            <label>
              <span>City</span>
              <input
                value={customer.billing_city}
                onChange={(e) => setCustomer({ ...customer, billing_city: e.target.value })}
              />
            </label>
            <label className="invoice-row__small">
              <span>State</span>
              <input
                value={customer.billing_state}
                onChange={(e) => setCustomer({ ...customer, billing_state: e.target.value })}
              />
            </label>
            <label className="invoice-row__small">
              <span>ZIP</span>
              <input
                value={customer.billing_zip}
                onChange={(e) => setCustomer({ ...customer, billing_zip: e.target.value })}
              />
            </label>
          </div>
        </section>

        <section className="invoice-section">
          <h2 className="invoice-section__title">Line items</h2>
          <div className="invoice-items">
            <div className="invoice-items__head">
              <span>Description</span>
              <span>Qty</span>
              <span>Unit ($)</span>
              <span>Total</span>
              <span />
            </div>
            {lineItems.map((row, i) => (
              <div className="invoice-items__row" key={i} data-testid={`invoice-line-${i}`}>
                <input
                  value={row.description}
                  onChange={(e) => setRow(i, { description: e.target.value })}
                  placeholder="Boundary survey"
                  data-testid={`invoice-line-desc-${i}`}
                />
                <input
                  type="number"
                  min={1}
                  value={row.quantity}
                  onChange={(e) => setRow(i, { quantity: parseFloat(e.target.value) || 0 })}
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={(row.unit_price_cents / 100).toString()}
                  onChange={(e) => setRow(i, { unit_price_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })}
                />
                <span className="invoice-items__total">{formatDollars(lineItemTotal(row.quantity, row.unit_price_cents))}</span>
                <button
                  type="button"
                  className="invoice-items__remove"
                  onClick={() => removeRow(i)}
                  disabled={lineItems.length === 1}
                  aria-label="Remove line item"
                >
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="invoice-btn invoice-btn--ghost" onClick={addRow} data-testid="invoice-add-row">
              + Add line item
            </button>
          </div>
        </section>

        <section className="invoice-section invoice-section--totals">
          <label className="invoice-row__small">
            <span>Tax ($)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={taxDollars}
              onChange={(e) => setTaxDollars(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <label>
            <span>Due date</span>
            <input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </label>
          <label className="invoice-section__notes">
            <span>Notes for the customer (optional)</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Thanks for choosing Starr Surveying!"
            />
          </label>
        </section>

        <section className="invoice-section">
          <h2 className="invoice-section__title">Required upfront payment</h2>
          <p className="invoice-page__lede" style={{ marginBottom: '0.75rem' }}>
            How much the customer must pay on their first payment. Leave as
            &ldquo;None&rdquo; to let them pay any amount up to the total.
          </p>
          <div className="invoice-section--totals">
            <label>
              <span>Upfront type</span>
              <select
                value={depositType}
                onChange={(e) => setDepositType(e.target.value as DepositType)}
                data-testid="invoice-deposit-type"
                style={{ font: 'inherit', padding: '0.55rem 0.7rem', border: '1px solid #d6d9e3', borderRadius: 8 }}
              >
                <option value="none">None (any amount)</option>
                <option value="percent">Percentage of total</option>
                <option value="fixed">Fixed dollar amount</option>
              </select>
            </label>
            {depositType !== 'none' && (
              <label className="invoice-row__small">
                <span>{depositType === 'percent' ? 'Percent (%)' : 'Amount ($)'}</span>
                <input
                  type="number"
                  min={0}
                  step={depositType === 'percent' ? '1' : '0.01'}
                  value={depositValueStr}
                  onChange={(e) => setDepositValueStr(e.target.value)}
                  placeholder={depositType === 'percent' ? '25' : '500.00'}
                  data-testid="invoice-deposit-value"
                />
              </label>
            )}
            {depositType !== 'none' && (
              <div style={{ alignSelf: 'end', color: '#4a5470', fontSize: '0.9rem' }} data-testid="invoice-deposit-preview">
                Upfront required: <strong>{formatDollars(depositPreviewCents)}</strong>
              </div>
            )}
          </div>
        </section>

        <section className="invoice-totals" data-testid="invoice-totals">
          <div><span>Subtotal</span><strong>{formatDollars(totals.subtotal_cents)}</strong></div>
          {totals.tax_cents > 0 && <div><span>Tax</span><strong>{formatDollars(totals.tax_cents)}</strong></div>}
          {depositPreviewCents > 0 && <div><span>Upfront</span><strong>{formatDollars(depositPreviewCents)}</strong></div>}
          <div className="invoice-totals__total"><span>Total</span><strong>{formatDollars(totals.total_cents)}</strong></div>
        </section>

        {error && <p className="invoice-page__error" data-testid="invoice-create-error" role="alert">{error}</p>}

        <div className="invoice-page__actions">
          <button
            type="button"
            className="invoice-btn invoice-btn--ghost"
            onClick={() => router.back()}
            disabled={sending}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="invoice-btn"
            disabled={sending}
            data-testid="invoice-create-submit"
          >
            {sending ? 'Sending…' : 'Create + send invoice'}
          </button>
        </div>
      </form>
      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .invoice-page {
    font-family: 'Inter', sans-serif;
    background: #f4f5f9;
    min-height: 100vh;
    padding: 2rem 1rem 4rem;
    color: #152050;
  }
  .invoice-page__card {
    max-width: 880px;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 14px;
    border: 1px solid #e4e7ee;
    padding: 2rem;
    box-shadow: 0 6px 20px rgba(21, 32, 80, 0.06);
  }
  .invoice-page__title {
    font-family: 'Sora', 'Inter', sans-serif;
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0 0 0.25rem;
  }
  .invoice-page__lede {
    color: #4a5470;
    margin: 0 0 1.5rem;
  }
  .invoice-section { margin-bottom: 1.5rem; padding-top: 1rem; border-top: 1px solid #e4e7ee; }
  .invoice-section__title { font-family: 'Sora', sans-serif; font-size: 1.05rem; margin: 0 0 0.75rem; }
  .invoice-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem; }
  .invoice-row label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; color: #4a5470; }
  .invoice-row input, .invoice-row textarea { font: inherit; padding: 0.55rem 0.7rem; border: 1px solid #d6d9e3; border-radius: 8px; }
  .invoice-row input:focus, .invoice-row textarea:focus { outline: 2px solid rgba(29, 48, 149, 0.25); border-color: #1D3095; }
  .invoice-row__small { max-width: 8rem; }
  .invoice-items__head, .invoice-items__row {
    display: grid;
    grid-template-columns: 2.5fr 0.6fr 0.8fr 0.8fr 0.4fr;
    gap: 0.5rem;
    align-items: center;
    padding: 0.4rem 0;
  }
  .invoice-items__head { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; border-bottom: 1px solid #e4e7ee; }
  .invoice-items__row input { font: inherit; padding: 0.5rem 0.65rem; border: 1px solid #d6d9e3; border-radius: 8px; }
  .invoice-items__total { text-align: right; font-weight: 600; }
  .invoice-items__remove { width: 32px; height: 32px; border-radius: 8px; border: 1px solid #d6d9e3; background: #fafbfd; cursor: pointer; }
  .invoice-items__remove:disabled { opacity: 0.4; cursor: not-allowed; }
  .invoice-section--totals { display: grid; grid-template-columns: 8rem 1fr 1fr; gap: 0.75rem; }
  .invoice-section__notes { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 0.25rem; }
  .invoice-section__notes textarea { font: inherit; padding: 0.55rem 0.7rem; border: 1px solid #d6d9e3; border-radius: 8px; }
  .invoice-totals { display: flex; justify-content: flex-end; gap: 2rem; padding: 1rem 0; border-top: 2px solid #152050; }
  .invoice-totals > div { display: flex; gap: 1rem; align-items: baseline; }
  .invoice-totals__total strong { color: #BD1218; font-family: 'Sora', sans-serif; font-size: 1.2rem; }
  .invoice-page__actions { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.5rem; }
  .invoice-btn {
    font: inherit; font-weight: 700; padding: 0.7rem 1.4rem;
    background: #BD1218; color: #fff; border: none; border-radius: 10px; cursor: pointer;
    text-decoration: none; display: inline-block;
  }
  .invoice-btn:hover:not(:disabled) { background: #9c0e13; }
  .invoice-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .invoice-btn--ghost { background: transparent; color: #1D3095; border: 1px solid #1D3095; }
  .invoice-btn--ghost:hover:not(:disabled) { background: rgba(29, 48, 149, 0.06); }
  .invoice-page__error {
    background: #fdecec; color: #8a0e13;
    padding: 0.65rem 0.85rem; border-radius: 8px; margin-top: 1rem;
  }
  .invoice-page__pay-link {
    margin-top: 1.25rem; padding: 1rem; background: #f4f5f9; border-radius: 10px;
    border: 1px solid #e4e7ee;
  }
  .invoice-page__pay-link label { display: block; font-size: 0.8rem; color: #6b7280; margin-bottom: 0.35rem; }
  .invoice-page__pay-link a { color: #1D3095; word-break: break-all; font-weight: 600; }
  @media (max-width: 700px) {
    .invoice-row, .invoice-section--totals { grid-template-columns: 1fr; }
    .invoice-items__head { display: none; }
    .invoice-items__row { grid-template-columns: 1fr; }
    .invoice-items__total { text-align: left; }
  }
`;
