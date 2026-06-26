// app/admin/components/messaging/MessageBody.tsx
// Renders a message's content. If the content carries formatting (HTML, e.g. from
// a formatted paste) it's sanitized and rendered as rich text; otherwise it's
// plain text (with line breaks preserved via white-space:pre-wrap on the bubble).
'use client';

import DOMPurify from 'dompurify';
import { MESSAGE_SANITIZE_CONFIG, looksLikeHtml } from '@/lib/messages/rich-text';

export default function MessageBody({ content }: { content: string }) {
  if (content && looksLikeHtml(content)) {
    return (
      <span
        className="msg-rich"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content, MESSAGE_SANITIZE_CONFIG) }}
      />
    );
  }
  return <>{content}</>;
}
