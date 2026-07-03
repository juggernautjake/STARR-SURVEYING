// app/admin/components/messaging/MessageBubble.tsx
'use client';
import { useState } from 'react';
import MessageBody from './MessageBody';
import MediaViewer, { type MediaItem } from '../MediaViewer';

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
  /** Show a read receipt under this bubble (only for my most recent sent one). */
  isLastOwn?: boolean;
  /** Whether at least one other participant has seen this message. */
  seen?: boolean;
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
  attachments = [], reactions = [], isEdited = false, isLastOwn = false, seen = false, replyTo = null,
  onReact, onReply, onEdit, onDelete,
}: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [viewerMedia, setViewerMedia] = useState<MediaItem | null>(null);

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
        {content && <div className="msg-bubble__content"><MessageBody content={content} /></div>}

        {/* Attachments — images/videos open the zoomable viewer, audio plays
            inline, everything else is a download link. */}
        {attachments.length > 0 && (
          <div className="msg-bubble__attachments">
            {attachments.map((att, i) => {
              const t = (att.type || '').toLowerCase();
              if (t.startsWith('image/')) {
                return (
                  <button key={i} type="button" className="msg-bubble__media-thumb"
                    onClick={() => setViewerMedia({ url: att.url, name: att.name, type: att.type })}
                    aria-label={`Open image ${att.name}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={att.url} alt={att.name} className="msg-bubble__image" loading="lazy" />
                  </button>
                );
              }
              if (t.startsWith('video/')) {
                return (
                  <button key={i} type="button" className="msg-bubble__media-thumb msg-bubble__media-thumb--video"
                    onClick={() => setViewerMedia({ url: att.url, name: att.name, type: att.type })}
                    aria-label={`Play video ${att.name}`}>
                    <video src={att.url} className="msg-bubble__image" muted preload="metadata" />
                    <span className="msg-bubble__play" aria-hidden="true">▶</span>
                  </button>
                );
              }
              if (t.startsWith('audio/')) {
                return (
                  <div key={i} className="msg-bubble__audio">
                    <span className="msg-bubble__file-name">{att.name}</span>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <audio src={att.url} controls preload="none" />
                  </div>
                );
              }
              return (
                <a key={i} href={att.url} download={att.name} className="msg-bubble__file" target="_blank" rel="noopener noreferrer">
                  <span className="msg-bubble__file-icon">📎</span>
                  <div className="msg-bubble__file-info">
                    <span className="msg-bubble__file-name">{att.name}</span>
                    <span className="msg-bubble__file-size">{formatFileSize(att.size)}</span>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
      <MediaViewer media={viewerMedia} onClose={() => setViewerMedia(null)} />

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

      {/* Timestamp, edited indicator & read receipt */}
      <div className="msg-bubble__meta">
        <span className="msg-bubble__time">{formatTime(timestamp)}</span>
        {isEdited && <span className="msg-bubble__edited">(edited)</span>}
        {isOwn && isLastOwn && (
          <span className={`msg-bubble__receipt ${seen ? 'msg-bubble__receipt--seen' : ''}`}>
            {seen ? '✓✓ Seen' : '✓ Sent'}
          </span>
        )}
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
