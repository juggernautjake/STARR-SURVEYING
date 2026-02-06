// app/admin/components/messaging/ConversationHeader.tsx
'use client';
import { useState } from 'react';

interface Participant {
  user_email: string;
  role: string;
}

interface ConversationHeaderProps {
  title: string;
  type: 'direct' | 'group' | 'announcement';
  participants: Participant[];
  currentUserEmail: string;
  onBack: () => void;
  onSearch?: () => void;
  onInfo?: () => void;
  onArchive?: () => void;
}

function getDisplayName(email: string): string {
  return email.split('@')[0]
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\./g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function ConversationHeader({
  title, type, participants, currentUserEmail,
  onBack, onSearch, onInfo, onArchive,
}: ConversationHeaderProps) {
  const [showMenu, setShowMenu] = useState(false);

  const otherParticipants = participants.filter(p => p.user_email !== currentUserEmail);
  const subtitle = type === 'direct'
    ? otherParticipants[0]?.user_email || ''
    : `${participants.length} members`;

  return (
    <div className="msg-header">
      <button className="msg-header__back" onClick={onBack}>
        &larr;
      </button>
      <div className="msg-header__info">
        <h3 className="msg-header__title">{title}</h3>
        <span className="msg-header__subtitle">{subtitle}</span>
      </div>
      <div className="msg-header__actions">
        <button className="msg-header__action" onClick={onSearch} title="Search">🔍</button>
        <button className="msg-header__action" onClick={onInfo} title="Info">ℹ️</button>
        <div style={{ position: 'relative' }}>
          <button className="msg-header__action" onClick={() => setShowMenu(!showMenu)} title="More">⋮</button>
          {showMenu && (
            <div className="msg-header__menu">
              <button className="msg-header__menu-item" onClick={() => { onArchive?.(); setShowMenu(false); }}>Archive</button>
              <button className="msg-header__menu-item" onClick={() => setShowMenu(false)}>Mute</button>
              <button className="msg-header__menu-item" onClick={() => setShowMenu(false)}>Pin</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
