// app/admin/receipts/ReceiptSlideshow.tsx — slices V1, V3, V4, V5, V6 of
// docs/planning/completed/RECEIPT_REVIEW_SLIDESHOW_2026-08-14.md
//
// Owner, 2026-08-14: *"instead of having to go down and individually click each receipt to open it,
// (which we can also do), we will have it where we get a slide show element that shows the receipt
// image enlarged on the left, and then all of the receipt summary and options and results on the
// right for pc, and then just the image on top of the summary and AI results on mobile. But we will
// have right and left arrows that allow us to scroll through them."*
//
// ── IT IS A VIEW OF THE SET YOU ALREADY CHOSE ───────────────────────────────────────────────────
//
// The arrows move within the list's current filter, in the order shown. Closing returns you to that
// list unchanged. The existing expand-in-place row is untouched — the owner asked for that path to
// keep working ("which we can also do"), and a viewer that replaces it would be a regression for
// anybody who only wants to glance at one receipt.
//
// ── WHY IT IS FIXED-POSITION AND NOT NESTED IN THE ROW ──────────────────────────────────────────
//
// `styles.row` in page.tsx carries `overflow: hidden`, which has already clipped an expanded panel
// out of existence once (recorded in that file at lines 678–692). Anything that must be visible
// cannot live inside that card.
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, X, Loader2, Sparkles, Check, Ban, RotateCcw, AlertTriangle,
} from 'lucide-react';
import ReceiptImageStage from './ReceiptImageStage';
import type { AdminReceiptRow } from './receipt-types';
import {
  parseMoney, centsToInput, isoToDateTimeInput, dateTimeInputToIso, parseLast4,
  changedFields, checkTotals, isLowConfidence, confidenceFor,
  PAYMENT_METHODS, TAX_FLAGS, EXPENSE_NATURES, MONEY_FIELDS,
  type ReceiptEditable,
} from '@/lib/receipts/edit';
import { confidenceScore, reviewNeeds } from '@/lib/receipts/review-needs';
import { ReceiptLineItems } from './ReceiptLineItems';
import { ReceiptDeepRead } from './ReceiptDeepRead';
import './ReceiptSlideshow.css';

interface Props {
  /** The filtered list, in the order the queue shows it. */
  receipts: AdminReceiptRow[];
  /** Index to open on. */
  startIndex: number;
  /** A sentence naming the active filter, so the viewer says which set you are walking. */
  filterNote?: string;
  onClose: () => void;
  /** Called after any change lands, so the list behind can refresh. */
  onChanged: () => void;
  /** Saved cards, for the card picker. */
  cards?: Array<{ id: string; label: string | null; last4: string | null; brand: string | null }>;
}

const CATEGORIES = [
  'supplies', 'meals', 'fuel', 'lodging', 'equipment', 'materials',
  'travel', 'office', 'permits', 'subcontractor', 'other',
];

/** The edit fields, pulled out of a row. */
function toEditable(r: AdminReceiptRow): ReceiptEditable {
  return {
    vendor_name: r.vendor_name ?? null,
    vendor_address: r.vendor_address ?? null,
    transaction_at: r.transaction_at ?? null,
    subtotal_cents: r.subtotal_cents ?? null,
    tax_cents: r.tax_cents ?? null,
    tip_cents: r.tip_cents ?? null,
    total_cents: r.total_cents ?? null,
    payment_method: r.payment_method ?? null,
    payment_last4: r.payment_last4 ?? null,
    category: r.category ?? null,
    tax_deductible_flag: r.tax_deductible_flag ?? null,
    notes: r.notes ?? null,
    job_id: r.job_id ?? null,
    payment_card_id: r.payment_card_id ?? null,
    expense_nature: (r as { expense_nature?: string | null }).expense_nature ?? null,
    expense_nature_note: (r as { expense_nature_note?: string | null }).expense_nature_note ?? null,
  };
}

const money = (cents: number | null | undefined): string =>
  cents === null || cents === undefined ? '—' : `$${(cents / 100).toFixed(2)}`;

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch { return iso; }
};

export default function ReceiptSlideshow({
  receipts, startIndex, filterNote, onClose, onChanged, cards = [],
}: Props) {
  const [index, setIndex] = useState(() => Math.min(Math.max(0, startIndex), Math.max(0, receipts.length - 1)));
  const [draft, setDraft] = useState<ReceiptEditable | null>(null);
  const [moneyText, setMoneyText] = useState<Record<string, string>>({});
  const [moneyErrors, setMoneyErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);
  /** Fresh signed URLs, keyed by receipt id — see D3: the ones the list handed us expire in 15
   *  minutes and a review session does not. */
  const [freshUrls, setFreshUrls] = useState<Record<string, string>>({});
  const shellRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const current = receipts[index];

  // Reset the draft whenever the receipt changes.
  useEffect(() => {
    if (!current) return;
    const e = toEditable(current);
    setDraft(e);
    setMoneyText(Object.fromEntries(MONEY_FIELDS.map((f) => [f, centsToInput(e[f] as number | null)])));
    setMoneyErrors({});
    setError(null);
    setSavedAt(null);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = useMemo(
    () => (draft && current ? changedFields(toEditable(current), draft) : {}),
    [draft, current],
  );
  const dirty = Object.keys(pending).length > 0 || Object.values(moneyErrors).some(Boolean);

  const go = useCallback((delta: number) => {
    if (dirty && !window.confirm('You have unsaved changes on this receipt. Move on and lose them?')) return;
    setIndex((i) => Math.min(receipts.length - 1, Math.max(0, i + delta)));
  }, [dirty, receipts.length]);

  const close = useCallback(() => {
    if (dirty && !window.confirm('You have unsaved changes on this receipt. Close and lose them?')) return;
    onClose();
  }, [dirty, onClose]);

  // ── keyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never hijack the arrows while somebody is typing in a field — moving to the next receipt
      // mid-word is the fastest way to make a viewer infuriating.
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (typing) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, close]);

  // Focus lands inside the overlay so the keyboard works immediately and a screen reader announces
  // the dialog rather than continuing to read the list behind it.
  useEffect(() => { closeRef.current?.focus(); }, []);

  // The page behind must not scroll while a full-screen overlay is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ── pre-load the neighbours, so an arrow press is instant rather than a flash of empty frame ──
  useEffect(() => {
    for (const i of [index - 1, index + 1]) {
      const r = receipts[i];
      const url = r && (freshUrls[r.id] ?? r.photo_signed_url);
      if (url) { const img = new Image(); img.src = url; }
    }
  }, [index, receipts, freshUrls]);

  /** D3 — ask the server for a new signed URL for one receipt. */
  const refreshUrl = useCallback(async (receiptId: string) => {
    try {
      const res = await fetch(`/api/admin/receipts?limit=1&include_deleted=1&receiptId=${encodeURIComponent(receiptId)}`);
      const json = (await res.json()) as { receipts?: AdminReceiptRow[] };
      const fresh = json.receipts?.find((r) => r.id === receiptId)?.photo_signed_url;
      if (fresh) setFreshUrls((m) => ({ ...m, [receiptId]: fresh }));
    } catch { /* the stage already shows an explanation; a failed refresh changes nothing */ }
  }, []);

  const setField = <K extends keyof ReceiptEditable>(key: K, value: ReceiptEditable[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setSavedAt(null);
  };

  const setMoney = (key: keyof ReceiptEditable, text: string) => {
    setMoneyText((m) => ({ ...m, [key]: text }));
    const { cents, error: err } = parseMoney(text);
    setMoneyErrors((m) => ({ ...m, [key]: err ?? '' }));
    if (!err) setField(key, cents as ReceiptEditable[typeof key]);
  };

  const save = async () => {
    if (!current || !draft) return;
    const bad = Object.entries(moneyErrors).find(([, v]) => v);
    if (bad) { setError(`Fix ${bad[0].replace('_cents', '')} first: ${bad[1]}`); return; }
    const body = changedFields(toEditable(current), draft);
    if (Object.keys(body).length === 0) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/receipts/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `Save failed (HTTP ${res.status}).`);
      setSavedAt(Date.now());
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const decide = async (status: 'approved' | 'rejected' | 'pending') => {
    if (!current) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/receipts/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `Could not update (HTTP ${res.status}).`);
      onChanged();
      // Advancing after a decision is the whole point of a queue — but only when there is somewhere
      // to advance to, and never past the end.
      if (status !== 'pending' && index < receipts.length - 1) setIndex((i) => i + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const rerun = async () => {
    if (!current) return;
    setRerunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/receipts/${current.id}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `force`, because the whole reason to press this is that the first pass was wrong.
        body: JSON.stringify({ force: true }),
      });
      const json = (await res.json().catch(() => ({}))) as { result?: { status?: string; error?: string }; error?: string };
      if (!res.ok) throw new Error(json.error || `The AI could not be run (HTTP ${res.status}).`);
      if (json.result?.status === 'failed') setError(json.result.error || 'The AI could not read this receipt.');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRerunning(false);
    }
  };

  if (!current || !draft) return null;

  const conf = (current.ai_confidence_per_field ?? null) as Record<string, unknown> | null;
  const totals = checkTotals(draft);
  const imgUrl = freshUrls[current.id] ?? current.photo_signed_url;
  const statusKey = String(current.status ?? 'pending');

  const Field = ({ label, field, children }: { label: string; field?: string; children: React.ReactNode }) => {
    const low = field ? isLowConfidence(conf, field) : false;
    const c = field ? confidenceFor(conf, field) : null;
    return (
      <div className={`rcv__field ${low ? 'rcv__lowConf' : ''}`}>
        <span className="rcv__fieldLabel">{label}</span>
        <span className="rcv__fieldValue">
          {children}
          {low && <span className="rcv__confTag" title="The AI was not confident about this field">
            {Math.round((c ?? 0) * 100)}%
          </span>}
        </span>
      </div>
    );
  };

  return (
    <div
      className="rcv__backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Receipt ${index + 1} of ${receipts.length}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="rcv__shell" ref={shellRef}>
        <div className="rcv__bar">
          <span className="rcv__counter">{index + 1} of {receipts.length}</span>
          <span className="rcv__vendor">{current.vendor_name || '(vendor not read)'}</span>
          <span className={`rcv__chip rcv__chip--${statusKey}`}>{statusKey}</span>
          <span className="rcv__barSpacer" />
          {filterNote && <span className="rcv__filterNote" title={filterNote}>{filterNote}</span>}
          <button type="button" className="rcv__btn" onClick={close} ref={closeRef} aria-label="Close (Esc)">
            <X size={15} />Close
          </button>
        </div>

        <div className="rcv__body">
          {/* The wrapper is a CLASS, not an inline style. It began as `style={{flex:'1 1 60%'}}` and
              that quietly defeated the whole mobile layout: the wrapper is the flex child of
              `.rcv__body`, so the media query's `.rcv__stage { flex: 0 0 46vh }` applied to the
              element INSIDE it while the wrapper kept growing to fill. The stage took 61% of a
              phone screen instead of 46% and the summary was pushed most of the way off. Inline
              styles cannot be overridden by a media query — which is the whole reason this
              component has a stylesheet. */}
          <div className="rcv__stageWrap">
            <ReceiptImageStage
              src={imgUrl}
              alt={`Receipt from ${current.vendor_name ?? 'an unread vendor'}`}
              resetKey={current.id}
              onNeedsFreshUrl={() => refreshUrl(current.id)}
            />
            <button
              type="button" className="rcv__nav rcv__nav--prev"
              onClick={() => go(-1)} disabled={index === 0} aria-label="Previous receipt (left arrow)"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button" className="rcv__nav rcv__nav--next"
              onClick={() => go(1)} disabled={index >= receipts.length - 1} aria-label="Next receipt (right arrow)"
            >
              <ChevronRight size={22} />
            </button>
          </div>

          <div className="rcv__panel">
            {/* ── the answer, first ── */}
            <div className="rcv__section">
              <div className="rcv__totalRow">
                <span className="rcv__total">{money(draft.total_cents)}</span>
                <span className="rcv__muted">{fmtDate(draft.transaction_at)}</span>
              </div>

              {/* ── HOW MUCH OF THIS READING TO TRUST (owner, 2026-08-17) ──────────────────────────
                  *"generate receipt confidence scores … If the confidence score is lower than 100,
                  then the reason(s) should be simply and prominently displayed."*

                  The score is DERIVED from the reasons (see `confidenceScore`), so a number below
                  100 always has something to show. A score computed independently would land at 94
                  with an empty reason list, and the number would stop meaning anything.

                  100 renders as a single quiet line. Anything less renders the reasons, because at
                  that point the reasons are the message and the number is just the headline. */}
              {(() => {
                const score = confidenceScore(current);
                const reasons = reviewNeeds(current);
                if (score === 100) {
                  return (
                    <div className="rcv__confidence rcv__confidence--full">
                      <span className="rcv__confidenceScore">100%</span>
                      <span>confident — nothing on this receipt needs checking.</span>
                    </div>
                  );
                }
                return (
                  <div className={`rcv__confidence ${score < 60 ? 'rcv__confidence--low' : 'rcv__confidence--mid'}`}>
                    <div className="rcv__confidenceHead">
                      <span className="rcv__confidenceScore">{score}%</span>
                      <span>
                        confident — {reasons.length === 1 ? 'one thing' : `${reasons.length} things`} to check
                        against the photo:
                      </span>
                    </div>
                    <ul className="rcv__confidenceList">
                      {reasons.map((n) => (
                        <li key={n.field}>
                          <strong>{n.label}</strong> — {n.detail}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
              {totals.mismatched && (
                <div className="rcv__band rcv__band--warn" style={{ marginTop: 10 }}>
                  <AlertTriangle size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                  Subtotal + tax + tip is {money(totals.expected)}, which is {money(Math.abs(totals.differenceCents ?? 0))}{' '}
                  {(totals.differenceCents ?? 0) > 0 ? 'less than' : 'more than'} the total. Real receipts do this —
                  a discount, a service charge, a split payment — so it is a note, not a problem.
                </div>
              )}
              {current.extraction_status === 'failed' && (
                <div className="rcv__band rcv__band--error" style={{ marginTop: 10 }}>
                  The AI could not read this receipt{current.extraction_error ? `: ${current.extraction_error}` : '.'} Enter
                  the fields by hand below, or try again.
                </div>
              )}
            </div>

            {/* ── what is known ── */}
            <div className="rcv__section">
              <h4 className="rcv__sectionTitle">Extracted</h4>
              <div className="rcv__fields">
                <Field label="Vendor" field="vendor_name">{draft.vendor_name || <em className="rcv__fieldValue--empty">not read</em>}</Field>
                <Field label="Address" field="vendor_address">{draft.vendor_address || <em className="rcv__fieldValue--empty">not read</em>}</Field>
                <Field label="Subtotal" field="subtotal_cents">{money(draft.subtotal_cents)}</Field>
                <Field label="Tax" field="tax_cents">{money(draft.tax_cents)}</Field>
                <Field label="Tip" field="tip_cents">{money(draft.tip_cents)}</Field>
                <Field label="Payment" field="payment_method">
                  {draft.payment_method ?? '—'}
                  {draft.payment_last4 ? ` ···· ${draft.payment_last4}` : ''}
                </Field>
                <Field label="Card on file">
                  {current.payment_card
                    ? `${current.payment_card.label || current.payment_card.brand || 'Card'} ···· ${current.payment_card.last4 ?? ''}`
                    : <em className="rcv__fieldValue--empty">not matched</em>}
                </Field>
                <Field label="Job">
                  {current.job_number ? `${current.job_number} · ${current.job_name ?? ''}` : <em className="rcv__fieldValue--empty">none</em>}
                </Field>
                <Field label="Submitted by">{current.submitted_by_email ?? '—'}</Field>
                <Field label="Recorded">{fmtDate(current.created_at)}</Field>
              </div>
            </div>

            {/* The lines on the receipt — editable, with business/personal per item and a
                reason attached to anything added or removed. Replaces the read-only table that used
                to sit here; see ReceiptLineItems for why a removed line stays on screen. */}
            <ReceiptLineItems
              receiptId={current.id}
              receiptIsBusiness={(current as { expense_nature?: string | null }).expense_nature !== 'personal'}
              onChanged={onChanged}
            />

            {/* The thorough read, and where its independent passes disagreed. Sits directly above
                "Correct anything" on purpose: the discrepancies are the list of things to correct,
                so reading them and acting on them should not require scrolling between the two. */}
            <ReceiptDeepRead
              receiptId={current.id}
              initial={current.deep_read_at ? {
                summary: null,
                discrepancies: current.deep_discrepancies ?? [],
                transcript: current.deep_transcript ?? [],
                vendorCheck: current.deep_vendor_check,
                noteConfirmations: current.deep_note_confirmations ?? [],
                bandCount: current.deep_band_count ?? undefined,
                totalMs: current.deep_duration_ms ?? undefined,
                costCents: current.deep_cost_cents ?? undefined,
              } : null}
              onDone={onChanged}
            />

            {/* ── correct it ── */}
            <div className="rcv__section">
              <h4 className="rcv__sectionTitle">Correct anything</h4>
              <div className="rcv__editGrid rcv__editGrid--one">
                <label>
                  <span className="rcv__label">Vendor</span>
                  <input className="rcv__input" value={draft.vendor_name ?? ''}
                    onChange={(e) => setField('vendor_name', e.target.value || null)} />
                </label>
                <label>
                  <span className="rcv__label">Address</span>
                  <input className="rcv__input" value={draft.vendor_address ?? ''}
                    onChange={(e) => setField('vendor_address', e.target.value || null)} />
                </label>
              </div>

              <div className="rcv__editGrid" style={{ marginTop: 10 }}>
                {(['subtotal_cents', 'tax_cents', 'tip_cents', 'total_cents'] as const).map((f) => (
                  <label key={f}>
                    <span className="rcv__label">{f.replace('_cents', '')}</span>
                    <input
                      className="rcv__input" inputMode="decimal"
                      value={moneyText[f] ?? ''}
                      onChange={(e) => setMoney(f, e.target.value)}
                      aria-invalid={Boolean(moneyErrors[f])}
                    />
                    {moneyErrors[f] && <span className="rcv__error">{moneyErrors[f]}</span>}
                  </label>
                ))}
              </div>

              <div className="rcv__editGrid" style={{ marginTop: 10 }}>
                <label>
                  <span className="rcv__label">Purchased</span>
                  <input className="rcv__input" type="datetime-local"
                    value={isoToDateTimeInput(draft.transaction_at)}
                    onChange={(e) => setField('transaction_at', dateTimeInputToIso(e.target.value))} />
                </label>
                <label>
                  <span className="rcv__label">Category</span>
                  <select className="rcv__select" value={draft.category ?? ''}
                    onChange={(e) => setField('category', e.target.value || null)}>
                    <option value="">—</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label>
                  <span className="rcv__label">Paid by</span>
                  <select className="rcv__select" value={draft.payment_method ?? ''}
                    onChange={(e) => setField('payment_method', e.target.value || null)}>
                    <option value="">—</option>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <label>
                  <span className="rcv__label">Card last 4</span>
                  <input className="rcv__input" inputMode="numeric" value={draft.payment_last4 ?? ''}
                    onChange={(e) => setField('payment_last4', parseLast4(e.target.value))} />
                </label>
                <label>
                  <span className="rcv__label">Card on file</span>
                  <select className="rcv__select" value={draft.payment_card_id ?? ''}
                    onChange={(e) => setField('payment_card_id', e.target.value || null)}>
                    <option value="">—</option>
                    {cards.map((c) => (
                      <option key={c.id} value={c.id}>
                        {(c.label || c.brand || 'Card')} ···· {c.last4 ?? ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="rcv__label">Tax treatment</span>
                  <select className="rcv__select" value={draft.tax_deductible_flag ?? ''}
                    onChange={(e) => setField('tax_deductible_flag', e.target.value || null)}>
                    <option value="">—</option>
                    {TAX_FLAGS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label>
                  <span className="rcv__label">Whose money</span>
                  <select className="rcv__select" value={draft.expense_nature ?? ''}
                    onChange={(e) => setField('expense_nature', e.target.value || null)}>
                    <option value="">—</option>
                    {EXPENSE_NATURES.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>

              <label style={{ display: 'block', marginTop: 10 }}>
                <span className="rcv__label">Notes</span>
                <textarea className="rcv__textarea" value={draft.notes ?? ''}
                  onChange={(e) => setField('notes', e.target.value || null)} />
              </label>

              {error && <p className="rcv__error" role="alert">{error}</p>}

              {(dirty || savedAt) && (
                <div className="rcv__dirtyBar">
                  <button type="button" className="rcv__btn rcv__btn--primary" disabled={saving || !dirty} onClick={() => void save()}>
                    {saving ? <Loader2 size={14} className="rcv__spin" /> : <Check size={14} />}
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                  {dirty && (
                    <button type="button" className="rcv__btn" disabled={saving}
                      onClick={() => { const e = toEditable(current); setDraft(e); setMoneyText(Object.fromEntries(MONEY_FIELDS.map((f) => [f, centsToInput(e[f] as number | null)]))); setMoneyErrors({}); }}>
                      <RotateCcw size={14} />Discard
                    </button>
                  )}
                  {!dirty && savedAt && <span className="rcv__saved"><Check size={13} /> Saved</span>}
                </div>
              )}
            </div>

            {/* ── decide ── */}
            <div className="rcv__section">
              <h4 className="rcv__sectionTitle">Decide</h4>
              <div className="rcv__btnRow">
                {statusKey !== 'approved' && (
                  <button type="button" className="rcv__btn rcv__btn--approve" disabled={saving} onClick={() => void decide('approved')}>
                    <Check size={14} />Approve
                  </button>
                )}
                {statusKey !== 'rejected' && (
                  <button type="button" className="rcv__btn rcv__btn--danger" disabled={saving} onClick={() => void decide('rejected')}>
                    <Ban size={14} />Reject
                  </button>
                )}
                {statusKey !== 'pending' && (
                  <button type="button" className="rcv__btn" disabled={saving} onClick={() => void decide('pending')}>
                    Reopen
                  </button>
                )}
                <button type="button" className="rcv__btn" disabled={rerunning} onClick={() => void rerun()}>
                  {rerunning ? <Loader2 size={14} className="rcv__spin" /> : <Sparkles size={14} />}
                  {rerunning ? 'Reading…' : 'Run the AI again'}
                </button>
              </div>
              <p className="rcv__muted" style={{ marginTop: 8 }}>
                Approving moves you to the next receipt. Running the AI again re-reads the photo and
                overwrites what it finds — your saved corrections to a field it does not return are kept.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
