// app/admin/messages/page.tsx — Main Messages Inbox
'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { usePageError } from '../hooks/usePageError';
import Link from 'next/link';
import UnderConstruction from '../components/messaging/UnderConstruction';
import ConversationList from '../components/messaging/ConversationList';
import MessageSearch from '../components/messaging/MessageSearch';

interface Conversation {
  id: string;
  title: string | null;
  type: 'direct' | 'group' | 'announcement';
  last_message_at: string;
  last_message_preview: string | null;
  is_archived: boolean;
  participants: { user_email: string; role: string }[];
}

export default function MessagesInboxPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { safeFetch, safeAction, reportPageError } = usePageError('MessagesInboxPage');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'archived'>('all');
  const [showSearch, setShowSearch] = useState(false);

  const loadConversations = useCallback(async () => {
    try {
      const archived = filter === 'archived';
      const res = await fetch(`/api/admin/messages/conversations?archived=${archived}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load conversations' });
    }
    setLoading(false);
  }, [filter, reportPageError]);

  const loadUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/messages/read');
      if (res.ok) {
        const data = await res.json();
        setUnreadCounts(data.unread_by_conversation || {});
        setTotalUnread(data.unread_count || 0);
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load unread counts' });
    }
  }, [reportPageError]);

  useEffect(() => {
    if (session?.user) {
      loadConversations();
      loadUnread();
    }
  }, [session, loadConversations, loadUnread]);

  // Poll for new messages every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadUnread();
      loadConversations();
    }, 15000);
    return () => clearInterval(interval);
  }, [loadUnread, loadConversations]);

  if (!session?.user) return null;

  const filteredConversations = filter === 'unread'
    ? conversations.filter(c => (unreadCounts[c.id] || 0) > 0)
    : conversations;

  return (
    <>
      {/* Under Construction Banner */}
      <UnderConstruction
        feature="Internal Messaging System"
        description="Real-time messaging between Starr Surveying employees. Send direct messages, create group chats, share files, and stay connected with your team."
      />

      {/* Page Header */}
      <div className="msg-inbox__header">
        <div className="msg-inbox__header-left">
          <h2 className="msg-inbox__title">Messages</h2>
          {totalUnread > 0 && (
            <span className="msg-inbox__unread-total">{totalUnread} unread</span>
          )}
        </div>
        <div className="msg-inbox__header-right">
          <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setShowSearch(!showSearch)}>
            🔍 Search
          </button>
          <Link href="/admin/messages/new" className="admin-btn admin-btn--primary admin-btn--sm">
            + New Message
          </Link>
        </div>
      </div>

      {/* Search panel */}
      {showSearch && (
        <MessageSearch
          onClose={() => setShowSearch(false)}
          onSelectResult={(result) => {
            router.push(`/admin/messages/${result.conversation_id}`);
            setShowSearch(false);
          }}
        />
      )}

      {/* Filter tabs */}
      <div className="msg-inbox__filters">
        <button className={`msg-inbox__filter ${filter === 'all' ? 'msg-inbox__filter--active' : ''}`} onClick={() => setFilter('all')}>
          All
        </button>
        <button className={`msg-inbox__filter ${filter === 'unread' ? 'msg-inbox__filter--active' : ''}`} onClick={() => setFilter('unread')}>
          Unread {totalUnread > 0 && `(${totalUnread})`}
        </button>
        <button className={`msg-inbox__filter ${filter === 'archived' ? 'msg-inbox__filter--active' : ''}`} onClick={() => setFilter('archived')}>
          Archived
        </button>
      </div>

      {/* Conversation List Component */}
      <ConversationList
        conversations={filteredConversations}
        currentUserEmail={session.user.email || ''}
        unreadCounts={unreadCounts}
        onSelect={(id) => router.push(`/admin/messages/${id}`)}
        loading={loading}
      />

      {/* Quick action cards */}
      <div className="msg-inbox__actions">
        <Link href="/admin/messages/new" className="msg-inbox__action-card">
          <span className="msg-inbox__action-icon">✉️</span>
          <span className="msg-inbox__action-label">New Direct Message</span>
        </Link>
        <Link href="/admin/messages/new?type=group" className="msg-inbox__action-card">
          <span className="msg-inbox__action-icon">👥</span>
          <span className="msg-inbox__action-label">New Group Chat</span>
        </Link>
        <Link href="/admin/messages/contacts" className="msg-inbox__action-card">
          <span className="msg-inbox__action-icon">📇</span>
          <span className="msg-inbox__action-label">View Contacts</span>
        </Link>
        <Link href="/admin/messages/settings" className="msg-inbox__action-card">
          <span className="msg-inbox__action-icon">⚙️</span>
          <span className="msg-inbox__action-label">Message Settings</span>
        </Link>
      </div>

      {/* ============================================================ */}
      {/* SETUP INSTRUCTIONS & CONTINUATION PROMPT                      */}
      {/* ============================================================ */}
      <div className="msg-setup-guide">
        <h2 className="msg-setup-guide__title">Setup Instructions & Development Guide</h2>
        <p className="msg-setup-guide__subtitle">Reference for configuring and continuing development on the Internal Messaging System.</p>

        <div className="msg-setup-guide__section">
          <h3>1. Database Setup</h3>
          <p>Run the messaging schema SQL file against your Supabase database:</p>
          <pre className="msg-setup-guide__code">{`-- In Supabase SQL Editor, run:
-- File: supabase_schema_messaging.sql

-- This creates the following tables:
-- • conversations — Thread containers (direct, group, announcement)
-- • conversation_participants — Who belongs to each conversation
-- • messages — Individual messages with content, type, attachments
-- • message_read_receipts — Per-user read tracking
-- • message_reactions — Emoji reactions on messages
-- • messaging_preferences — Per-user notification/UI preferences
-- • pinned_messages — Pinned messages per conversation

-- All tables have RLS enabled with service-role bypass policies.
-- Indexes are created for conversation_id, user_email, and timestamps.`}</pre>
        </div>

        <div className="msg-setup-guide__section">
          <h3>2. API Routes Created</h3>
          <pre className="msg-setup-guide__code">{`/api/admin/messages/conversations  — GET (list), POST (create), PUT (update)
/api/admin/messages/send           — GET (fetch msgs), POST (send), PUT (edit), DELETE (soft-delete)
/api/admin/messages/read           — GET (unread count), POST (mark read)
/api/admin/messages/search         — GET (search messages by keyword)
/api/admin/messages/contacts       — GET (list all contacts/employees)
/api/admin/messages/reactions      — POST (add reaction), DELETE (remove reaction)
/api/admin/messages/preferences    — GET (get prefs), PUT (update prefs)`}</pre>
        </div>

        <div className="msg-setup-guide__section">
          <h3>3. Pages Created</h3>
          <pre className="msg-setup-guide__code">{`/admin/messages                    — Inbox (conversation list, filters, search)
/admin/messages/[conversationId]   — Conversation thread view
/admin/messages/new                — Create new direct or group message
/admin/messages/contacts           — Contact directory
/admin/messages/settings           — Messaging notification preferences`}</pre>
        </div>

        <div className="msg-setup-guide__section">
          <h3>4. Components Created</h3>
          <pre className="msg-setup-guide__code">{`app/admin/components/messaging/
├── UnderConstruction.tsx   — Banner for under-construction pages
├── MessageBubble.tsx       — Individual message display (own/other/system)
├── ComposeBox.tsx          — Message input with file attach & emoji picker
├── ConversationList.tsx    — Scrollable list of conversations with unread badges
├── ConversationHeader.tsx  — Conversation title bar with actions
├── ContactPicker.tsx       — Multi-select contact picker with search
└── MessageSearch.tsx       — Search messages across conversations`}</pre>
        </div>

        <div className="msg-setup-guide__section">
          <h3>5. What Needs to Be Done Next</h3>
          <ul className="msg-setup-guide__list">
            <li><strong>Real-time Updates:</strong> Replace the 15-second polling with Supabase Realtime subscriptions for instant message delivery. Use <code>supabase.channel(&apos;messages&apos;).on(&apos;postgres_changes&apos;, ...)</code> to listen for INSERT events on the messages table.</li>
            <li><strong>File Upload to Supabase Storage:</strong> Currently files are converted to base64 data URLs. Set up a Supabase Storage bucket called <code>message-attachments</code> and update the send API to upload files there instead. This allows for larger files and better performance.</li>
            <li><strong>Push Notifications:</strong> Implement browser Push Notifications using the Web Push API. Store push subscriptions in the messaging_preferences table and send notifications via a server-side function when new messages arrive.</li>
            <li><strong>Typing Indicators:</strong> Use Supabase Realtime Presence to show when other users are typing in a conversation. Track typing state client-side and broadcast it via the presence channel.</li>
            <li><strong>Online Status:</strong> Use Supabase Realtime Presence to track who is currently online. Show green/gray dots next to contact names.</li>
            <li><strong>Message Formatting:</strong> Add markdown or rich text support to messages. Consider using a lightweight markdown renderer for message content display.</li>
            <li><strong>Thread/Reply UI:</strong> The reply_to_id field exists in the messages table. Build a threaded reply UI that shows replies in context, similar to Slack threads.</li>
            <li><strong>Admin Announcements:</strong> Build the announcement conversation type where admins can broadcast to all employees. Only admins can post, employees can react but not reply.</li>
            <li><strong>Unread Badge in Sidebar:</strong> Add a real-time unread count badge to the Messages link in AdminSidebar.tsx. Poll or subscribe for count changes.</li>
            <li><strong>Mobile Optimization:</strong> The messaging layout needs a mobile-first approach where the conversation list slides out and the thread view takes full screen.</li>
            <li><strong>Link Previews:</strong> When a message contains a URL, fetch its Open Graph metadata and display a link preview card below the message.</li>
            <li><strong>Message Pinning:</strong> The pinned_messages table exists. Build a UI for pinning important messages and viewing pinned messages per conversation.</li>
          </ul>
        </div>

        <div className="msg-setup-guide__section">
          <h3>6. Continuation Prompt</h3>
          <p>Copy and paste this prompt to continue development:</p>
          <pre className="msg-setup-guide__prompt">{`Continue developing the Internal Messaging System for the STARR Surveying admin panel. The groundwork has already been laid:

DATABASE: supabase_schema_messaging.sql has been created with tables for conversations, conversation_participants, messages, message_read_receipts, message_reactions, messaging_preferences, and pinned_messages. Run this SQL against Supabase if not already done.

API ROUTES (all under /api/admin/messages/):
- conversations/route.ts — GET list, POST create, PUT update conversations
- send/route.ts — GET fetch messages, POST send, PUT edit, DELETE soft-delete
- read/route.ts — GET unread count, POST mark as read
- search/route.ts — GET search messages by keyword
- contacts/route.ts — GET list of all employees/contacts
- reactions/route.ts — POST add, DELETE remove emoji reactions
- preferences/route.ts — GET/PUT user notification preferences

COMPONENTS (under app/admin/components/messaging/):
- MessageBubble.tsx — Renders individual messages with reactions, replies, edit/delete
- ComposeBox.tsx — Message input with emoji picker, file attach, keyboard shortcuts
- ConversationList.tsx — Scrollable conversation list with unread badges, avatars
- ConversationHeader.tsx — Conversation title bar with search, info, archive actions
- ContactPicker.tsx — Multi-select contact picker with search filtering
- MessageSearch.tsx — Search across all messages with results
- UnderConstruction.tsx — Construction banner component

PAGES (under app/admin/messages/):
- page.tsx — Inbox with conversation list, filters (all/unread/archived), polling
- [conversationId]/page.tsx — Thread view with messages, compose box, scroll-to-bottom
- new/page.tsx — New message form with contact picker and type selection
- contacts/page.tsx — Full contact directory
- settings/page.tsx — Notification preference toggles

CSS: app/admin/styles/AdminMessaging.css with full BEM-style classes for all components.

SIDEBAR: "Messages" link added to AdminSidebar.tsx under a new "Communication" section.

WHAT TO DO NEXT (pick any):
1. Replace 15-second polling with Supabase Realtime subscriptions for instant message delivery
2. Set up Supabase Storage bucket "message-attachments" and update file upload to use actual storage instead of base64
3. Add typing indicators using Supabase Realtime Presence
4. Add online/offline status indicators on contacts
5. Add unread badge counter to the sidebar Messages link
6. Build threaded reply UI using the existing reply_to_id field
7. Build admin announcement channel (broadcast-only conversation type)
8. Add push notifications via Web Push API
9. Add link preview cards when messages contain URLs
10. Build message pinning UI using the pinned_messages table
11. Optimize mobile layout (slide-out conversation list, full-screen thread view)
12. Add markdown rendering for message content

Tech stack: Next.js 14 App Router, React 18, TypeScript, Supabase (PostgreSQL + RLS), NextAuth v5 beta (Google OAuth), Custom CSS (BEM-like, NOT Tailwind). Admin panel is at /admin/* routes. All admin emails are @starr-surveying.com domain.`}</pre>
        </div>
      </div>
    </>
  );
}
