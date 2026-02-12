// app/admin/messages/contacts/page.tsx — Contact Directory
'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePageError } from '../../hooks/usePageError';
import UnderConstruction from '../../components/messaging/UnderConstruction';

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
  const [filter, setFilter] = useState<'all' | 'admin' | 'teacher' | 'employee'>('all');

  useEffect(() => {
    loadContacts();
  }, []);

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

  const filtered = contacts.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'all' ||
      (filter === 'admin' && c.is_admin) ||
      (filter === 'employee' && !c.is_admin);
    return matchesSearch && matchesFilter;
  });

  function startDirectMessage(email: string) {
    router.push(`/admin/messages/new?to=${encodeURIComponent(email)}`);
  }

  if (!session?.user) return null;

  return (
    <>
      <UnderConstruction
        feature="Contact Directory"
        description="Browse and search your Starr Surveying team members. Start conversations directly from the contact list."
      />

      <div className="msg-contacts-page">
        <div className="msg-contacts-page__header">
          <Link href="/admin/messages" className="learn__back">&larr; Back to Messages</Link>
          <h2 className="msg-contacts-page__title">Team Directory</h2>
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
              <span className="msg-contacts-page__empty-icon">👥</span>
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
                  ✉️
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Setup Guide */}
      <div className="msg-setup-guide">
        <h2 className="msg-setup-guide__title">Contact Directory — Development Guide</h2>

        <div className="msg-setup-guide__section">
          <h3>Current Capabilities</h3>
          <ul className="msg-setup-guide__list">
            <li>Fetches all team members from the contacts API</li>
            <li>Search by name or email</li>
            <li>Filter by role (All / Admins / Employees)</li>
            <li>Card-based grid layout with avatars and admin badges</li>
            <li>Quick action to start a direct message with any contact</li>
            <li>Loading skeleton and empty states</li>
          </ul>
        </div>

        <div className="msg-setup-guide__section">
          <h3>Database Requirements</h3>
          <p className="msg-setup-guide__text">
            The contacts API currently derives contacts from conversation_participants
            and hardcoded admin emails. For a full directory, consider creating a
            <code> user_profiles </code> table that stores name, email, avatar URL,
            department, job title, phone number, and online status.
          </p>
        </div>

        <div className="msg-setup-guide__section">
          <h3>Continuation Prompt for This Page</h3>
          <pre className="msg-setup-guide__prompt">{`Improve the contact directory at /admin/messages/contacts/page.tsx. Current state: grid of contact cards fetched from API, search, role filter, quick DM action.

NEXT STEPS:
1. Add a user_profiles table to store richer profile data (department, job title, phone, avatar_url, bio, hire_date)
2. Show online/offline status indicators (green dot = online in last 5 min)
3. Add profile detail modal/drawer when clicking a contact card (shows full profile, recent conversations, shared files)
4. Add group creation from selected contacts (checkbox multi-select + "Create Group" button)
5. Add department-based grouping/filtering (e.g., Field Crew, Office, Management)
6. Add alphabetical section headers (A, B, C...) for large lists
7. Add "Favorite" contacts that pin to the top of the list
8. Integrate with Google Workspace API to sync profile photos and org chart data
9. Add contact export (CSV) for admin users
10. Add invite functionality for new team members (send email invitation)
11. Show last active time and conversation history summary per contact
12. Add sorting options (name, department, recent activity)`}</pre>
        </div>
      </div>
    </>
  );
}
