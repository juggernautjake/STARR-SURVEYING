// app/AndrewAsh/contract/[token]/page.tsx — where a client reads and signs.
//
// Outside the `(site)` route group, so there is no marketing header. Somebody arriving here has one
// job, and a "Request a quote" button above a legal agreement is an invitation to wander off from it.
//
// ── noindex, ALWAYS ─────────────────────────────────────────────────────────────────────────────
//
// Not conditional on `VOICE_SITE_INDEXABLE` like the marketing pages. A contract naming a client, a
// fee and a delivery date must never be in a search index, whatever the rest of the site is doing.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CheckCircle2, FileSignature, ShieldCheck } from 'lucide-react';

import SignForm from './SignForm';
import ContractBody from './ContractBody';
import { supabaseAdmin } from '@/lib/supabase';
import { contractBodyIntact, looksLikeToken } from '@/lib/voice/tokens';
import { formatCents } from '@/lib/voice/money';

export const metadata: Metadata = {
  title: 'Agreement',
  robots: { index: false, follow: false, nocache: true },
};
export const dynamic = 'force-dynamic';

export default async function ContractPage({ params }: { params: { token: string } }): Promise<React.ReactElement> {
  if (!looksLikeToken(params.token)) notFound();

  /* eslint-disable @typescript-eslint/no-explicit-any */
  let contract: any = null;
  try {
    const { data } = await supabaseAdmin
      .from('va_contracts')
      .select('*, client:va_clients(name, email, company)')
      .eq('access_token', params.token)
      .maybeSingle();
    contract = data;
  } catch {
    contract = null;
  }
  if (!contract) notFound();
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const signed = Boolean(contract.signed_at);
  // Re-checked on every render, not just once at signing: this is the whole point of storing the
  // hash, and a client re-opening the page months later should be able to see it still matches.
  const intact = contractBodyIntact(contract.body_markdown, contract.body_hash);
  const isDraft = contract.status === 'draft';
  const isVoid = contract.status === 'void';

  return (
    <main id="va-main" className="vaSection">
      <div className="vaContainer vaContainerNarrow">
        {isVoid ? (
          <div className="vaNotice vaNoticeBad" role="alert">
            This agreement has been withdrawn and is no longer valid. Please get in touch.
          </div>
        ) : isDraft ? (
          <div className="vaNotice" role="status">
            This agreement is still being prepared and is not ready to sign yet.
          </div>
        ) : signed ? (
          <div className="vaNotice vaNoticeGood" role="status">
            <strong style={{ color: 'var(--va-accent)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={16} aria-hidden /> Signed
            </strong>
            <span style={{ display: 'block', marginTop: 6 }}>
              {contract.signer_name} signed this on{' '}
              {new Date(contract.signed_at).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}.
              {contract.countersigned_at &&
                ` Countersigned by ${contract.countersigned_by} on ${new Date(contract.countersigned_at).toLocaleDateString('en-US', { dateStyle: 'long' } as Intl.DateTimeFormatOptions)}.`}
            </span>
            {/* Only shown when it FAILS. A green "verified" badge on every load trains people to
                ignore it, and the only moment this matters is the moment it stops being true. */}
            {!intact && (
              <span style={{ display: 'block', marginTop: 10, color: 'var(--va-danger)' }}>
                Warning: the wording of this agreement no longer matches what was signed. Do not rely
                on this copy — contact us.
              </span>
            )}
          </div>
        ) : null}

        <div className="vaOrnament vaOrnamentLeft" style={{ margin: '10px 0 26px' }}>
          <span className="vaOrnamentMark" />
        </div>

        <p className="vaEyebrow">
          <FileSignature size={12} aria-hidden style={{ verticalAlign: -1, marginRight: 6 }} />
          Agreement {contract.contract_number}
        </p>
        <h1 className="vaDisplay vaH2" style={{ marginBottom: 18 }}>{contract.title}</h1>

        <ul className="vaSpecList" style={{ marginBottom: 34 }}>
          <li>
            <span className="vaSpecKey">Between</span>
            <span className="vaSpecValue">{contract.client?.company || contract.client?.name}</span>
          </li>
          <li>
            <span className="vaSpecKey">Fee</span>
            <span className="vaSpecValue">{formatCents(contract.fee_cents)}</span>
          </li>
          {contract.delivery_date && (
            <li>
              <span className="vaSpecKey">Delivery</span>
              <span className="vaSpecValue">{contract.delivery_date}</span>
            </li>
          )}
          <li>
            <span className="vaSpecKey">Revisions included</span>
            <span className="vaSpecValue">{contract.revisions_included}</span>
          </li>
        </ul>

        <ContractBody markdown={contract.body_markdown} />

        {!signed && !isDraft && !isVoid && (
          <>
            <div className="vaOrnament" style={{ margin: '40px 0 30px' }}>
              <span className="vaOrnamentMark" />
            </div>
            <SignForm
              token={params.token}
              expectedName={contract.client?.name ?? ''}
              defaultEmail={contract.client?.email ?? ''}
            />
          </>
        )}

        <p className="vaHint" style={{ marginTop: 40, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <ShieldCheck size={14} aria-hidden style={{ flex: 'none', marginTop: 2, color: 'var(--va-accent)' }} />
          <span>
            Typing your name below is a legally binding electronic signature. We record the date, time
            and a fingerprint of this exact wording so both of us can prove later what was agreed.
            Keep a copy — print this page or save it as a PDF.
          </span>
        </p>
      </div>
    </main>
  );
}
