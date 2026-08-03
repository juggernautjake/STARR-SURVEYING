// app/AndrewAsh/client/[token]/page.tsx — a client's whole relationship, on one link.
//
// No account, no password. The token in the URL is the authorisation, because a client visits twice —
// once to sign, once to pay — and a login would mean account recovery, email verification and a
// support burden for that. See lib/voice/tokens.ts for why the token is 256 bits.
//
// Outside the `(site)` route group deliberately: a marketing header offering "Request a quote" above
// somebody's unpaid invoice is the wrong tone and the wrong destination.
//
// ── A REVOKED PORTAL IS A CLOSED DOOR, NOT A 404 ────────────────────────────────────────────────
//
// If Andrew turns the portal off, the client gets a plain "this link is no longer active, get in
// touch" rather than a not-found. They are a real person holding a link that used to work, and a 404
// tells them they did something wrong.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FileSignature, Receipt } from 'lucide-react';

import { supabaseAdmin } from '@/lib/supabase';
import { looksLikeToken } from '@/lib/voice/tokens';
import { balanceCents, deriveInvoiceStatus, formatCents, type InvoiceStatus } from '@/lib/voice/money';
import { BASE_PATH } from '@/lib/voice/content';

export const metadata: Metadata = {
  title: 'Your documents',
  robots: { index: false, follow: false, nocache: true },
};
export const dynamic = 'force-dynamic';

export default async function ClientPortal({ params }: { params: { token: string } }): Promise<React.ReactElement> {
  if (!looksLikeToken(params.token)) notFound();

  /* eslint-disable @typescript-eslint/no-explicit-any */
  let client: any = null;
  try {
    const { data } = await supabaseAdmin
      .from('va_clients')
      .select('*, invoices:va_invoices(*), contracts:va_contracts(*)')
      .eq('portal_token', params.token)
      .maybeSingle();
    client = data;
  } catch {
    client = null;
  }
  if (!client) notFound();

  if (client.portal_revoked_at) {
    return (
      <main id="va-main" className="vaSection">
        <div className="vaContainer vaContainerNarrow">
          <div className="vaNotice" role="status">
            This link is no longer active. Please get in touch and a new one will be sent over.
          </div>
        </div>
      </main>
    );
  }

  const today = new Date();
  // Drafts are Andrew's working state and must never appear here — a client seeing a half-written
  // invoice with a number that later changes is worse than seeing nothing.
  const invoices = (Array.isArray(client.invoices) ? client.invoices : [])
    .filter((i: any) => i.status !== 'draft')
    .sort((a: any, b: any) => String(b.issue_date).localeCompare(String(a.issue_date)));

  const contracts = (Array.isArray(client.contracts) ? client.contracts : [])
    .filter((c: any) => c.status !== 'draft')
    .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));

  const owing = invoices.reduce(
    (sum: number, i: any) => sum + (i.status === 'void' ? 0 : balanceCents(i.total_cents ?? 0, i.paid_cents ?? 0)),
    0,
  );
  const toSign = contracts.filter((c: any) => !c.signed_at && c.status === 'sent');
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <main id="va-main" className="vaSection">
      <div className="vaContainer vaContainerNarrow">
        <div className="vaOrnament vaOrnamentLeft" style={{ marginBottom: 26 }}>
          <span className="vaOrnamentMark" />
        </div>

        <span className="vaEyebrow">Andrew Ash</span>
        <h1 className="vaDisplay vaH2" style={{ marginBottom: 14 }}>
          Hello, {String(client.name).split(/\s+/)[0]}
        </h1>
        <p className="vaLead vaMuted" style={{ marginBottom: 36 }}>
          {toSign.length > 0 && owing > 0
            ? 'There is an agreement to sign and an invoice to settle.'
            : toSign.length > 0
              ? 'There is an agreement waiting for your signature.'
              : owing > 0
                ? `${formatCents(owing)} is outstanding.`
                : 'Everything here is up to date — nothing needs you.'}
        </p>

        {contracts.length > 0 && (
          <section style={{ marginBottom: 44 }}>
            <h2 className="vaDisplay vaH3" style={{ marginBottom: 16 }}>
              <FileSignature size={17} aria-hidden style={{ verticalAlign: -2, marginRight: 9, color: 'var(--va-accent)' }} />
              Agreements
            </h2>
            <div style={{ display: 'grid', gap: 10 }}>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {contracts.map((c: any) => (
                <a key={c.id} href={`${BASE_PATH}/contract/${c.access_token}`} className="vaPortalRow">
                  <span className="vaPortalRowMain">
                    <span className="vaPortalRowTitle">{c.title}</span>
                    <span className="vaPortalRowSub">
                      {c.contract_number} · {formatCents(c.fee_cents)}
                    </span>
                  </span>
                  <span className={`vaPortalPill ${c.signed_at ? 'vaPortalPillGood' : 'vaPortalPillAction'}`}>
                    {c.status === 'void' ? 'withdrawn' : c.signed_at ? 'signed' : 'needs your signature'}
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}

        {invoices.length > 0 && (
          <section style={{ marginBottom: 44 }}>
            <h2 className="vaDisplay vaH3" style={{ marginBottom: 16 }}>
              <Receipt size={17} aria-hidden style={{ verticalAlign: -2, marginRight: 9, color: 'var(--va-accent)' }} />
              Invoices
            </h2>
            <div style={{ display: 'grid', gap: 10 }}>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {invoices.map((inv: any) => {
                const derived = deriveInvoiceStatus(
                  { status: inv.status as InvoiceStatus, totalCents: inv.total_cents, paidCents: inv.paid_cents, dueDate: inv.due_date },
                  today,
                );
                const balance = balanceCents(inv.total_cents, inv.paid_cents);
                return (
                  <a key={inv.id} href={`${BASE_PATH}/invoice/${inv.access_token}`} className="vaPortalRow">
                    <span className="vaPortalRowMain">
                      <span className="vaPortalRowTitle">{inv.title || inv.invoice_number}</span>
                      <span className="vaPortalRowSub">
                        {inv.invoice_number} · {formatCents(inv.total_cents)}
                        {balance > 0 && balance !== inv.total_cents ? ` · ${formatCents(balance)} outstanding` : ''}
                        {inv.due_date ? ` · due ${inv.due_date}` : ''}
                      </span>
                    </span>
                    <span
                      className={`vaPortalPill ${
                        derived === 'paid'
                          ? 'vaPortalPillGood'
                          : derived === 'overdue'
                            ? 'vaPortalPillLate'
                            : 'vaPortalPillAction'
                      }`}
                    >
                      {derived === 'paid' ? 'paid' : derived === 'overdue' ? 'overdue' : 'to pay'}
                    </span>
                  </a>
                );
              })}
            </div>
          </section>
        )}

        {contracts.length === 0 && invoices.length === 0 && (
          <div className="vaEmpty">
            <p className="vaCardBody" style={{ margin: 0 }}>
              Nothing here yet. Anything Andrew sends you will appear on this page.
            </p>
          </div>
        )}

        <p className="vaHint" style={{ marginTop: 40 }}>
          Keep this link — it is how you get back here. Anyone who has it can see this page, so treat
          it like a key. If you would rather it stopped working, just ask.
        </p>
      </div>
    </main>
  );
}
