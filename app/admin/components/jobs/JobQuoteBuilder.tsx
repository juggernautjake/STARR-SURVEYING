// app/admin/components/jobs/JobQuoteBuilder.tsx — Quote creation and display
'use client';

import { useState, useEffect } from 'react';
import { withAlpha } from '@/lib/admin/color-alpha';

interface Payment {
  id: string;
  amount: number;
  payment_type: string;
  payment_method?: string;
  reference_number?: string;
  notes?: string;
  paid_at: string;
  recorded_by: string;
}

interface Props {
  quoteAmount?: number;
  finalAmount?: number;
  amountPaid?: number;
  paymentStatus?: string;
  payments: Payment[];
  onUpdateQuote?: (amount: number) => void;
  onAddPayment?: (payment: { amount: number; payment_type: string; payment_method: string; reference_number: string; notes: string }) => void;
  editable?: boolean;
}

export default function JobQuoteBuilder({ quoteAmount, finalAmount, amountPaid, paymentStatus, payments, onUpdateQuote, onAddPayment, editable }: Props) {
  const owed = (finalAmount || quoteAmount || 0) - (amountPaid || 0);
  // job-editing 2026-05-30 — quote becomes click-to-edit. Open state +
  // draft value live here so the user can correct a typo without
  // committing. Resets when the prop changes (e.g., parent saved a
  // fresh value).
  const [editingQuote, setEditingQuote] = useState(false);
  const [quoteDraft, setQuoteDraft] = useState<string>(quoteAmount?.toString() ?? '');
  useEffect(() => {
    setQuoteDraft(quoteAmount?.toString() ?? '');
  }, [quoteAmount]);

  function commitQuote() {
    if (!onUpdateQuote) return;
    const val = parseFloat(quoteDraft);
    if (Number.isFinite(val) && val >= 0) {
      onUpdateQuote(val);
      setEditingQuote(false);
    }
  }
  function cancelQuote() {
    setQuoteDraft(quoteAmount?.toString() ?? '');
    setEditingQuote(false);
  }
  const statusColors: Record<string, string> = {
    unpaid: 'var(--color-error)',
    partial: '#F59E0B',
    paid: '#10B981',
    waived: '#6B7280',
  };

  return (
    <div className="job-quote">
      <div className="job-quote__header">
        <h3 className="job-quote__title">Financial Summary</h3>
        <span
          className="job-quote__status"
          style={{ background: withAlpha(statusColors[paymentStatus || 'unpaid'] || '#6B7280', 12.55), color: statusColors[paymentStatus || 'unpaid'] }}
        >
          {paymentStatus === 'paid' ? '✅ Paid' :
           paymentStatus === 'partial' ? '⏳ Partial' :
           paymentStatus === 'waived' ? '🚫 Waived' : '💰 Unpaid'}
        </span>
      </div>

      <div className="job-quote__amounts">
        <div className="job-quote__amount-item">
          <span className="job-quote__amount-label">Quote</span>
          {editable && onUpdateQuote && editingQuote ? (
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>$</span>
              <input
                autoFocus
                type="number"
                step="0.01"
                min="0"
                value={quoteDraft}
                onChange={(e) => setQuoteDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitQuote(); }
                  if (e.key === 'Escape') { e.preventDefault(); cancelQuote(); }
                }}
                onBlur={commitQuote}
                aria-label="Quote amount"
                className="job-quote__input"
                style={{ width: 120 }}
              />
            </span>
          ) : (
            <span
              className="job-quote__amount-value"
              onClick={editable && onUpdateQuote ? () => setEditingQuote(true) : undefined}
              role={editable && onUpdateQuote ? 'button' : undefined}
              tabIndex={editable && onUpdateQuote ? 0 : undefined}
              onKeyDown={editable && onUpdateQuote ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditingQuote(true); }
              } : undefined}
              title={editable && onUpdateQuote ? 'Click to edit the quote' : undefined}
              style={editable && onUpdateQuote ? { cursor: 'pointer' } : undefined}
            >
              ${(quoteAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              {editable && onUpdateQuote && (
                <span style={{ marginLeft: 6, fontSize: '0.7em', color: 'var(--color-text-muted)' }}>✏️</span>
              )}
            </span>
          )}
        </div>
        {finalAmount && finalAmount !== quoteAmount && (
          <div className="job-quote__amount-item">
            <span className="job-quote__amount-label">Final Amount</span>
            <span className="job-quote__amount-value">${finalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>
        )}
        <div className="job-quote__amount-item">
          <span className="job-quote__amount-label">Paid</span>
          <span className="job-quote__amount-value job-quote__amount-value--paid">${(amountPaid || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
        </div>
        {owed > 0 && (
          <div className="job-quote__amount-item job-quote__amount-item--owed">
            <span className="job-quote__amount-label">Balance Due</span>
            <span className="job-quote__amount-value job-quote__amount-value--owed">${owed.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>
        )}
      </div>

      {payments.length > 0 && (
        <div className="job-quote__payments">
          <h4 className="job-quote__payments-title">Payment History</h4>
          {payments.map(p => (
            <div key={p.id} className="job-quote__payment">
              <div className="job-quote__payment-info">
                <span className="job-quote__payment-type">
                  {p.payment_type === 'refund' ? '↩️' : p.payment_type === 'deposit' ? '💵' : '💳'}
                  {' '}{p.payment_type.charAt(0).toUpperCase() + p.payment_type.slice(1)}
                </span>
                <span className="job-quote__payment-date">{new Date(p.paid_at).toLocaleDateString()}</span>
              </div>
              <span className={`job-quote__payment-amount ${p.payment_type === 'refund' ? 'job-quote__payment-amount--refund' : ''}`}>
                {p.payment_type === 'refund' ? '-' : '+'}${p.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Quote is set via the inline click-to-edit on the Quote
          amount above — works for the initial entry AND for changes
          afterward. job-editing 2026-05-30. */}
    </div>
  );
}
