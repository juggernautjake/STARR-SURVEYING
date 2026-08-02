// app/AndrewAsh/studio/contracts/[id]/page.tsx — one agreement.
//
// The wording on the left, the state and actions on the right. When it has been signed, the evidence
// bundle is shown in full — name, email, timestamp, IP, browser, and whether the stored hash still
// matches the text. That is not decoration: it is the thing that makes a typed name defensible, and
// Andrew should be able to see it without knowing it exists.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, ArrowLeft, ShieldCheck } from 'lucide-react';

import ContractActions from './ContractActions';
import ContractBody from '../../../contract/[token]/ContractBody';
import { supabaseAdmin } from '@/lib/supabase';
import { contractBodyIntact } from '@/lib/voice/tokens';
import { formatCents } from '@/lib/voice/money';
import { usageScope } from '@/lib/voice/usage';
import { BASE_PATH } from '@/lib/voice/content';

export const metadata: Metadata = { title: 'Agreement' };
export const dynamic = 'force-dynamic';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function ContractDetail({ params }: { params: { id: string } }): Promise<React.ReactElement> {
  let contract: any = null;
  try {
    const { data } = await supabaseAdmin
      .from('va_contracts')
      .select('*, client:va_clients(id, name, email, company)')
      .eq('id', params.id)
      .maybeSingle();
    contract = data;
  } catch {
    contract = null;
  }
  if (!contract) notFound();

  const signed = Boolean(contract.signed_at);
  const intact = contractBodyIntact(contract.body_markdown, contract.body_hash);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <>
      <div className="vaStudioHead">
        <div>
          <Link
            href={`${BASE_PATH}/studio/contracts`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--va-text-muted)', fontSize: '0.8125rem', textDecoration: 'none', marginBottom: 10 }}
          >
            <ArrowLeft size={13} aria-hidden /> All agreements
          </Link>
          <h1 className="vaStudioTitle">{contract.title}</h1>
          <p className="vaStudioSub">
            {contract.contract_number} · {contract.client?.name} · {formatCents(contract.fee_cents)}
            {contract.usage_terms ? ` · ${usageScope(contract.usage_terms).label}` : ''}
          </p>
        </div>
        <span
          className={`vaStatusPill ${
            contract.status === 'countersigned' ? 'vaStatusGood' : signed ? 'vaStatusSigned' : contract.status === 'sent' ? 'vaStatusSent' : 'vaStatusDraft'
          }`}
        >
          {contract.status}
        </span>
      </div>

      {signed && !intact && (
        <div className="vaNotice vaNoticeBad" role="alert">
          <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={15} aria-hidden /> The wording has changed since this was signed
          </strong>
          <span style={{ display: 'block', marginTop: 6 }}>
            The stored fingerprint no longer matches the text below, so this copy is not what the
            client agreed to. Do not rely on it — void it and issue a fresh agreement.
          </span>
        </div>
      )}

      <div className="vaSplitPanels">
        <div>
          <div className="vaPanel">
            <ContractBody markdown={contract.body_markdown} />
          </div>
        </div>

        <div>
          {signed && (
            <div className="vaPanel">
              <div className="vaPanelHead">
                <h2 className="vaPanelTitle">
                  <ShieldCheck size={15} aria-hidden style={{ verticalAlign: -2, marginRight: 8, color: 'var(--va-accent)' }} />
                  Signature record
                </h2>
              </div>
              <p className="vaMuted" style={{ fontSize: '0.8125rem', marginBottom: 14 }}>
                This is what makes a typed name hold up. Keep it.
              </p>
              <ul className="vaSpecList">
                <li>
                  <span className="vaSpecKey">Signed by</span>
                  <span className="vaSpecValue">{contract.signer_name}</span>
                </li>
                {contract.signer_email && (
                  <li>
                    <span className="vaSpecKey">Email</span>
                    <span className="vaSpecValue">{contract.signer_email}</span>
                  </li>
                )}
                <li>
                  <span className="vaSpecKey">When</span>
                  <span className="vaSpecValue">
                    {new Date(contract.signed_at).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}
                  </span>
                </li>
                {contract.signature_ip && (
                  <li>
                    <span className="vaSpecKey">From</span>
                    <span className="vaSpecValue">{contract.signature_ip}</span>
                  </li>
                )}
                {contract.signature_user_agent && (
                  <li>
                    <span className="vaSpecKey">Browser</span>
                    <span className="vaSpecValue" style={{ fontSize: '0.75rem', wordBreak: 'break-word' }}>
                      {contract.signature_user_agent}
                    </span>
                  </li>
                )}
                <li>
                  <span className="vaSpecKey">Wording fingerprint</span>
                  <span className="vaSpecValue" style={{ color: intact ? '#7fd49b' : '#ff9c7e', fontSize: '0.8125rem' }}>
                    {intact ? 'Matches — unchanged since signing' : 'DOES NOT MATCH'}
                  </span>
                </li>
                {contract.countersigned_at && (
                  <li>
                    <span className="vaSpecKey">Countersigned</span>
                    <span className="vaSpecValue">
                      {contract.countersigned_by} ·{' '}
                      {new Date(contract.countersigned_at).toLocaleDateString('en-US', { dateStyle: 'long' } as Intl.DateTimeFormatOptions)}
                    </span>
                  </li>
                )}
              </ul>
            </div>
          )}

          <ContractActions
            id={contract.id}
            status={contract.status}
            accessToken={contract.access_token}
            clientEmail={contract.client?.email ?? null}
            clientName={contract.client?.name ?? ''}
            title={contract.title}
            bodyMarkdown={contract.body_markdown}
          />
        </div>
      </div>
    </>
  );
}
