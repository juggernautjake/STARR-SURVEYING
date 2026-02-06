// app/admin/components/messaging/MessageBubble.tsx
'use client';
import { useState } from 'react';

interface Attachment {
  url: string;
  name: string;
  size: number;
  type: string;
}

interface Reaction {
  emoji: string;
  user_email: string;
}

interface MessageBubbleProps {
  id: string;
  content: string;
  senderEmail: string;
  senderName: string;
  timestamp: string;
  isOwn: boolean;
  messageType: 'text' | 'image' | 'file' | 'system' | 'link';
  attachments?: Attachment[];
  reactions?: Reaction[];
  isEdited?: boolean;
  replyTo?: { content: string; senderName: string } | null;
  onReact?: (messageId: string, emoji: string) => void;
  onReply?: (messageId: string) => void;
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

export default function MessageBubble({
  id, content, senderEmail, senderName, timestamp, isOwn, messageType,
  attachments = [], reactions = [], isEdited = false, replyTo = null,
  onReact, onReply, onEdit, onDelete,
}: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);
  const [showReactions, setShowReactions] = useState(false);

  if (messageType === 'system') {
    return (
      <div className="msg-bubble msg-bubble--system">
        <span className="msg-bubble__system-text">{content}</span>
        <span className="msg-bubble__system-time">{formatTime(timestamp)}</span>
      </div>
    );
  }

  // Group reactions by emoji
  const reactionGroups: Record<string, string[]> = {};
  reactions.forEach(r => {
    if (!reactionGroups[r.emoji]) reactionGroups[r.emoji] = [];
    reactionGroups[r.emoji].push(r.user_email);
  });

  return (
    <div
      className={`msg-bubble ${isOwn ? 'msg-bubble--own' : 'msg-bubble--other'}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowReactions(false); }}
    >
      {/* Sender info (for others' messages) */}
      {!isOwn && (
        <div className="msg-bubble__sender">
          <span className="msg-bubble__avatar">{senderName.charAt(0).toUpperCase()}</span>
          <span className="msg-bubble__sender-name">{senderName}</span>
        </div>
      )}

      {/* Reply reference */}
      {replyTo && (
        <div className="msg-bubble__reply-ref">
          <span className="msg-bubble__reply-ref-name">{replyTo.senderName}</span>
          <span className="msg-bubble__reply-ref-text">{replyTo.content.substring(0, 80)}</span>
        </div>
      )}

      {/* Message content */}
      <div className="msg-bubble__body">
        {messageType === 'image' && attachments.length > 0 && (
          <div className="msg-bubble__image-grid">
            {attachments.filter(a => a.type.startsWith('image/')).map((att, i) => (
              <img key={i} src={att.url} alt={att.name} className="msg-bubble__image" />
            ))}
          </div>
        )}

        <div className="msg-bubble__content">{content}</div>

        {/* File attachments */}
        {attachments.filter(a => !a.type.startsWith('image/')).length > 0 && (
          <div className="msg-bubble__attachments">
            {attachments.filter(a => !a.type.startsWith('image/')).map((att, i) => (
              <a key={i} href={att.url} download={att.name} className="msg-bubble__file">
                <span className="msg-bubble__file-icon">📎</span>
                <div className="msg-bubble__file-info">
                  <span className="msg-bubble__file-name">{att.name}</span>
                  <span className="msg-bubble__file-size">{formatFileSize(att.size)}</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Reactions display */}
      {Object.keys(reactionGroups).length > 0 && (
        <div className="msg-bubble__reactions">
          {Object.entries(reactionGroups).map(([emoji, users]) => (
            <button
              key={emoji}
              className="msg-bubble__reaction"
              onClick={() => onReact?.(id, emoji)}
              title={users.map(e => e.split('@')[0]).join(', ')}
            >
              {emoji} {users.length > 1 ? users.length : ''}
            </button>
          ))}
        </div>
      )}

      {/* Timestamp & edited indicator */}
      <div className="msg-bubble__meta">
        <span className="msg-bubble__time">{formatTime(timestamp)}</span>
        {isEdited && <span className="msg-bubble__edited">(edited)</span>}
      </div>

      {/* Hover actions */}
      {showActions && (
        <div className={`msg-bubble__actions ${isOwn ? 'msg-bubble__actions--left' : 'msg-bubble__actions--right'}`}>
          <button className="msg-bubble__action-btn" onClick={() => setShowReactions(!showReactions)} title="React">😊</button>
          <button className="msg-bubble__action-btn" onClick={() => onReply?.(id)} title="Reply">↩</button>
          {isOwn && <button className="msg-bubble__action-btn" onClick={() => onEdit?.(id)} title="Edit">✏️</button>}
          {isOwn && <button className="msg-bubble__action-btn msg-bubble__action-btn--danger" onClick={() => onDelete?.(id)} title="Delete">🗑</button>}
        </div>
      )}

      {/* Quick reaction picker */}
      {showReactions && (
        <div className="msg-bubble__reaction-picker">
          {QUICK_REACTIONS.map(emoji => (
            <button key={emoji} className="msg-bubble__reaction-option" onClick={() => { onReact?.(id, emoji); setShowReactions(false); }}>
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
