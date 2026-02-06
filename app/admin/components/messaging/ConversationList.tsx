// app/admin/components/messaging/ConversationList.tsx
'use client';

interface Participant {
  user_email: string;
  role: string;
}

interface Conversation {
  id: string;
  title: string | null;
  type: 'direct' | 'group' | 'announcement';
  last_message_at: string;
  last_message_preview: string | null;
  is_archived: boolean;
  participants: Participant[];
}

interface ConversationListProps {
  conversations: Conversation[];
  activeId?: string;
  currentUserEmail: string;
  unreadCounts: Record<string, number>;
  onSelect: (id: string) => void;
  loading?: boolean;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getDisplayName(email: string): string {
  return email.split('@')[0]
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\./g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function ConversationList({ conversations, activeId, currentUserEmail, unreadCounts, onSelect, loading = false }: ConversationListProps) {
  function getConversationName(conv: Conversation): string {
    if (conv.title) return conv.title;
    if (conv.type === 'direct') {
      const other = conv.participants.find(p => p.user_email !== currentUserEmail);
      return other ? getDisplayName(other.user_email) : 'Direct Message';
    }
    const names = conv.participants
      .filter(p => p.user_email !== currentUserEmail)
      .slice(0, 3)
      .map(p => getDisplayName(p.user_email));
    return names.join(', ') || 'Group Chat';
  }

  function getAvatar(conv: Conversation): string {
    if (conv.type === 'group' || conv.type === 'announcement') return '👥';
    const other = conv.participants.find(p => p.user_email !== currentUserEmail);
    return other ? getDisplayName(other.user_email).charAt(0).toUpperCase() : '?';
  }

  if (loading) {
    return (
      <div className="msg-conv-list">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="msg-conv-list__item msg-conv-list__item--skeleton">
            <div className="msg-conv-list__avatar-skeleton" />
            <div className="msg-conv-list__info-skeleton">
              <div className="msg-conv-list__name-skeleton" />
              <div className="msg-conv-list__preview-skeleton" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="msg-conv-list msg-conv-list--empty">
        <div className="msg-conv-list__empty-icon">💬</div>
        <p className="msg-conv-list__empty-text">No conversations yet</p>
        <p className="msg-conv-list__empty-sub">Start a new message to begin</p>
      </div>
    );
  }

  return (
    <div className="msg-conv-list">
      {conversations.map(conv => {
        const unread = unreadCounts[conv.id] || 0;
        return (
          <button
            key={conv.id}
            className={`msg-conv-list__item ${activeId === conv.id ? 'msg-conv-list__item--active' : ''} ${unread > 0 ? 'msg-conv-list__item--unread' : ''}`}
            onClick={() => onSelect(conv.id)}
          >
            <div className="msg-conv-list__avatar">
              {conv.type === 'group' || conv.type === 'announcement' ? (
                <span className="msg-conv-list__avatar-group">{getAvatar(conv)}</span>
              ) : (
                <span className="msg-conv-list__avatar-letter">{getAvatar(conv)}</span>
              )}
            </div>
            <div className="msg-conv-list__info">
              <div className="msg-conv-list__top-row">
                <span className="msg-conv-list__name">{getConversationName(conv)}</span>
                <span className="msg-conv-list__time">{timeAgo(conv.last_message_at)}</span>
              </div>
              <div className="msg-conv-list__bottom-row">
                <span className="msg-conv-list__preview">{conv.last_message_preview || 'No messages yet'}</span>
                {unread > 0 && <span className="msg-conv-list__badge">{unread > 99 ? '99+' : unread}</span>}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
