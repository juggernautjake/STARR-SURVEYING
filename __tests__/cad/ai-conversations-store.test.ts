// Pure helpers for the consolidated AI chat store: tab auto-titling and
// choosing the next active tab when one is closed.

import { describe, it, expect } from 'vitest';
import {
  deriveConversationTitle,
  pickNextActiveId,
  type Conversation,
} from '@/lib/cad/store/ai-conversations-store';

function conv(id: string): Conversation {
  return { id, title: id, titleIsAuto: true, scope: null, messages: [], createdAt: '' };
}

describe('deriveConversationTitle', () => {
  it('prefers the scope when present', () => {
    expect(deriveConversationTitle('what is this?', 'LINE #ab12')).toBe('LINE #ab12');
  });

  it('falls back to the first message, collapsed to one line', () => {
    expect(deriveConversationTitle('  How   long\nis this line?  ')).toBe('How long is this line?');
  });

  it('truncates long titles with an ellipsis', () => {
    const long = 'a'.repeat(80);
    const title = deriveConversationTitle(long);
    expect(title.length).toBe(40);
    expect(title.endsWith('…')).toBe(true);
  });

  it('returns a sensible default for empty input', () => {
    expect(deriveConversationTitle('   ')).toBe('New chat');
  });
});

describe('pickNextActiveId', () => {
  const list = [conv('a'), conv('b'), conv('c')];

  it('leaves the active tab unchanged when a different tab closes', () => {
    expect(pickNextActiveId(list, 'c', 'a')).toBe('a');
  });

  it('selects the neighbour that slides into the closed index', () => {
    // Closing 'b' (index 1) → remaining [a, c]; index 1 → 'c'.
    expect(pickNextActiveId(list, 'b', 'b')).toBe('c');
    // Closing the last 'c' (index 2) → remaining [a, b]; clamps to 'b'.
    expect(pickNextActiveId(list, 'c', 'c')).toBe('b');
  });

  it('returns null when the last tab closes', () => {
    expect(pickNextActiveId([conv('only')], 'only', 'only')).toBeNull();
  });
});
