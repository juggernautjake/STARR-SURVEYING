import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { capForBucket, filterByScope } from '@/lib/hub/widgets/open-discussions';

describe('open-discussions widget — registry', () => {
  it('registers in communication category', () => {
    const def = getWidget('open-discussions');
    expect(def).toBeDefined();
    expect(def?.category).toBe('communication');
  });
});

describe('open-discussions — capForBucket', () => {
  it('returns expected counts per bucket', () => {
    expect(capForBucket('tiny')).toBe(2);
    expect(capForBucket('small')).toBe(4);
    expect(capForBucket('medium')).toBe(6);
    expect(capForBucket('large')).toBe(10);
    expect(capForBucket('xlarge')).toBe(20);
  });
});

describe('open-discussions — filterByScope', () => {
  const list = [
    { id: 'a', unread_count: 2, last_sender_email: 'someone@x', has_mention: false },
    { id: 'b', unread_count: 0, last_sender_email: 'me@x', has_mention: true },
    { id: 'c', unread_count: 1, last_sender_email: 'me@x', has_mention: false },
    { id: 'd', unread_count: 1, last_sender_email: 'them@x', has_mention: true },
  ];

  it('"all" returns the input untouched', () => {
    expect(filterByScope(list, 'all').map((c) => c.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('"mentions" keeps only conversations with has_mention=true', () => {
    expect(filterByScope(list, 'mentions').map((c) => c.id)).toEqual(['b', 'd']);
  });

  it('"mine" requires unread + last sender ≠ current user', () => {
    expect(filterByScope(list, 'mine', 'me@x').map((c) => c.id)).toEqual(['a', 'd']);
  });

  it('"mine" without a currentEmail still drops empty-unread', () => {
    expect(filterByScope(list, 'mine').map((c) => c.id)).toEqual(['a', 'c', 'd']);
  });
});
