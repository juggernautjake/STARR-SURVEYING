// app/admin/components/messaging/ContactPicker.tsx
'use client';
import { useState, useEffect } from 'react';

interface Contact {
  email: string;
  name: string;
  is_admin: boolean;
}

interface ContactPickerProps {
  selectedEmails: string[];
  onToggle: (email: string) => void;
  maxSelections?: number;
}

export default function ContactPicker({ selectedEmails, onToggle, maxSelections }: ContactPickerProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

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
    } catch { /* ignore */ }
    setLoading(false);
  }

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="msg-contacts">
      <input
        className="msg-contacts__search"
        placeholder="Search people..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {/* Selected chips */}
      {selectedEmails.length > 0 && (
        <div className="msg-contacts__chips">
          {selectedEmails.map(email => {
            const contact = contacts.find(c => c.email === email);
            return (
              <button key={email} className="msg-contacts__chip" onClick={() => onToggle(email)}>
                {contact?.name || email.split('@')[0]}
                <span className="msg-contacts__chip-remove">✕</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Contact list */}
      <div className="msg-contacts__list">
        {loading && <div className="msg-contacts__loading">Loading contacts...</div>}
        {!loading && filtered.length === 0 && (
          <div className="msg-contacts__empty">No contacts found</div>
        )}
        {filtered.map(contact => {
          const isSelected = selectedEmails.includes(contact.email);
          const isDisabled = !isSelected && maxSelections !== undefined && selectedEmails.length >= maxSelections;
          return (
            <button
              key={contact.email}
              className={`msg-contacts__item ${isSelected ? 'msg-contacts__item--selected' : ''} ${isDisabled ? 'msg-contacts__item--disabled' : ''}`}
              onClick={() => !isDisabled && onToggle(contact.email)}
              disabled={isDisabled}
            >
              <span className="msg-contacts__item-avatar">
                {contact.name.charAt(0).toUpperCase()}
              </span>
              <div className="msg-contacts__item-info">
                <span className="msg-contacts__item-name">{contact.name}</span>
                <span className="msg-contacts__item-email">{contact.email}</span>
              </div>
              {contact.is_admin && <span className="msg-contacts__item-badge">Admin</span>}
              {isSelected && <span className="msg-contacts__item-check">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
