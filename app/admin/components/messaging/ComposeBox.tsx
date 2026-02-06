// app/admin/components/messaging/ComposeBox.tsx
'use client';
import { useState, useRef, KeyboardEvent, ChangeEvent } from 'react';

interface ComposeBoxProps {
  onSend: (content: string, attachments?: File[]) => void;
  replyTo?: { id: string; senderName: string; content: string } | null;
  onCancelReply?: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function ComposeBox({ onSend, replyTo, onCancelReply, placeholder = 'Type a message...', disabled = false }: ComposeBoxProps) {
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const QUICK_EMOJIS = ['😀', '😂', '😍', '🤔', '👍', '👎', '🎉', '🔥', '❤️', '💯', '✅', '❌', '📋', '📌', '🗺️', '📐'];

  function handleSend() {
    const trimmed = message.trim();
    if (!trimmed && attachments.length === 0) return;
    onSend(trimmed, attachments.length > 0 ? attachments : undefined);
    setMessage('');
    setAttachments([]);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files) {
      setAttachments(prev => [...prev, ...Array.from(files)]);
    }
    e.target.value = '';
  }

  function removeAttachment(idx: number) {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  }

  function insertEmoji(emoji: string) {
    setMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  }

  // Auto-resize textarea
  function handleInput(e: ChangeEvent<HTMLTextAreaElement>) {
    setMessage(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
  }

  return (
    <div className="msg-compose">
      {/* Reply indicator */}
      {replyTo && (
        <div className="msg-compose__reply">
          <div className="msg-compose__reply-info">
            <span className="msg-compose__reply-label">Replying to</span>
            <span className="msg-compose__reply-name">{replyTo.senderName}</span>
            <span className="msg-compose__reply-preview">{replyTo.content.substring(0, 60)}</span>
          </div>
          <button className="msg-compose__reply-cancel" onClick={onCancelReply}>✕</button>
        </div>
      )}

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="msg-compose__attachments">
          {attachments.map((file, idx) => (
            <div key={idx} className="msg-compose__attachment">
              <span className="msg-compose__attachment-icon">
                {file.type.startsWith('image/') ? '🖼' : '📎'}
              </span>
              <span className="msg-compose__attachment-name">{file.name}</span>
              <button className="msg-compose__attachment-remove" onClick={() => removeAttachment(idx)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="msg-compose__input-row">
        <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileChange} />

        <button className="msg-compose__tool-btn" onClick={() => fileInputRef.current?.click()} title="Attach file" disabled={disabled}>
          📎
        </button>

        <div className="msg-compose__emoji-wrapper" style={{ position: 'relative' }}>
          <button className="msg-compose__tool-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)} title="Emoji" disabled={disabled}>
            😊
          </button>
          {showEmojiPicker && (
            <div className="msg-compose__emoji-picker">
              {QUICK_EMOJIS.map(emoji => (
                <button key={emoji} className="msg-compose__emoji-option" onClick={() => insertEmoji(emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <textarea
          ref={textareaRef}
          className="msg-compose__textarea"
          value={message}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
        />

        <button
          className={`msg-compose__send-btn ${message.trim() || attachments.length > 0 ? 'msg-compose__send-btn--active' : ''}`}
          onClick={handleSend}
          disabled={disabled || (!message.trim() && attachments.length === 0)}
          title="Send (Enter)"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
