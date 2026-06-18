// __tests__/admin/messenger-notify-fix.test.ts
//
// messenger-notify-fix-2026-06-18 — user reported that:
//   1. Sending a message from the FloatingMessenger silently fails
//      sometimes (the API errored but the UI showed nothing).
//   2. The recipient never got any notification when a new DM came in;
//      they had to open the messenger to see it.
//
// Fix:
//   - app/api/admin/messages/send POST now calls `notifyMany()` on every
//     OTHER participant, wrapped in best-effort try/catch (a notification
//     failure must never block the send).
//   - FloatingMessenger.handleSend surfaces send failures via the global
//     toast.
//   - FloatingMessenger.fetchUnread also pops a "💬 New message" toast
//     when the unread total grows between polls AND the messenger is
//     closed.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('messages/send POST — recipient notification (S/T-2026-06-18)', () => {
  const SRC = read('app/api/admin/messages/send/route.ts');

  it('imports the notifyMany helper', () => {
    expect(SRC).toMatch(/import \{ notifyMany \} from '@\/lib\/notifications'/);
  });

  it('looks up the other participants of the conversation', () => {
    expect(SRC).toMatch(/\.from\('conversation_participants'\)[\s\S]*?\.neq\('user_email', session\.user\.email\)/);
  });

  it("calls notifyMany with a 'message' type + 💬 icon + link to the conversation", () => {
    expect(SRC).toMatch(/await notifyMany\(recipientEmails, \{/);
    expect(SRC).toMatch(/type: 'message'/);
    expect(SRC).toMatch(/icon: '💬'/);
    expect(SRC).toMatch(/link: `\/admin\/messages\?conversation=\$\{encodeURIComponent\(conversation_id\)\}`/);
  });

  it('wraps the notify in try/catch so a notification failure never blocks the send', () => {
    expect(SRC).toMatch(/\/\* notification failure never blocks the send \*\//);
  });

  it('renders the display name + group-chat title suffix in the notification headline', () => {
    expect(SRC).toMatch(/const senderName = displayNameForEmail\(session\.user\.email\)/);
    expect(SRC).toMatch(/conv\?\.type === 'group'/);
  });
});

describe('FloatingMessenger — send-error toast (S/T-2026-06-18)', () => {
  const SRC = read('app/admin/components/FloatingMessenger.tsx');

  it('imports useToast from the global Toast provider', () => {
    expect(SRC).toMatch(/import \{ useToast \} from '@\/app\/admin\/components\/Toast'/);
  });

  it('handleSend toasts the API error body when res.ok is false', () => {
    expect(SRC).toMatch(/addToast\(`Couldn't send message — \$\{detail\}`, 'error'\)/);
  });

  it('handleSend catches network errors and toasts them too', () => {
    expect(SRC).toMatch(/const detail = err instanceof Error \? err\.message : 'network error'/);
  });
});

describe('FloatingMessenger — unread-growth toast (S/T-2026-06-18)', () => {
  const SRC = read('app/admin/components/FloatingMessenger.tsx');

  it('tracks the previous unread count across polls', () => {
    expect(SRC).toMatch(/const prevUnreadRef = useRef<number \| null>\(null\)/);
  });

  it('only toasts after the FIRST successful poll seeds the baseline', () => {
    expect(SRC).toMatch(/if \(prev !== null && nextTotal > prev && !isOpen\)/);
  });

  it("pluralises the toast copy when more than one message landed", () => {
    expect(SRC).toMatch(/delta === 1 \? '💬 New message' : `💬 \$\{delta\} new messages`/);
  });
});
