'use client';
// app/admin/leads/[id]/ReplyDialog.tsx
//
// lead-reply-2026-06-18 — full email composer that pops over the lead
// detail page. The Reply button on the page opens this dialog with the
// customer's email prefilled. Composer surface:
//   - To / Subject inputs
//   - Lightweight WYSIWYG: B / I / U, ordered + unordered lists,
//     create/remove link, hard rule, blockquote
//   - Emoji palette (reuses the messenger's QUICK_EMOJIS pattern)
//   - File attachments
//   - Send / Cancel
//
// The rich text editor uses a contentEditable div + document.execCommand
// for the toolbar buttons. That's the deprecated-but-universally-
// supported path; sufficient for "write a polite email with some
// formatting and an attachment" without pulling in TipTap / Slate.
// The composed HTML POSTs to /api/admin/leads/{id}/reply as multipart
// so attachment bytes can flow through.

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/app/admin/components/Toast';

const QUICK_EMOJIS = [
  '👍', '✅', '🙏', '🎉', '📋', '📐', '📷', '📎',
  '🗺️', '🏠', '⚡', '⭐', '💬', '📞', '✉️', '🔧',
];

interface ReplyDialogProps {
  leadId: string;
  leadName: string;
  defaultTo: string;
  defaultSubject: string;
  onClose: () => void;
  onSent: () => void;
}

export default function ReplyDialog({
  leadId,
  leadName,
  defaultTo,
  defaultSubject,
  onClose,
  onSent,
}: ReplyDialogProps) {
  const { addToast } = useToast();
  const editorRef = useRef<HTMLDivElement>(null);
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);

  // Seed the editor with a friendly greeting so the surveyor isn't
  // staring at an empty box.
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML === '') {
      const firstName = leadName.split(' ')[0] || 'there';
      editorRef.current.innerHTML = `<p>Hello ${firstName},</p><p></p><p>—<br>Starr Surveying</p>`;
    }
  }, [leadName]);

  function applyFormat(command: string, value?: string) {
    editorRef.current?.focus();
    // execCommand is deprecated but still the simplest way to wire
    // bold / italic / lists in a contentEditable surface. Modern
    // alternatives (TipTap, Slate, Lexical) are heavyweight.
    document.execCommand(command, false, value);
  }

  function insertText(text: string) {
    editorRef.current?.focus();
    document.execCommand('insertText', false, text);
  }

  function insertEmoji(emoji: string) {
    insertText(emoji);
    setShowEmoji(false);
  }

  function handleAttachmentChange(files: FileList | null) {
    if (!files) return;
    const next = [...attachments];
    for (let i = 0; i < files.length; i += 1) next.push(files[i]);
    setAttachments(next);
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  function htmlToPlainText(html: string): string {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
  }

  async function handleSend() {
    if (!to.trim()) {
      addToast('Recipient email is required', 'error');
      return;
    }
    if (!subject.trim()) {
      addToast('Subject is required', 'error');
      return;
    }
    const bodyHtml = editorRef.current?.innerHTML.trim() ?? '';
    if (!bodyHtml) {
      addToast('Reply body is empty', 'error');
      return;
    }
    const bodyText = htmlToPlainText(bodyHtml);

    setSending(true);
    try {
      const fd = new FormData();
      fd.append('to', to.trim());
      fd.append('subject', subject.trim());
      fd.append('bodyHtml', bodyHtml);
      fd.append('bodyText', bodyText);
      for (const f of attachments) fd.append('attachments', f, f.name);

      const res = await fetch(`/api/admin/leads/${encodeURIComponent(leadId)}/reply`, {
        method: 'POST',
        body: fd,
      });

      if (res.ok) {
        addToast('Reply sent', 'success');
        onSent();
        onClose();
      } else {
        let detail = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          if (data?.sendError) detail = String(data.sendError);
          else if (data?.error) detail = String(data.error);
        } catch { /* not JSON */ }
        addToast(`Couldn't send reply — ${detail}`, 'error');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'network error';
      addToast(`Couldn't send reply — ${msg}`, 'error');
    }
    setSending(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reply-dialog-title"
      data-testid="reply-dialog"
      style={overlayStyle}
      onClick={onClose}
    >
      <div
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <header style={headerStyle}>
          <h3 id="reply-dialog-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
            ✉️ Reply to {leadName}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={closeBtnStyle}
          >
            ✕
          </button>
        </header>

        <div style={fieldsStyle}>
          <label style={fieldRowStyle}>
            <span style={fieldLabelStyle}>To</span>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={inputStyle}
              data-testid="reply-to"
            />
          </label>
          <label style={fieldRowStyle}>
            <span style={fieldLabelStyle}>Subject</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={inputStyle}
              data-testid="reply-subject"
            />
          </label>
        </div>

        {/* Formatting toolbar */}
        <div style={toolbarStyle} role="toolbar" aria-label="Formatting">
          <ToolbarBtn label="Bold" glyph="B" onClick={() => applyFormat('bold')} bold />
          <ToolbarBtn label="Italic" glyph="I" onClick={() => applyFormat('italic')} italic />
          <ToolbarBtn label="Underline" glyph="U" onClick={() => applyFormat('underline')} underline />
          <ToolbarSep />
          <ToolbarBtn label="Bullet list" glyph="• ☰" onClick={() => applyFormat('insertUnorderedList')} />
          <ToolbarBtn label="Numbered list" glyph="1. ☰" onClick={() => applyFormat('insertOrderedList')} />
          <ToolbarBtn
            label="Link"
            glyph="🔗"
            onClick={() => {
              const url = window.prompt('Link URL', 'https://');
              if (url) applyFormat('createLink', url);
            }}
          />
          <ToolbarBtn label="Unlink" glyph="↺🔗" onClick={() => applyFormat('unlink')} />
          <ToolbarSep />
          <ToolbarBtn
            label="Quote"
            glyph="❝"
            onClick={() => applyFormat('formatBlock', 'blockquote')}
          />
          <ToolbarBtn
            label="Horizontal rule"
            glyph="—"
            onClick={() => applyFormat('insertHorizontalRule')}
          />
          <ToolbarSep />
          <div style={{ position: 'relative' }}>
            <ToolbarBtn
              label="Emoji"
              glyph="😊"
              onClick={() => setShowEmoji((v) => !v)}
              data-testid="reply-emoji-toggle"
            />
            {showEmoji && (
              <div
                style={emojiPanelStyle}
                data-testid="reply-emoji-panel"
              >
                {QUICK_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => insertEmoji(e)}
                    style={emojiBtnStyle}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Body editor */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Reply body"
          data-testid="reply-editor"
          style={editorStyle}
        />

        {/* Attachments */}
        <div style={attachmentsRowStyle}>
          <label style={{ ...inlineBtnStyle, cursor: 'pointer' }}>
            📎 Add attachments
            <input
              type="file"
              multiple
              hidden
              onChange={(e) => handleAttachmentChange(e.target.files)}
              data-testid="reply-attachments-input"
            />
          </label>
          {attachments.length > 0 && (
            <ul style={attachmentListStyle} data-testid="reply-attachments-list">
              {attachments.map((f, i) => (
                <li key={`${f.name}-${i}`} style={attachmentChipStyle}>
                  <span>📎 {f.name}</span>
                  <span style={{ color: '#6B7280', fontSize: '0.7rem' }}>
                    {(f.size / 1024).toFixed(1)} KB
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => removeAttachment(i)}
                    style={chipRemoveStyle}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Actions */}
        <footer style={footerStyle}>
          <button type="button" onClick={onClose} style={cancelBtnStyle} disabled={sending}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            style={sendBtnStyle}
            disabled={sending}
            data-testid="reply-send"
          >
            {sending ? 'Sending…' : '📨 Send reply'}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── Toolbar primitives ───────────────────────────────────────────────────────
function ToolbarBtn({
  label,
  glyph,
  onClick,
  bold,
  italic,
  underline,
  'data-testid': testId,
}: {
  label: string;
  glyph: string;
  onClick: () => void;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  'data-testid'?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}     // keep selection in editor
      onClick={onClick}
      data-testid={testId}
      style={{
        ...toolbarBtnStyle,
        fontWeight: bold ? 700 : 500,
        fontStyle: italic ? 'italic' : 'normal',
        textDecoration: underline ? 'underline' : 'none',
      }}
    >
      {glyph}
    </button>
  );
}

function ToolbarSep() {
  return <span aria-hidden style={toolbarSepStyle} />;
}

// ── Styles ───────────────────────────────────────────────────────────────────
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9100,
  padding: '1rem',
};
const panelStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: 14,
  boxShadow: '0 24px 48px -16px rgba(15, 23, 42, 0.45)',
  width: 'min(720px, 100%)',
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};
const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0.85rem 1rem',
  borderBottom: '1px solid #E5E7EB',
  background: 'linear-gradient(180deg, #FAFBFF 0%, #FFFFFF 100%)',
};
const closeBtnStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8,
  border: 0, background: 'transparent', cursor: 'pointer',
  color: '#6B7280', fontSize: '1rem',
};
const fieldsStyle: React.CSSProperties = {
  padding: '0.75rem 1rem 0',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};
const fieldRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '70px 1fr',
  alignItems: 'center',
  gap: '0.5rem',
};
const fieldLabelStyle: React.CSSProperties = {
  color: '#6B7280',
  fontSize: '0.78rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};
const inputStyle: React.CSSProperties = {
  padding: '7px 10px',
  borderRadius: 6,
  border: '1px solid #E5E7EB',
  fontSize: '0.9rem',
  fontFamily: 'inherit',
};
const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '0.5rem 1rem',
  borderBottom: '1px solid #F1F5F9',
  borderTop: '1px solid #F1F5F9',
  margin: '0.75rem 0 0',
  background: '#F8FAFC',
  flexWrap: 'wrap',
};
const toolbarBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 30,
  height: 30,
  padding: '0 8px',
  borderRadius: 6,
  border: '1px solid transparent',
  background: 'transparent',
  color: '#1F2937',
  fontSize: '0.85rem',
  cursor: 'pointer',
};
const toolbarSepStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 1,
  height: 18,
  background: '#E5E7EB',
  margin: '0 4px',
};
const editorStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 220,
  maxHeight: '40vh',
  overflowY: 'auto',
  padding: '1rem',
  fontSize: '0.92rem',
  lineHeight: 1.55,
  color: '#0F172A',
  outline: 'none',
};
const attachmentsRowStyle: React.CSSProperties = {
  padding: '0.5rem 1rem 0',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.45rem',
};
const inlineBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  alignSelf: 'flex-start',
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid #E5E7EB',
  background: 'white',
  fontSize: '0.85rem',
  fontWeight: 600,
  color: '#1F2937',
};
const attachmentListStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};
const attachmentChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderRadius: 999,
  background: '#F1F5F9',
  fontSize: '0.78rem',
  color: '#1F2937',
};
const chipRemoveStyle: React.CSSProperties = {
  width: 16, height: 16,
  borderRadius: 999,
  border: 0,
  background: 'transparent',
  color: '#6B7280',
  cursor: 'pointer',
  fontSize: '0.8rem',
  lineHeight: 1,
};
const emojiPanelStyle: React.CSSProperties = {
  position: 'absolute',
  top: '110%',
  left: 0,
  zIndex: 9101,
  background: 'white',
  border: '1px solid #E5E7EB',
  borderRadius: 8,
  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)',
  padding: '6px',
  display: 'grid',
  gridTemplateColumns: 'repeat(8, 24px)',
  gap: '2px',
};
const emojiBtnStyle: React.CSSProperties = {
  width: 24, height: 24,
  borderRadius: 4,
  border: 0,
  background: 'transparent',
  cursor: 'pointer',
  fontSize: '1rem',
};
const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  padding: '0.85rem 1rem',
  borderTop: '1px solid #E5E7EB',
  background: '#FAFBFF',
};
const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #E5E7EB',
  background: 'white',
  color: '#1F2937',
  fontSize: '0.875rem',
  fontWeight: 600,
  cursor: 'pointer',
};
const sendBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  border: 0,
  background: 'linear-gradient(135deg, #1D3095 0%, #2A41BD 100%)',
  color: 'white',
  fontSize: '0.875rem',
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(29, 48, 149, 0.25)',
};
