// app/admin/components/messaging/RichMessageInput.tsx
// A contentEditable chat compose box that PRESERVES formatting on paste. When you
// paste formatted/markup text, the HTML is sanitized (MESSAGE_SANITIZE_CONFIG)
// and kept; plain text pastes as plain text. Enter sends, Shift+Enter newlines.
// Shared by the FloatingMessenger popup and the /admin/messages page so both
// behave identically.
'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import DOMPurify from 'dompurify';
import { MESSAGE_SANITIZE_CONFIG } from '@/lib/messages/rich-text';

export interface RichMessageInputHandle {
  /** Sanitized HTML to send (empty string when the box is blank). */
  getHtml: () => string;
  /** Replace the box contents (used to restore a draft after a failed send). */
  setHtml: (html: string) => void;
  clear: () => void;
  focus: () => void;
  /** Insert plain text at the caret (used by the emoji picker). */
  insertText: (text: string) => void;
  isEmpty: () => boolean;
}

interface RichMessageInputProps {
  placeholder?: string;
  className?: string;
  /** Fired on Enter without Shift — send the message. */
  onEnter: () => void;
  /** Fired whenever the content changes; arg is whether the box is now empty. */
  onChange?: (isEmpty: boolean) => void;
}

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, MESSAGE_SANITIZE_CONFIG);
}

const RichMessageInput = forwardRef<RichMessageInputHandle, RichMessageInputProps>(
  function RichMessageInput({ placeholder, className, onEnter, onChange }, ref) {
    const elRef = useRef<HTMLDivElement>(null);

    const isEmpty = () => {
      const el = elRef.current;
      if (!el) return true;
      return (el.textContent ?? '').trim() === '';
    };

    useImperativeHandle(ref, () => ({
      getHtml: () => (isEmpty() ? '' : sanitize(elRef.current?.innerHTML ?? '')),
      setHtml: (html: string) => {
        if (elRef.current) elRef.current.innerHTML = sanitize(html);
        onChange?.(isEmpty());
      },
      clear: () => {
        if (elRef.current) elRef.current.innerHTML = '';
        onChange?.(true);
      },
      focus: () => elRef.current?.focus(),
      insertText: (text: string) => {
        elRef.current?.focus();
        document.execCommand('insertText', false, text);
        onChange?.(isEmpty());
      },
      isEmpty,
    }));

    function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
      e.preventDefault();
      const html = e.clipboardData.getData('text/html');
      const text = e.clipboardData.getData('text/plain');
      if (html && html.trim()) {
        document.execCommand('insertHTML', false, sanitize(html));
      } else if (text) {
        // Preserve line breaks from plain-text pastes too.
        document.execCommand('insertText', false, text);
      }
      onChange?.(isEmpty());
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onEnter();
      }
    }

    return (
      <div
        ref={elRef}
        className={className}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        data-placeholder={placeholder}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onInput={() => onChange?.(isEmpty())}
        suppressContentEditableWarning
      />
    );
  },
);

export default RichMessageInput;
