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
import { EMAIL_TEMPLATES, getEmailTemplate } from '@/lib/email/templates';

type SendState = 'idle' | 'sending' | 'sent' | 'error';
interface Recipient { name: string; email: string }

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

  // EM2 — recipient picker (employees + customers). Free-text in the To field
  // still works; this just lets the sender pick a known contact.
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<'employees' | 'customers'>('employees');
  const [pickerSearch, setPickerSearch] = useState('');
  const [employees, setEmployees] = useState<Recipient[]>([]);
  const [customers, setCustomers] = useState<Recipient[]>([]);

  useEffect(() => {
    setTo(initialTo());
  }, [initialTo]);

  // Load the recipient directory once the picker is first opened (lazy — keeps
  // the initial composer render light when the user types a raw address).
  useEffect(() => {
    if (!showPicker || (employees.length > 0 || customers.length > 0)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/email/recipients');
        if (!res.ok) return;
        const data = (await res.json()) as { employees?: Recipient[]; customers?: Recipient[] };
        if (cancelled) return;
        setEmployees(data.employees ?? []);
        setCustomers(data.customers ?? []);
      } catch { /* picker is optional; free-text still works */ }
    })();
    return () => { cancelled = true; };
  }, [showPicker, employees.length, customers.length]);

  // Mirror writes back into the shared store so leaving this page
  // for the messenger widget (or /admin/messages) keeps the
  // recipient in sync. Only writes when the value looks like an
  // email so we don't fight every keystroke.
  useEffect(() => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return;
    saveActiveRecipient(to);
  }, [to]);

  // EM3 — apply a template into subject + body. If the user already typed
  // something, confirm before overwriting so we don't clobber a draft.
  const applyTemplate = useCallback((id: string) => {
    if (!id) return;
    const tpl = getEmailTemplate(id);
    if (!tpl) return;
    const hasDraft = subject.trim() !== '' || body.trim() !== '';
    if (hasDraft && typeof window !== 'undefined' &&
        !window.confirm('Replace the current subject and message with this template?')) {
      return;
    }
    setSubject(tpl.subject);
    setBody(tpl.body);
  }, [subject, body]);

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
        <div className="email-compose__field">
          <span>To</span>
          <div className="email-compose__to-row">
            <input
              type="email"
              required
              value={to}
              data-testid="email-compose-to"
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              autoComplete="email"
            />
            <button
              type="button"
              className="email-compose__pick-btn"
              data-testid="email-compose-pick"
              onClick={() => setShowPicker((v) => !v)}
              aria-expanded={showPicker}
            >
              {showPicker ? 'Close' : 'Choose…'}
            </button>
          </div>

          {showPicker && (
            <div className="email-compose__picker" data-testid="email-compose-picker">
              <div className="email-compose__picker-tabs">
                <button
                  type="button"
                  className={`email-compose__picker-tab${pickerTab === 'employees' ? ' is-active' : ''}`}
                  onClick={() => setPickerTab('employees')}
                >
                  Employees ({employees.length})
                </button>
                <button
                  type="button"
                  className={`email-compose__picker-tab${pickerTab === 'customers' ? ' is-active' : ''}`}
                  onClick={() => setPickerTab('customers')}
                >
                  Customers ({customers.length})
                </button>
              </div>
              <input
                type="text"
                className="email-compose__picker-search"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder={`Search ${pickerTab}…`}
                autoFocus
              />
              <ul className="email-compose__picker-list">
                {(() => {
                  const list = pickerTab === 'employees' ? employees : customers;
                  const q = pickerSearch.trim().toLowerCase();
                  const filtered = q
                    ? list.filter((r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q))
                    : list;
                  if (filtered.length === 0) {
                    return <li className="email-compose__picker-empty">No matches</li>;
                  }
                  return filtered.slice(0, 100).map((r) => (
                    <li key={r.email}>
                      <button
                        type="button"
                        className="email-compose__picker-item"
                        onClick={() => { setTo(r.email); setShowPicker(false); setPickerSearch(''); }}
                      >
                        <span className="email-compose__picker-name">{r.name}</span>
                        <span className="email-compose__picker-email">{r.email}</span>
                      </button>
                    </li>
                  ));
                })()}
              </ul>
            </div>
          )}
        </div>
        <label className="email-compose__field">
          <span>Template</span>
          <select
            className="email-compose__template-select"
            data-testid="email-compose-template"
            defaultValue=""
            onChange={(e) => { applyTemplate(e.target.value); e.target.value = ''; }}
          >
            <option value="">Start from a template…</option>
            {EMAIL_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>{t.label} — {t.description}</option>
            ))}
          </select>
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
