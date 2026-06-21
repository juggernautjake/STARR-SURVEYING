// app/admin/messages/contacts/page.tsx — Contact Directory
'use client';
import { useState, useEffect } from 'react';
import { Users, Mail } from 'lucide-react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePageError } from '../../hooks/usePageError';

interface Contact {
  email: string;
  name: string;
  is_admin: boolean;
}

export default function ContactsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { safeFetch, safeAction, reportPageError } = usePageError('ContactsPage');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    async function loadContacts() {
      try {
        const res = await fetch('/api/admin/messages/contacts');
        if (res.ok) {
          const data = await res.json();
          setContacts(data.contacts || []);
        }
      } catch (err) {
        reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load contacts' });
      }
      setLoading(false);
    }
    loadContacts();
  }, [reportPageError]);

  const filtered = contacts.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase());
    if (filter === 'all') return matchesSearch;
    if (filter === 'admin') return matchesSearch && c.is_admin;
    // For other role filters, check roles array if available
    if ((c as any).roles && Array.isArray((c as any).roles)) {
      return matchesSearch && (c as any).roles.includes(filter);
    }
    return matchesSearch;
  });

  function startDirectMessage(email: string) {
    router.push(`/admin/messages/new?to=${encodeURIComponent(email)}`);
  }

  if (!session?.user) return null;

  return (
    <>

      <div className="msg-contacts-page">
        <div className="msg-contacts-page__header">
          <Link href="/admin/messages" className="learn__back">&larr; Back to Messages</Link>
          <h2 className="msg-contacts-page__title">Team Directory</h2>
          {/* consolidation Slice 6 (2026-05-30) — clarifying cross-link
              so users don't confuse this internal-teammate directory
              with the firm-wide /admin/contacts CRM (realtors, repeat
              clients, students, etc.). */}
          <p style={{ margin: '4px 0 8px', fontSize: '0.85rem', color: 'var(--color-text-muted, #6B7280)' }}>
            Internal teammates only. Looking for a client, realtor, or external contact?{' '}
            <Link href="/admin/contacts" style={{ color: 'var(--theme-accent, #3b82f6)' }}>Open the contacts directory →</Link>
          </p>
          <p className="msg-contacts-page__subtitle">
            {contacts.length} team member{contacts.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Search & Filters */}
        <div className="msg-contacts-page__controls">
          <input
            className="msg-contacts-page__search"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="msg-contacts-page__filters">
            <button
              className={`msg-contacts-page__filter ${filter === 'all' ? 'msg-contacts-page__filter--active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button
              className={`msg-contacts-page__filter ${filter === 'admin' ? 'msg-contacts-page__filter--active' : ''}`}
              onClick={() => setFilter('admin')}
            >
              Admins
            </button>
            <button
              className={`msg-contacts-page__filter ${filter === 'employee' ? 'msg-contacts-page__filter--active' : ''}`}
              onClick={() => setFilter('employee')}
            >
              Employees
            </button>
          </div>
        </div>

        {/* Contact Grid */}
        <div className="msg-contacts-page__grid">
          {loading && (
            <>
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="msg-contacts-page__card msg-contacts-page__card--skeleton">
                  <div className="msg-contacts-page__card-avatar-skeleton" />
                  <div className="msg-contacts-page__card-info-skeleton">
                    <div className="msg-contacts-page__card-name-skeleton" />
                    <div className="msg-contacts-page__card-email-skeleton" />
                  </div>
                </div>
              ))}
            </>
          )}

          {!loading && filtered.length === 0 && (
            <div className="msg-contacts-page__empty">
              <span className="msg-contacts-page__empty-icon"><Users size={30} strokeWidth={1.5} /></span>
              <p>No contacts found{search ? ` matching "${search}"` : ''}</p>
            </div>
          )}

          {filtered.map(contact => (
            <div key={contact.email} className="msg-contacts-page__card">
              <div className="msg-contacts-page__card-avatar">
                {contact.name.charAt(0).toUpperCase()}
              </div>
              <div className="msg-contacts-page__card-info">
                <span className="msg-contacts-page__card-name">
                  {contact.name}
                  {contact.is_admin && <span className="msg-contacts-page__card-badge">Admin</span>}
                </span>
                <span className="msg-contacts-page__card-email">{contact.email}</span>
              </div>
              <div className="msg-contacts-page__card-actions">
                <button
                  className="msg-contacts-page__card-action"
                  onClick={() => startDirectMessage(contact.email)}
                  title="Send Direct Message"
                >
                  <Mail size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
