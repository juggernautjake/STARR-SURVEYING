import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { capForBucket, filterAnnouncements } from '@/lib/hub/widgets/recent-announcements';

describe('recent-announcements widget — registry', () => {
  it('registers in communication category as a universal widget', () => {
    const def = getWidget('recent-announcements');
    expect(def?.category).toBe('communication');
    expect(def?.allowedRoles).toEqual([]);
  });
});

describe('recent-announcements — capForBucket', () => {
  it('returns expected counts per bucket', () => {
    expect(capForBucket('tiny')).toBe(1);
    expect(capForBucket('small')).toBe(2);
    expect(capForBucket('medium')).toBe(3);
    expect(capForBucket('large')).toBe(5);
    expect(capForBucket('xlarge')).toBe(10);
  });
});

describe('recent-announcements — filterAnnouncements', () => {
  const list = [
    { id: 'a', title: 'Read', created_at: '2026-05-01', unread: false },
    { id: 'b', title: 'Unread', created_at: '2026-05-02', unread: true },
  ];
  it('passthrough when unreadOnly=false', () => {
    expect(filterAnnouncements(list, { unreadOnly: false }).map((a) => a.id)).toEqual(['a', 'b']);
  });
  it('keeps only unread when unreadOnly=true', () => {
    expect(filterAnnouncements(list, { unreadOnly: true }).map((a) => a.id)).toEqual(['b']);
  });
});
