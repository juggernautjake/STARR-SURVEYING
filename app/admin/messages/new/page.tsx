// app/admin/messages/new/page.tsx — New Message / New Group Chat
'use client';
import { useState } from 'react';
import { Mail, Users } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePageError } from '../../hooks/usePageError';
import Link from 'next/link';
import ContactPicker from '../../components/messaging/ContactPicker';
import ComposeBox from '../../components/messaging/ComposeBox';

export default function NewMessagePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { safeFetch, safeAction, reportPageError } = usePageError('NewMessagePage');
  const defaultType = searchParams.get('type') === 'group' ? 'group' : 'direct';

  const [type, setType] = useState<'direct' | 'group'>(defaultType);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [sending, setSending] = useState(false);

  function toggleEmail(email: string) {
    setSelectedEmails(prev =>
      prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
    );
  }

  async function handleSend(content: string) {
    if (selectedEmails.length === 0) {
      alert('Please select at least one recipient.');
      return;
    }
    setSending(true);
    try {
      // Create conversation
      const convRes = await fetch('/api/admin/messages/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: type === 'group' ? groupName || null : null,
          type,
          participant_emails: selectedEmails,
        }),
      });

      if (!convRes.ok) {
        alert('Failed to create conversation');
        setSending(false);
        return;
      }

      const convData = await convRes.json();
      const conversationId = convData.conversation.id;

      // Send the first message
      await fetch('/api/admin/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          content,
        }),
      });

      router.push(`/admin/messages/${conversationId}`);
    } catch (err) {
      alert('Error creating message');
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'create message' });
    }
    setSending(false);
  }

  if (!session?.user) return null;

  return (
    <>

      <div className="msg-new">
        <div className="msg-new__header">
          <Link href="/admin/messages" className="learn__back">&larr; Back to Messages</Link>
          <h2 className="msg-new__title">New Message</h2>
        </div>

        {/* Type selector */}
        <div className="msg-new__type-selector">
          <button
            className={`msg-new__type-btn ${type === 'direct' ? 'msg-new__type-btn--active' : ''}`}
            onClick={() => { setType('direct'); setSelectedEmails([]); }}
          >
            <Mail size={15} style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />Direct Message
          </button>
          <button
            className={`msg-new__type-btn ${type === 'group' ? 'msg-new__type-btn--active' : ''}`}
            onClick={() => { setType('group'); setSelectedEmails([]); }}
          >
            <Users size={15} style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />Group Chat
          </button>
        </div>

        {/* Group name input */}
        {type === 'group' && (
          <div className="msg-new__group-name">
            <label className="msg-new__label">Group Name (optional)</label>
            <input
              className="msg-new__input"
              placeholder="e.g., Project Alpha Team"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
            />
          </div>
        )}

        {/* Contact Picker */}
        <div className="msg-new__section">
          <label className="msg-new__label">
            {type === 'direct' ? 'Select Recipient' : 'Select Participants'}
            <span className="msg-new__label-count">({selectedEmails.length} selected)</span>
          </label>
          <ContactPicker
            selectedEmails={selectedEmails}
            onToggle={toggleEmail}
            maxSelections={type === 'direct' ? 1 : undefined}
          />
        </div>

        {/* Compose first message */}
        {selectedEmails.length > 0 && (
          <div className="msg-new__section">
            <label className="msg-new__label">First Message</label>
            <ComposeBox
              onSend={handleSend}
              placeholder="Type your message and press Enter to send..."
              disabled={sending}
            />
          </div>
        )}
      </div>
    </>
  );
}
