'use client';
// app/admin/support/new/page.tsx
//
// Customer-side new-ticket form. Phase E-2 of SUPPORT_DESK.md.
// Submits to POST /api/admin/support/tickets via createSupportTicket
// + redirects to the ticket thread on success.
//
// Auto-captures context per SUPPORT_DESK §3.2 (URL, browser, viewport,
// session-ish metadata) and shows the captured fields before submit
// so the user can scrub anything they don't want shared.
//
// Spec: docs/planning/in-progress/SUPPORT_DESK.md §3.2 + §7 E-2.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Priority = 'normal' | 'high' | 'urgent';

interface CapturedContext {
  url: string;
  userAgent: string;
  viewport: string;
  language: string;
  timezone: string;
  ts: string;
}

export default function NewTicketPage() {
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [category, setCategory] = useState('question');
  const [includeContext, setIncludeContext] = useState(true);
  const [context, setContext] = useState<CapturedContext | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Capture browser context after mount (server-rendered HTML can't
  // know window dimensions or user agent).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setContext({
      url: window.location.href,
      userAgent: window.navigator.userAgent,
      viewport: `${window.innerWidth}×${window.innerHeight}`,
      language: window.navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ts: new Date().toISOString(),
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!subject.trim() || !body.trim()) {
      setError('Subject and description are required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          initialMessage: body.trim(),
          priority,
          category,
          context: includeContext ? context : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        setError(err.error ?? `Failed (status ${res.status})`);
        setSubmitting(false);
        return;
      }
      const data = (await res.json()) as { id: string; ticketNumber: string };
      router.push(`/admin/support/tickets/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed.');
      setSubmitting(false);
    }
  }

  return (
    <div className="newticket-page">
      <header>
        <Link href="/admin/support" className="newticket-back">← Back to support</Link>
        <h1>New support ticket</h1>
      </header>

      <form onSubmit={handleSubmit}>
        <label className="newticket-field">
          <span>Subject</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. CAD export to DXF crashes"
            required
            maxLength={200}
            autoFocus
          />
        </label>

        <div className="newticket-row">
          <label className="newticket-field newticket-field--small">
            <span>Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="question">Question</option>
              <option value="bug">Bug</option>
              <option value="billing">Billing</option>
              <option value="feature_request">Feature request</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="newticket-field newticket-field--small">
            <span>Priority</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="normal">Normal</option>
              <option value="high">High — blocking my work</option>
              <option value="urgent">Urgent — service is down</option>
            </select>
          </label>
        </div>

        <label className="newticket-field">
          <span>What happened? <em>(steps + expected vs. actual is most useful)</em></span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder="Describe the issue. Include steps to reproduce if it's a bug."
            required
          />
        </label>

        {context ? (
          <details className="newticket-context">
            <summary>
              <label className="newticket-toggle">
                <input
                  type="checkbox"
                  checked={includeContext}
                  onChange={(e) => setIncludeContext(e.target.checked)}
                />
                Auto-attach browser context (recommended)
              </label>
            </summary>
            <pre className="newticket-context__data">
URL:        {context.url}{'\n'}
Browser:    {context.userAgent}{'\n'}
Viewport:   {context.viewport}{'\n'}
Language:   {context.language}{'\n'}
Timezone:   {context.timezone}{'\n'}
Captured:   {context.ts}
            </pre>
            <p className="newticket-context__note">
              Operators see this on the ticket. Scrub anything sensitive before submit.
            </p>
          </details>
        ) : null}

        {error ? <div className="newticket-error">{error}</div> : null}

        <div className="newticket-actions">
          <Link href="/admin/support" className="newticket-btn newticket-btn--secondary">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="newticket-btn newticket-btn--primary"
          >
            {submitting ? 'Submitting…' : 'Submit ticket'}
          </button>
        </div>
      </form>

      <style jsx>{`
        .newticket-page {
          max-width: 720px;
          margin: 0 auto;
          padding: 1.5rem;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          color: #0F1419;
        }
        header { margin-bottom: 1.5rem; }
        h1 {
          font-family: 'Sora', sans-serif;
          font-size: 1.8rem;
          font-weight: 600;
          margin: 0.5rem 0 0;
        }
        .newticket-back {
          color: #6B7280;
          text-decoration: none;
          font-size: 0.85rem;
        }
        .newticket-back:hover { color: #1D3095; }
        .newticket-field {
          display: block;
          margin-bottom: 1.25rem;
        }
        .newticket-field > span {
          display: block;
          font-size: 0.85rem;
          font-weight: 600;
          color: #1F2937;
          margin-bottom: 0.35rem;
        }
        .newticket-field > span em {
          font-weight: 400;
          color: #6B7280;
          font-style: normal;
        }
        .newticket-field input,
        .newticket-field textarea,
        .newticket-field select {
          width: 100%;
          padding: 0.6rem 0.8rem;
          border: 1px solid #D1D5DB;
          border-radius: 6px;
          font-family: inherit;
          font-size: 0.92rem;
          background: #FFF;
        }
        .newticket-field input:focus,
        .newticket-field textarea:focus,
        .newticket-field select:focus {
          outline: none;
          border-color: #1D3095;
          box-shadow: 0 0 0 3px rgba(29, 48, 149, 0.12);
        }
        .newticket-field textarea { resize: vertical; }
        .newticket-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }
        .newticket-field--small { margin-bottom: 1.25rem; }
        .newticket-context {
          margin-bottom: 1.5rem;
          background: #F9FAFB;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          padding: 0.75rem 1rem;
        }
        .newticket-context summary {
          cursor: pointer;
          font-size: 0.88rem;
        }
        .newticket-toggle {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
        }
        .newticket-context__data {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 0.78rem;
          color: #4B5563;
          background: #FFF;
          padding: 0.75rem;
          border-radius: 6px;
          margin: 0.75rem 0 0.5rem;
          overflow-x: auto;
        }
        .newticket-context__note {
          font-size: 0.78rem;
          color: #6B7280;
          margin: 0;
        }
        .newticket-error {
          padding: 0.75rem 1rem;
          background: #FEE2E2;
          border: 1px solid #FCA5A5;
          color: #7F1D1D;
          border-radius: 8px;
          margin-bottom: 1rem;
          font-size: 0.88rem;
        }
        .newticket-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
        }
        .newticket-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.65rem 1.4rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.9rem;
          text-decoration: none;
          border: 0;
          cursor: pointer;
          font-family: inherit;
        }
        .newticket-btn--primary { background: #1D3095; color: #FFF; }
        .newticket-btn--primary:disabled { background: #9CA3AF; cursor: not-allowed; }
        .newticket-btn--secondary {
          background: #FFF;
          color: #1F2937;
          border: 1px solid #D1D5DB;
        }
        .newticket-btn--secondary:hover { border-color: #1D3095; color: #1D3095; }
      `}</style>
    </div>
  );
}
