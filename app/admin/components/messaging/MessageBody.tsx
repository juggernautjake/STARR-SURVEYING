// app/admin/components/messaging/MessageBody.tsx
// Renders a message's content. Formatted pastes (HTML) are sanitized and rendered
// as rich text; plain text has its bare URLs linkified. Every link — pasted or
// linkified — is forced to open in a NEW TAB (target=_blank, rel=noopener).
'use client';

import DOMPurify from 'dompurify';
import { MESSAGE_SANITIZE_CONFIG, looksLikeHtml, linkifyPlainText } from '@/lib/messages/rich-text';

// Force every anchor to open safely in a new browser tab. Registered once on the
// client-side DOMPurify instance; runs for every sanitize() call below.
let hookAdded = false;
function ensureLinkHook() {
  if (hookAdded || typeof window === 'undefined') return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if ((node as Element).tagName === 'A') {
      (node as Element).setAttribute('target', '_blank');
      (node as Element).setAttribute('rel', 'noopener noreferrer');
    }
  });
  hookAdded = true;
}

export default function MessageBody({ content }: { content: string }) {
  ensureLinkHook();
  const raw = content || '';
  // Rich paste → sanitize as-is; plain text → escape + linkify bare URLs.
  const html = looksLikeHtml(raw) ? raw : linkifyPlainText(raw);
  const clean = DOMPurify.sanitize(html, MESSAGE_SANITIZE_CONFIG);
  return <span className="msg-rich" dangerouslySetInnerHTML={{ __html: clean }} />;
}
