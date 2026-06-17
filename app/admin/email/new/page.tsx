// app/admin/email/new/page.tsx
//
// employee-pond Slice E9c — in-app email composer. Backs the Email
// button on the EmployeePond dialogue's contact actions. The
// dialogue routes here with `?to=<email>` so the recipient field is
// preloaded; the shared recipient store (E9b) provides continuity
// from the messenger widget + /admin/messages page when no `?to=`
// is on the URL.
'use client';

import '../../styles/EmailCompose.css';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  normalizeRecipientEmail,
  readActiveRecipient,
  saveActiveRecipient,
} from '@/lib/employee-pond/messenger-recipient';

type SendState = 'idle' | 'sending' | 'sent' | 'error';

export default function NewEmailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Hydrate the recipient: explicit ?to= wins; otherwise read the
  // shared recipient store (which the messenger widget + the
  // /admin/messages page write through). E9b means the recipient
  // tracked across the whole admin shell.
  const initialTo = useCallback(() => {
    const fromQuery = normalizeRecipientEmail(searchParams?.get('to') ?? '');
    if (fromQuery) return fromQuery;
    return readActiveRecipient() ?? '';
  }, [searchParams]);

  const [to, setTo] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [sendState, setSendState] = useState<SendState>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    setTo(initialTo());
  }, [initialTo]);

  // Mirror writes back into the shared store so leaving this page
  // for the messenger widget (or /admin/messages) keeps the
  // recipient in sync. Only writes when the value looks like an
  // email so we don't fight every keystroke.
  useEffect(() => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return;
    saveActiveRecipient(to);
  }, [to]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (sendState === 'sending') return;
      setErrorMsg('');
      setSendState('sending');
      try {
        const res = await fetch('/api/admin/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to, subject, body }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setErrorMsg(data.error ?? `Server returned ${res.status}`);
          setSendState('error');
          return;
        }
        setSendState('sent');
        setSubject('');
        setBody('');
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Network error');
        setSendState('error');
      }
    },
    [sendState, to, subject, body],
  );

  if (status === 'loading') return null;
  if (!session?.user) {
    if (typeof window !== 'undefined') router.replace('/login');
    return null;
  }

  return (
    <div className="email-compose" data-testid="email-compose-page">
      <header className="email-compose__header">
        <Link href="/admin/messages" className="email-compose__back">
          ← Messages
        </Link>
        <h1 className="email-compose__title">New Email</h1>
      </header>

      <form
        className="email-compose__form"
        onSubmit={handleSubmit}
        data-testid="email-compose-form"
      >
        <label className="email-compose__field">
          <span>To</span>
          <input
            type="email"
            required
            value={to}
            data-testid="email-compose-to"
            onChange={(e) => setTo(e.target.value)}
            placeholder="recipient@example.com"
            autoComplete="email"
          />
        </label>
        <label className="email-compose__field">
          <span>Subject</span>
          <input
            type="text"
            required
            value={subject}
            data-testid="email-compose-subject"
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
          />
        </label>
        <label className="email-compose__field email-compose__field--body">
          <span>Message</span>
          <textarea
            required
            value={body}
            data-testid="email-compose-body"
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
            rows={12}
          />
        </label>

        {sendState === 'sent' && (
          <p
            className="email-compose__status email-compose__status--success"
            role="status"
            data-testid="email-compose-success"
          >
            ✓ Email sent.
          </p>
        )}
        {sendState === 'error' && (
          <p
            className="email-compose__status email-compose__status--error"
            role="alert"
            data-testid="email-compose-error"
          >
            {errorMsg || 'Failed to send.'}
          </p>
        )}

        <div className="email-compose__actions">
          <button
            type="submit"
            className="email-compose__send"
            data-testid="email-compose-send"
            disabled={sendState === 'sending'}
          >
            {sendState === 'sending' ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
