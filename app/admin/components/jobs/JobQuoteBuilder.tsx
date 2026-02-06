// app/admin/components/jobs/JobQuoteBuilder.tsx — Quote creation and display
'use client';

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
  const statusColors: Record<string, string> = {
    unpaid: '#EF4444',
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
          style={{ background: (statusColors[paymentStatus || 'unpaid'] || '#6B7280') + '20', color: statusColors[paymentStatus || 'unpaid'] }}
        >
          {paymentStatus === 'paid' ? '✅ Paid' :
           paymentStatus === 'partial' ? '⏳ Partial' :
           paymentStatus === 'waived' ? '🚫 Waived' : '💰 Unpaid'}
        </span>
      </div>

      <div className="job-quote__amounts">
        <div className="job-quote__amount-item">
          <span className="job-quote__amount-label">Quote</span>
          <span className="job-quote__amount-value">${(quoteAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
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

      {editable && onUpdateQuote && !quoteAmount && (
        <div className="job-quote__set-quote">
          <input
            type="number"
            className="job-quote__input"
            placeholder="Enter quote amount"
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const val = parseFloat((e.target as HTMLInputElement).value);
                if (val > 0) onUpdateQuote(val);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
