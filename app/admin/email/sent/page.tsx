// app/admin/email/sent/page.tsx — Sent-email history (doc 04, slice EM5).
// Admin-only list of recent sends from email_send_log. Mobile-first: a stacked
// card list, no horizontal table overflow at 390px.
'use client';

import '../../styles/EmailCompose.css';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

interface SendRow {
  id: string;
  sender_email: string;
  subject: string;
  role: string | null;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
}

function displayName(email: string): string {
  return (email.split('@')[0] || email)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || email;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function SentEmailsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [sends, setSends] = useState<SendRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/email/log?limit=100');
        if (res.ok) {
          const data = (await res.json()) as { sends?: SendRow[] };
          if (!cancelled) setSends(data.sends ?? []);
        }
      } catch { /* show empty */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (status === 'loading') return null;
  if (!session?.user) {
    if (typeof window !== 'undefined') router.replace('/login');
    return null;
  }

  return (
    <div className="email-compose" data-testid="email-sent-page">
      <header className="email-compose__header">
        <Link href="/admin/email/new" className="email-compose__back">← New Email</Link>
        <h1 className="email-compose__title">Sent Emails</h1>
      </header>

      {loading ? (
        <p className="email-sent__empty">Loading…</p>
      ) : sends.length === 0 ? (
        <p className="email-sent__empty">No emails sent yet.</p>
      ) : (
        <ul className="email-sent__list">
          {sends.map((s) => (
            <li key={s.id} className="email-sent__row">
              <div className="email-sent__subject">{s.subject}</div>
              <div className="email-sent__meta">
                <span>{displayName(s.sender_email)}</span>
                <span>·</span>
                <span>{formatWhen(s.created_at)}</span>
              </div>
              <div className="email-sent__counts">
                <span className="email-sent__pill">
                  {s.sent_count}/{s.recipient_count} sent
                </span>
                {s.failed_count > 0 && (
                  <span className="email-sent__pill email-sent__pill--fail">{s.failed_count} failed</span>
                )}
                {s.role && <span className="email-sent__pill email-sent__pill--role">role: {s.role}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
