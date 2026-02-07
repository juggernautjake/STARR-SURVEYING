// app/admin/messages/[conversationId]/page.tsx — Conversation Thread View
'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { usePageError } from '../../hooks/usePageError';
import UnderConstruction from '../../components/messaging/UnderConstruction';
import MessageBubble from '../../components/messaging/MessageBubble';
import ComposeBox from '../../components/messaging/ComposeBox';
import ConversationHeader from '../../components/messaging/ConversationHeader';
import MessageSearch from '../../components/messaging/MessageSearch';

interface Message {
  id: string;
  conversation_id: string;
  sender_email: string;
  content: string;
  message_type: 'text' | 'image' | 'file' | 'system' | 'link';
  reply_to_id: string | null;
  attachments: any[];
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string;
  read_receipts: any[];
  reactions: any[];
}

interface Participant {
  user_email: string;
  role: string;
}

interface ConversationMeta {
  id: string;
  title: string | null;
  type: 'direct' | 'group' | 'announcement';
  created_by: string;
  is_archived: boolean;
}

function getDisplayName(email: string): string {
  return email.split('@')[0]
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\./g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function ConversationPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const conversationId = params.conversationId as string;
  const { safeFetch, safeAction, reportPageError } = usePageError('ConversationPage');

  const [conversation, setConversation] = useState<ConversationMeta | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState<{ id: string; senderName: string; content: string } | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConversation = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/messages/conversations?id=${conversationId}`);
      if (res.ok) {
        const data = await res.json();
        setConversation(data.conversation);
        setParticipants(data.participants || []);
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load conversation' });
    }
  }, [conversationId, reportPageError]);

  const loadMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/messages/send?conversation_id=${conversationId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load messages' });
    }
    setLoading(false);
  }, [conversationId, reportPageError]);

  const markAsRead = useCallback(async () => {
    try {
      await fetch('/api/admin/messages/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId }),
      });
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'mark as read' });
    }
  }, [conversationId, reportPageError]);

  useEffect(() => {
    if (session?.user) {
      loadConversation();
      loadMessages();
    }
  }, [session, loadConversation, loadMessages]);

  // Mark as read when messages load
  useEffect(() => {
    if (messages.length > 0) markAsRead();
  }, [messages, markAsRead]);

  // Poll for new messages every 5 seconds (will be replaced with Realtime)
  useEffect(() => {
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(content: string) {
    if (!content.trim()) return;
    try {
      await fetch('/api/admin/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          content,
          reply_to_id: replyTo?.id || null,
        }),
      });
      setReplyTo(null);
      loadMessages();
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'send message' });
    }
  }

  async function handleReact(messageId: string, emoji: string) {
    try {
      await fetch('/api/admin/messages/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId, emoji }),
      });
      loadMessages();
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'add reaction' });
    }
  }

  async function handleDelete(messageId: string) {
    if (!confirm('Delete this message?')) return;
    try {
      await fetch(`/api/admin/messages/send?id=${messageId}`, { method: 'DELETE' });
      loadMessages();
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'delete message' });
    }
  }

  function handleReply(messageId: string) {
    const msg = messages.find(m => m.id === messageId);
    if (msg) {
      setReplyTo({
        id: msg.id,
        senderName: getDisplayName(msg.sender_email),
        content: msg.content,
      });
    }
  }

  if (!session?.user) return null;
  const currentEmail = session.user.email || '';

  // Derive conversation title
  const title = conversation?.title ||
    (conversation?.type === 'direct'
      ? getDisplayName(participants.find(p => p.user_email !== currentEmail)?.user_email || '')
      : participants.filter(p => p.user_email !== currentEmail).map(p => getDisplayName(p.user_email)).join(', ')) || 'Conversation';

  // Group messages by date for date separators
  function getDateLabel(dateStr: string): string {
    const d = new Date(dateStr);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  }

  let lastDate = '';

  return (
    <>
      <UnderConstruction
        feature="Conversation Thread"
        description="Real-time messaging thread with message history, reactions, replies, file sharing, and read receipts."
      />

      {/* Conversation Header */}
      {conversation && (
        <ConversationHeader
          title={title}
          type={conversation.type}
          participants={participants}
          currentUserEmail={currentEmail}
          onBack={() => router.push('/admin/messages')}
          onSearch={() => setShowSearch(!showSearch)}
          onInfo={() => setShowInfo(!showInfo)}
          onArchive={async () => {
            try {
              await fetch('/api/admin/messages/conversations', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: conversationId, is_archived: true }),
              });
              router.push('/admin/messages');
            } catch (err) {
              reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'archive conversation' });
            }
          }}
        />
      )}

      {/* Search overlay */}
      {showSearch && (
        <MessageSearch
          conversationId={conversationId}
          onClose={() => setShowSearch(false)}
        />
      )}

      {/* Info panel */}
      {showInfo && (
        <div className="msg-info-panel">
          <h4 className="msg-info-panel__title">Conversation Info</h4>
          <div className="msg-info-panel__section">
            <h5>Participants ({participants.length})</h5>
            {participants.map(p => (
              <div key={p.user_email} className="msg-info-panel__member">
                <span className="msg-info-panel__member-avatar">{getDisplayName(p.user_email).charAt(0)}</span>
                <div>
                  <div className="msg-info-panel__member-name">{getDisplayName(p.user_email)}</div>
                  <div className="msg-info-panel__member-email">{p.user_email}</div>
                </div>
                {p.role !== 'member' && <span className="msg-info-panel__member-role">{p.role}</span>}
              </div>
            ))}
          </div>
          <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setShowInfo(false)}>Close</button>
        </div>
      )}

      {/* Messages area */}
      <div className="msg-thread">
        {loading && (
          <div className="msg-thread__loading">Loading messages...</div>
        )}

        {!loading && messages.length === 0 && (
          <div className="msg-thread__empty">
            <span style={{ fontSize: '2rem' }}>💬</span>
            <p>No messages yet. Send the first message!</p>
          </div>
        )}

        {messages.map((msg) => {
          const dateLabel = getDateLabel(msg.created_at);
          const showDateSep = dateLabel !== lastDate;
          lastDate = dateLabel;

          return (
            <div key={msg.id}>
              {showDateSep && (
                <div className="msg-thread__date-sep">
                  <span>{dateLabel}</span>
                </div>
              )}
              <MessageBubble
                id={msg.id}
                content={msg.content}
                senderEmail={msg.sender_email}
                senderName={getDisplayName(msg.sender_email)}
                timestamp={msg.created_at}
                isOwn={msg.sender_email === currentEmail}
                messageType={msg.message_type}
                attachments={msg.attachments}
                reactions={msg.reactions}
                isEdited={msg.is_edited}
                replyTo={msg.reply_to_id ? (() => {
                  const parent = messages.find(m => m.id === msg.reply_to_id);
                  return parent ? { content: parent.content, senderName: getDisplayName(parent.sender_email) } : null;
                })() : null}
                onReact={handleReact}
                onReply={handleReply}
                onDelete={handleDelete}
              />
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose Box */}
      <ComposeBox
        onSend={handleSend}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />

      {/* Setup Guide */}
      <div className="msg-setup-guide">
        <h2 className="msg-setup-guide__title">Conversation Thread — Development Guide</h2>

        <div className="msg-setup-guide__section">
          <h3>Current Capabilities</h3>
          <ul className="msg-setup-guide__list">
            <li>Loads conversation metadata and participant list</li>
            <li>Fetches and displays message history in chronological order</li>
            <li>Date separators between messages on different days</li>
            <li>Send new text messages via ComposeBox</li>
            <li>Reply to specific messages (reply_to_id)</li>
            <li>Emoji reactions on messages</li>
            <li>Delete own messages (soft delete)</li>
            <li>Auto-scroll to latest message</li>
            <li>Mark all messages as read when viewing</li>
            <li>Polls every 5 seconds for new messages</li>
            <li>Conversation info panel with participant list</li>
            <li>Search within this conversation</li>
            <li>Archive conversation</li>
          </ul>
        </div>

        <div className="msg-setup-guide__section">
          <h3>Continuation Prompt for This Page</h3>
          <pre className="msg-setup-guide__prompt">{`Improve the conversation thread page at /admin/messages/[conversationId]/page.tsx. Current state: messages load and display with MessageBubble component, ComposeBox handles input, 5-second polling for new messages, reply threading, emoji reactions, soft delete, date separators, read receipts, and conversation info panel.

NEXT STEPS:
1. Replace 5-second polling with Supabase Realtime: subscribe to INSERT on messages table WHERE conversation_id matches. Use useEffect cleanup to unsubscribe.
2. Add file attachment support: when ComposeBox passes files, upload to Supabase Storage bucket "message-attachments", get public URL, and include in message attachments array.
3. Add typing indicator: use Supabase Realtime Presence to broadcast typing state. Show "X is typing..." below the message list.
4. Add infinite scroll: load older messages when user scrolls to top (use the "before" cursor parameter on the GET API).
5. Add message editing: when onEdit is called, put the compose box into edit mode with the existing content pre-filled.
6. Add read receipt display: show small avatars or "Read by X" under the last message in the thread.
7. Add link preview: detect URLs in message content and render Open Graph preview cards.
8. Optimize re-renders: use React.memo on MessageBubble, memoize message list.`}</pre>
        </div>
      </div>
    </>
  );
}
