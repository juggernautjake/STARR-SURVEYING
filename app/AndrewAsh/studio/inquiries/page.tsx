// app/AndrewAsh/studio/inquiries/page.tsx — the queue.
//
// This is the reason to open the app. Everything the public site does is in service of a row landing
// here, so the list is optimised for one action: decide what to do with the top item.
//
// ── SPAM IS A FILTER, NOT A DELETION ────────────────────────────────────────────────────────────
//
// The inquiry endpoint stores suspected spam rather than refusing it, because the heuristics WILL
// produce false positives and a refused submission is a lost job with no way to recover it. That
// promise is only kept if the spam is reachable, so it gets a tab with a count — visible enough that
// Andrew will glance at it, out of the way enough that it does not clutter the real queue.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Inbox, Paperclip } from 'lucide-react';

import { supabaseAdmin } from '@/lib/supabase';
import { formatCents } from '@/lib/voice/money';
import { relativeTime } from '@/lib/voice/notifications';
import { BASE_PATH } from '@/lib/voice/content';

export const metadata: Metadata = { title: 'Inquiries' };
export const dynamic = 'force-dynamic';

const TABS = [
  { id: 'open', label: 'Open', statuses: ['new', 'read', 'quoted'] },
  { id: 'won', label: 'Won', statuses: ['won'] },
  { id: 'lost', label: 'Lost', statuses: ['lost'] },
  { id: 'spam', label: 'Possible spam', statuses: ['spam'] },
  { id: 'all', label: 'Everything', statuses: [] },
] as const;

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function InquiriesPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}): Promise<React.ReactElement> {
  const tab = TABS.find((t) => t.id === searchParams.tab) ?? TABS[0];

  let rows: any[] = [];
  let counts: Record<string, number> = {};
  try {
    const { data } = await supabaseAdmin
      .from('va_inquiries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);
    rows = data ?? [];
    for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  } catch {
    rows = [];
    counts = {};
  }

  // `tab.statuses` is a readonly tuple from an `as const` array, so its `includes` narrows the
  // argument to the literal union — and `r.status` is `any` off the database. Widened to string[] so
  // the comparison is the ordinary one it looks like.
  const statuses: string[] = [...tab.statuses];
  const shown = statuses.length ? rows.filter((r) => statuses.includes(String(r.status))) : rows;
  const countFor = (t: (typeof TABS)[number]): number =>
    t.statuses.length ? (t.statuses as readonly string[]).reduce((n, s) => n + (counts[s] ?? 0), 0) : rows.length;

  return (
    <>
      <div className="vaStudioHead">
        <div>
          <h1 className="vaStudioTitle">Inquiries</h1>
          <p className="vaStudioSub">
            Every quote request and coaching enquiry. Replying inside one business day is the easiest
            way to beat competitors — most of them take four days.
          </p>
        </div>
      </div>

      <div className="vaTabRow">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`${BASE_PATH}/studio/inquiries?tab=${t.id}`}
            className={`vaTab${t.id === tab.id ? ' vaTabActive' : ''}`}
          >
            {t.label}
            <span className="vaTabCount">{countFor(t)}</span>
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="vaEmptyPanel">
          <Inbox size={28} aria-hidden style={{ color: 'var(--va-accent)', marginBottom: 14 }} />
          <p style={{ margin: '0 0 8px', color: 'var(--va-text)', fontSize: '0.9375rem' }}>
            {tab.id === 'spam' ? 'No suspected spam. Good.' : 'Nothing here yet.'}
          </p>
          {tab.id !== 'spam' && (
            <p style={{ margin: '0 0 18px', fontSize: '0.875rem' }}>
              Inquiries arrive from the contact form. The fastest way to make one happen is ten pitches —
              see{' '}
              <Link href={`${BASE_PATH}/studio/guide#cheapest-first`} style={{ color: 'var(--va-accent)' }}>
                the cheapest ways to get gigs
              </Link>
              .
            </p>
          )}
        </div>
      ) : (
        <table className="vaDataTable">
          <thead>
            <tr>
              <th>Who</th>
              <th>About</th>
              <th>Budget</th>
              <th>When</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const attachments = Array.isArray(r.attachments) ? r.attachments.length : 0;
              return (
                <tr key={r.id}>
                  <td data-label="Who">
                    <Link
                      href={`${BASE_PATH}/studio/inquiries/${r.id}`}
                      style={{ color: 'var(--va-text)', fontWeight: 600, textDecoration: 'none' }}
                    >
                      {r.name}
                    </Link>
                    <span style={{ display: 'block', color: 'var(--va-text-muted)', fontSize: '0.8125rem' }}>
                      {r.company ? `${r.company} · ` : ''}
                      {r.email}
                    </span>
                  </td>
                  <td data-label="About">
                    <span style={{ textTransform: 'capitalize' }}>{r.intent}</span>
                    {r.project_type ? ` · ${r.project_type}` : ''}
                    {attachments > 0 && (
                      <span
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--va-accent)', marginLeft: 8, fontSize: '0.75rem' }}
                      >
                        <Paperclip size={11} aria-hidden />
                        {attachments}
                      </span>
                    )}
                  </td>
                  <td data-label="Budget" className="vaNum">
                    {r.budget_cents ? formatCents(r.budget_cents) : r.script_words ? `${r.script_words} words` : '—'}
                  </td>
                  <td data-label="When">{relativeTime(r.created_at)}</td>
                  <td data-label="Status">
                    <span className={`vaStatusPill ${statusClass(r.status)}`}>{r.status}</span>
                  </td>
                  <td data-label="">
                    <Link href={`${BASE_PATH}/studio/inquiries/${r.id}`} className="vaBtn vaBtnOutline vaBtnSm">
                      Open <ArrowRight size={12} aria-hidden />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function statusClass(status: string): string {
  if (status === 'new') return 'vaStatusNew';
  if (status === 'won') return 'vaStatusGood';
  if (status === 'lost' || status === 'spam') return 'vaStatusDraft';
  return '';
}
