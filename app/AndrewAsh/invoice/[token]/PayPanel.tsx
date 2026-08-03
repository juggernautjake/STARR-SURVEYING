'use client';
// app/AndrewAsh/invoice/[token]/PayPanel.tsx — the part that takes money.
//
// ── ONE METHOD IS OPEN AT A TIME, AND CARD IS NOT SPECIAL ───────────────────────────────────────
//
// The options are a list, and card sits in it as a peer rather than above it as a primary button with
// "other ways to pay" collapsed underneath. A client who intends to send a bank transfer should not
// have to scroll past a card form to find out they can; and when card is not configured at all, the
// page has no hole in it, because nothing was arranged around the assumption it would be there.
//
// ── "I'VE SENT IT" IS A CLAIM, AND SAYS SO ──────────────────────────────────────────────────────
//
// The offline flow ends in a button that tells Andrew money is coming. The wording is careful in both
// directions: the client is told it is a heads-up and not a receipt, and the studio row it creates is
// pending rather than paid. Every version of this that says "Thanks, you're all paid up!" teaches the
// client the invoice is closed and teaches Andrew to trust it.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Banknote,
  Building2,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  Loader2,
  Mail,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';

import VoiceCardForm from './VoiceCardForm';
import { buildPaymentDeepLink, type PaymentMethod } from '@/lib/voice/payments';
import { formatCents } from '@/lib/voice/money';

// Distinct glyphs per method. Three identical building icons in a vertical list read as one repeated
// thing rather than three choices, which is the opposite of what a picker is for.
const ICONS: Record<string, LucideIcon> = {
  zelle: Building2,
  venmo: Smartphone,
  cashapp: Smartphone,
  paypal: Smartphone,
  check: Mail,
  cash: Banknote,
  other: Building2,
};

interface Props {
  token: string;
  balanceCents: number;
  invoiceNumber: string;
  payeeEmail: string | null;
  methods: PaymentMethod[];
  stripe: { publishableKey: string } | null;
  note: string | null;
}

export default function PayPanel({
  token,
  balanceCents,
  invoiceNumber,
  payeeEmail,
  methods,
  stripe,
  note,
}: Props): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(stripe ? 'card' : methods[0]?.id ?? null);
  const [declaring, setDeclaring] = useState(false);
  const [declared, setDeclared] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function declare(methodId: string): Promise<void> {
    setDeclaring(true);
    setError(null);
    try {
      const res = await fetch(`/api/voice/pay/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'declare', method: methodId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That did not go through.');
      setDeclared(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through.');
    } finally {
      setDeclaring(false);
    }
  }

  async function copy(text: string, key: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setError('Could not copy — you may need to select it by hand.');
    }
  }

  if (declared) {
    return (
      <div className="vaCard" style={{ textAlign: 'center', padding: '40px 26px' }}>
        <CheckCircle2 size={34} aria-hidden style={{ color: 'var(--va-accent)', marginBottom: 14 }} />
        <h2 className="vaCardTitle" style={{ fontSize: '1.3rem' }}>Thanks — Andrew has been told.</h2>
        <p className="vaCardBody" style={{ maxWidth: '46ch', margin: '10px auto 0' }}>
          This page will keep showing a balance until the money actually lands and he confirms it. That
          is normal, and nothing more is needed from you.
        </p>
      </div>
    );
  }

  const nothingConfigured = !stripe && methods.length === 0;

  return (
    <div className="vaPayPanel">
      <div className="vaPayHead">
        <span className="vaPayHeadLabel">Amount due</span>
        <span className="vaPayHeadAmount">{formatCents(balanceCents)}</span>
      </div>

      {note && <p className="vaPayNote">{note}</p>}

      {nothingConfigured ? (
        <p className="vaPayNote" style={{ marginBottom: 0 }}>
          Reply to the email this invoice came from and Andrew will send payment details.
          {payeeEmail && (
            <>
              {' '}Or write to <a href={`mailto:${payeeEmail}`} style={{ color: 'var(--va-accent)' }}>{payeeEmail}</a>.
            </>
          )}
        </p>
      ) : (
        <div className="vaPayList">
          {stripe && (
            <div className={`vaPayMethod${open === 'card' ? ' vaPayMethodOpen' : ''}`}>
              <button
                type="button"
                className="vaPayMethodBtn"
                aria-expanded={open === 'card'}
                onClick={() => setOpen(open === 'card' ? null : 'card')}
              >
                <CreditCard size={17} aria-hidden className="vaPayMethodIcon" />
                <span className="vaPayMethodMain">
                  <span className="vaPayMethodLabel">Card</span>
                  <span className="vaPayMethodSub">Pay now with any debit or credit card.</span>
                </span>
              </button>
              {open === 'card' && (
                <div className="vaPayMethodBody">
                  <VoiceCardForm
                    token={token}
                    publishableKey={stripe.publishableKey}
                    amountCents={balanceCents}
                    onPaid={() => router.refresh()}
                  />
                </div>
              )}
            </div>
          )}

          {methods.map((m) => {
            const deepLink = buildPaymentDeepLink(m, invoiceNumber, balanceCents);
            const isOpen = open === m.id;
            const Icon = ICONS[m.id] ?? Building2;
            return (
              <div key={m.id} className={`vaPayMethod${isOpen ? ' vaPayMethodOpen' : ''}`}>
                <button
                  type="button"
                  className="vaPayMethodBtn"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : m.id)}
                >
                  <Icon size={17} aria-hidden className="vaPayMethodIcon" />
                  <span className="vaPayMethodMain">
                    <span className="vaPayMethodLabel">{m.label}</span>
                    {m.handle && <span className="vaPayMethodSub">{m.handle}</span>}
                  </span>
                </button>

                {isOpen && (
                  <div className="vaPayMethodBody">
                    {m.handle && (
                      <div className="vaPayHandle">
                        <span className="vaPayHandleValue">{m.handle}</span>
                        <button type="button" className="vaBtn vaBtnOutline vaBtnSm" onClick={() => copy(m.handle, m.id)}>
                          <Copy size={12} aria-hidden /> {copied === m.id ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    )}

                    <p className="vaPayInstruction">
                      {m.instructions ??
                        `Send ${formatCents(balanceCents)} and put "${invoiceNumber}" in the note so it can be matched up.`}
                    </p>

                    <div className="vaBtnRow" style={{ marginTop: 14 }}>
                      {deepLink && (
                        <a href={deepLink} className="vaBtn vaBtnOutline vaBtnSm" target="_blank" rel="noopener noreferrer">
                          <ExternalLink size={12} aria-hidden /> Open {m.label}
                        </a>
                      )}
                      <button
                        type="button"
                        className="vaBtn vaBtnSolid vaBtnSm"
                        disabled={declaring}
                        onClick={() => declare(m.id)}
                      >
                        {declaring ? <Loader2 size={12} aria-hidden className="vaSpin" /> : null}
                        I&rsquo;ve sent it
                      </button>
                    </div>
                    <p className="vaHint" style={{ marginTop: 10 }}>
                      That just gives Andrew a heads-up to watch for it — it is not a receipt, and the
                      balance stays until the money arrives.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <p className="vaError" role="alert" style={{ marginTop: 14 }}>
          {error}
        </p>
      )}
    </div>
  );
}
