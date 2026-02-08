// app/admin/components/Fieldbook.tsx — Floating fieldbook with rich text, emoji, and media
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';

interface FieldbookEntry {
  id: string;
  content: string;
  context_label: string;
  context_path: string;
  created_at: string;
  attachments?: { name: string; url: string; type: string }[];
}

const QUICK_EMOJIS = ['📌', '⭐', '❗', '✅', '❌', '🔍', '💡', '📐', '🗺️', '📋', '🎯', '⚠️', '📷', '🔧', '💬', '🏗️'];

const FORMAT_BUTTONS = [
  { label: 'B', style: 'bold', tag: '**' },
  { label: 'I', style: 'italic', tag: '*' },
  { label: 'U', style: 'underline', tag: '__' },
  { label: '•', style: 'list', tag: '- ' },
  { label: '#', style: 'heading', tag: '### ' },
];

function getContextFromPath(pathname: string): { type: string; label: string } {
  if (pathname.includes('/learn/modules/') && pathname.split('/').length >= 7)
    return { type: 'lesson', label: 'Lesson' };
  if (pathname.includes('/learn/modules/') && pathname.includes('/quiz'))
    return { type: 'quiz', label: 'Lesson Quiz' };
  if (pathname.includes('/learn/modules/') && pathname.includes('/test'))
    return { type: 'test', label: 'Module Test' };
  if (pathname.includes('/learn/modules/'))
    return { type: 'module', label: 'Module' };
  if (pathname.includes('/learn/knowledge-base/'))
    return { type: 'article', label: 'KB Article' };
  if (pathname.includes('/learn/flashcards/'))
    return { type: 'flashcards', label: 'Flashcards' };
  if (pathname.includes('/learn/exam-prep/sit'))
    return { type: 'sit_prep', label: 'SIT Exam Prep' };
  if (pathname.includes('/learn/exam-prep/rpls'))
    return { type: 'rpls_prep', label: 'RPLS Exam Prep' };
  if (pathname.includes('/learn'))
    return { type: 'learning', label: 'Learning Hub' };
  if (pathname.includes('/dashboard'))
    return { type: 'dashboard', label: 'Dashboard' };
  return { type: 'general', label: 'Admin Panel' };
}

export default function Fieldbook() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState<FieldbookEntry[]>([]);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const context = getContextFromPath(pathname);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/learn/fieldbook?limit=20');
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (isOpen) fetchEntries();
  }, [isOpen, fetchEntries]);

  /** Insert text formatting at cursor position */
  function applyFormat(tag: string, style: string) {
    const ta = textareaRef.current;
    if (!ta) return;

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = noteText.slice(start, end);

    let replacement = '';
    if (style === 'list' || style === 'heading') {
      // Prefix-style: add at start of line
      replacement = tag + selected;
    } else {
      // Wrap-style: surround selection
      replacement = tag + (selected || 'text') + tag;
    }

    const newText = noteText.slice(0, start) + replacement + noteText.slice(end);
    setNoteText(newText);

    // Restore cursor after state update
    setTimeout(() => {
      ta.focus();
      const newPos = start + replacement.length;
      ta.setSelectionRange(newPos, newPos);
    }, 0);
  }

  /** Insert emoji at cursor */
  function insertEmoji(emoji: string) {
    const ta = textareaRef.current;
    const pos = ta?.selectionStart || noteText.length;
    const newText = noteText.slice(0, pos) + emoji + noteText.slice(pos);
    setNoteText(newText);
    setShowEmoji(false);
    setTimeout(() => { ta?.focus(); ta?.setSelectionRange(pos + emoji.length, pos + emoji.length); }, 0);
  }

  /** Handle file attachment */
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files) setAttachments(prev => [...prev, ...Array.from(files)]);
    e.target.value = '';
  }

  function removeAttachment(idx: number) {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  }

  async function saveNote() {
    if (!noteText.trim() && attachments.length === 0) return;
    setSaving(true);
    try {
      // Convert attachments to base64 data URLs for storage
      const attachmentData = await Promise.all(
        attachments.map(async (file) => {
          const reader = new FileReader();
          const dataUrl = await new Promise<string>((resolve) => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
          return { name: file.name, url: dataUrl, type: file.type };
        })
      );

      const res = await fetch('/api/admin/learn/fieldbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: noteText.trim(),
          context_type: context.type,
          context_label: context.label,
          context_path: pathname,
          content_format: 'rich_text',
          attachments: attachmentData.length > 0 ? attachmentData : undefined,
        }),
      });
      if (res.ok) {
        setNoteText('');
        setAttachments([]);
        fetchEntries();
      }
    } catch { /* silent */ }
    finally { setSaving(false); }
  }

  // Don't show on login page
  if (pathname === '/admin/login') return null;

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <div className="fieldbook-fab-wrap">
          <span className="fieldbook-fab-tooltip">Write in Fieldbook</span>
          <button className="fieldbook-fab" onClick={() => setIsOpen(true)} aria-label="Write in Fieldbook">
            📓
          </button>
        </div>
      )}

      {/* Panel */}
      {isOpen && (
        <div className="fieldbook-panel">
          <div className="fieldbook-panel__header">
            <span className="fieldbook-panel__title">📓 My Fieldbook</span>
            <button className="fieldbook-panel__close" onClick={() => setIsOpen(false)}>✕</button>
          </div>

          <div className="fieldbook-panel__context">
            📍 Currently on: <strong>{context.label}</strong> — {pathname}
            <br />
            🕐 {new Date().toLocaleString()}
          </div>

          <div className="fieldbook-panel__body">
            <div className="fieldbook-panel__entries">
              {entries.length === 0 && (
                <p style={{ fontFamily: 'Inter,sans-serif', fontSize: '.85rem', color: '#9CA3AF', textAlign: 'center', padding: '1rem 0' }}>
                  No notes yet. Start writing!
                </p>
              )}
              {entries.map((entry) => (
                <div key={entry.id} className="fieldbook-panel__entry">
                  <div className="fieldbook-panel__entry-date">
                    {new Date(entry.created_at).toLocaleString()}
                  </div>
                  <div className="fieldbook-panel__entry-context">
                    📍 {entry.context_label} — {entry.context_path}
                  </div>
                  <div className="fieldbook-panel__entry-text">{entry.content}</div>
                  {/* Show attachments if present */}
                  {entry.attachments && entry.attachments.length > 0 && (
                    <div className="fieldbook-panel__entry-attachments">
                      {entry.attachments.map((att, i) => (
                        <div key={i} className="fieldbook-panel__attachment">
                          {att.type?.startsWith('image/') ? (
                            <img src={att.url} alt={att.name} className="fieldbook-panel__attachment-img" />
                          ) : (
                            <span className="fieldbook-panel__attachment-file">📎 {att.name}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Formatting toolbar */}
          <div className="fieldbook-panel__toolbar">
            {FORMAT_BUTTONS.map(btn => (
              <button
                key={btn.style}
                className="fieldbook-panel__toolbar-btn"
                onClick={() => applyFormat(btn.tag, btn.style)}
                title={btn.style.charAt(0).toUpperCase() + btn.style.slice(1)}
                style={btn.style === 'bold' ? { fontWeight: 700 } : btn.style === 'italic' ? { fontStyle: 'italic' } : btn.style === 'underline' ? { textDecoration: 'underline' } : undefined}
              >
                {btn.label}
              </button>
            ))}
            <span className="fieldbook-panel__toolbar-sep" />
            <button
              className="fieldbook-panel__toolbar-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Attach file or image"
            >
              📎
            </button>
            <div style={{ position: 'relative' }}>
              <button
                className="fieldbook-panel__toolbar-btn"
                onClick={() => setShowEmoji(!showEmoji)}
                title="Insert emoji"
              >
                😊
              </button>
              {showEmoji && (
                <div className="fieldbook-panel__emoji-picker">
                  {QUICK_EMOJIS.map(emoji => (
                    <button key={emoji} onClick={() => insertEmoji(emoji)}>{emoji}</button>
                  ))}
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.txt"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>

          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="fieldbook-panel__attachments-preview">
              {attachments.map((file, idx) => (
                <div key={idx} className="fieldbook-panel__attach-item">
                  <span>{file.type.startsWith('image/') ? '🖼' : '📎'} {file.name}</span>
                  <button onClick={() => removeAttachment(idx)}>✕</button>
                </div>
              ))}
            </div>
          )}

          <div className="fieldbook-panel__input-area">
            <textarea
              ref={textareaRef}
              className="fieldbook-panel__textarea"
              placeholder="Write a note... (Ctrl+Enter to save)"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) saveNote(); }}
            />
            <button
              className="fieldbook-panel__save-btn"
              onClick={saveNote}
              disabled={saving || (!noteText.trim() && attachments.length === 0)}
            >
              {saving ? '...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
