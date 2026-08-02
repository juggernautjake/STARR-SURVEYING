// app/AndrewAsh/studio/inquiries/[id]/page.tsx — one inquiry, and what to do about it.
//
// Server component: loads the inquiry and signs its attachment URLs (the uploads bucket is private).
// Everything interactive is in `InquiryActions`.
//
// The layout answers, in order: who is this, what do they want, what did they send, and what do I do
// now. The reply-by-email button is first because it is the action taken 95% of the time, and it is a
// `mailto:` with the subject and greeting pre-filled — Andrew replies from his own mail client, which
// is where his signature and his sent folder live. Building an email composer into this page would be
// a worse version of a tool he already has.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar, Download, FileText, Mail, Phone } from 'lucide-react';

import InquiryActions from './InquiryActions';
import { signAttachments, formatBytes } from '@/lib/voice/attachments';
import { supabaseAdmin } from '@/lib/supabase';
import { formatCents } from '@/lib/voice/money';
import { relativeTime } from '@/lib/voice/notifications';
import { usageScope } from '@/lib/voice/usage';
import { BASE_PATH } from '@/lib/voice/content';

export const metadata: Metadata = { title: 'Inquiry' };
export const dynamic = 'force-dynamic';

export default async function InquiryDetail({ params }: { params: { id: string } }): Promise<React.ReactElement> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let inquiry: any = null;
  try {
    const { data } = await supabaseAdmin.from('va_inquiries').select('*').eq('id', params.id).maybeSingle();
    inquiry = data;
  } catch {
    inquiry = null;
  }
  if (!inquiry) notFound();

  const attachments = await signAttachments(Array.isArray(inquiry.attachments) ? inquiry.attachments : []);

  // A pre-filled reply. The greeting uses their first name only — "Hi Robert Smith," reads like a
  // mail merge, which is the opposite of what a personal reply should feel like.
  const firstName = String(inquiry.name ?? '').trim().split(/\s+/)[0] || 'there';
  const subject =
    inquiry.intent === 'coaching' ? 'About your singing lessons' : 'About your voice-over project';
  const mailto = `mailto:${encodeURIComponent(inquiry.email)}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(`Hi ${firstName},\n\nThanks for getting in touch — \n\n`)}`;

  const facts: { label: string; value: string }[] = [
    { label: 'Getting in touch about', value: String(inquiry.intent ?? '') },
    ...(inquiry.project_type ? [{ label: 'Project type', value: String(inquiry.project_type) }] : []),
    ...(inquiry.script_words ? [{ label: 'Script length', value: `${inquiry.script_words} words` }] : []),
    ...(inquiry.usage_terms
      ? [{ label: 'Where it will run', value: usageScope(inquiry.usage_terms).label }]
      : []),
    ...(inquiry.budget_cents ? [{ label: 'Their budget', value: formatCents(inquiry.budget_cents) }] : []),
    ...(inquiry.deadline ? [{ label: 'Deadline', value: String(inquiry.deadline) }] : []),
    ...(inquiry.experience_level ? [{ label: 'Experience', value: String(inquiry.experience_level) }] : []),
    ...(inquiry.referral_source ? [{ label: 'Found you via', value: String(inquiry.referral_source) }] : []),
  ];
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <>
      <div className="vaStudioHead">
        <div>
          <Link
            href={`${BASE_PATH}/studio/inquiries`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--va-text-muted)', fontSize: '0.8125rem', textDecoration: 'none', marginBottom: 10 }}
          >
            <ArrowLeft size={13} aria-hidden /> All inquiries
          </Link>
          <h1 className="vaStudioTitle">{inquiry.name}</h1>
          <p className="vaStudioSub">
            {inquiry.company ? `${inquiry.company} · ` : ''}
            Arrived {relativeTime(inquiry.created_at)}
            {inquiry.status === 'spam' && ' · flagged as possible spam — check before deleting'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a href={mailto} className="vaBtn vaBtnSolid vaBtnSm">
            <Mail size={14} aria-hidden /> Reply by email
          </a>
          {inquiry.phone && (
            <a href={`tel:${String(inquiry.phone).replace(/[^0-9+]/g, '')}`} className="vaBtn vaBtnOutline vaBtnSm">
              <Phone size={14} aria-hidden /> Call
            </a>
          )}
        </div>
      </div>

      <div className="vaSplitPanels">
        <div>
          <div className="vaPanel">
            <div className="vaPanelHead">
              <h2 className="vaPanelTitle">What they said</h2>
            </div>
            {inquiry.message ? (
              // `pre-wrap` because clients paste whole SCRIPTS in here, and a script rendered with
              // collapsed whitespace is unreadable — the line breaks are the timing.
              <p style={{ whiteSpace: 'pre-wrap', color: 'var(--va-text)', fontSize: '0.9375rem', lineHeight: 1.7, margin: 0 }}>
                {inquiry.message}
              </p>
            ) : (
              <p className="vaMuted" style={{ margin: 0, fontSize: '0.9375rem' }}>
                They did not leave a message — everything they told you is in the details.
              </p>
            )}

            {inquiry.coaching_goals && (
              <>
                <p className="vaSpecKey" style={{ marginTop: 22, marginBottom: 8 }}>What they want to work on</p>
                <p style={{ whiteSpace: 'pre-wrap', color: 'var(--va-text)', fontSize: '0.9375rem', lineHeight: 1.7, margin: 0 }}>
                  {inquiry.coaching_goals}
                </p>
              </>
            )}
          </div>

          {attachments.length > 0 && (
            <div className="vaPanel">
              <div className="vaPanelHead">
                <h2 className="vaPanelTitle">Attachments</h2>
                <span className="vaMuted" style={{ fontSize: '0.75rem' }}>Links expire after 30 minutes</span>
              </div>
              <ul className="vaDropList" style={{ marginTop: 0 }}>
                {attachments.map((file, i) => (
                  <li key={i}>
                    <FileText size={15} aria-hidden />
                    <span className="vaDropName">{String(file.name ?? 'file')}</span>
                    <span className="vaDropSize">{formatBytes(Number(file.size_bytes ?? 0))}</span>
                    {file.url ? (
                      <a
                        href={String(file.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="vaBtn vaBtnOutline vaBtnSm"
                        style={{ flex: 'none' }}
                      >
                        <Download size={12} aria-hidden /> Open
                      </a>
                    ) : (
                      <span className="vaMuted" style={{ fontSize: '0.75rem' }}>unavailable</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div>
          <div className="vaPanel">
            <div className="vaPanelHead">
              <h2 className="vaPanelTitle">Details</h2>
            </div>
            <ul className="vaSpecList">
              <li>
                <span className="vaSpecKey">Email</span>
                <span className="vaSpecValue">
                  <a href={`mailto:${inquiry.email}`} style={{ color: 'var(--va-accent)' }}>{inquiry.email}</a>
                </span>
              </li>
              {inquiry.phone && (
                <li>
                  <span className="vaSpecKey">Phone</span>
                  <span className="vaSpecValue">{inquiry.phone}</span>
                </li>
              )}
              {facts.map((f) => (
                <li key={f.label}>
                  <span className="vaSpecKey">{f.label}</span>
                  <span className="vaSpecValue" style={{ textTransform: 'capitalize' }}>{f.value}</span>
                </li>
              ))}
              <li>
                <span className="vaSpecKey">
                  <Calendar size={11} aria-hidden style={{ verticalAlign: -1, marginRight: 5 }} />
                  Received
                </span>
                <span className="vaSpecValue">
                  {new Date(inquiry.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </li>
            </ul>
          </div>

          <InquiryActions
            id={inquiry.id}
            status={inquiry.status}
            internalNotes={inquiry.internal_notes ?? ''}
            hasClient={Boolean(inquiry.client_id)}
            clientId={inquiry.client_id ?? null}
          />
        </div>
      </div>
    </>
  );
}
