import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import {
  capForBucket,
  filterAnnouncements,
  toAnnouncement,
  notesPreview,
} from '@/lib/hub/widgets/recent-announcements';

describe('recent-announcements — toAnnouncement (R1: real releases shape)', () => {
  it('maps version/release_type/notes_markdown/published_at', () => {
    expect(toAnnouncement({
      id: 'r1', version: '4.8', release_type: 'feature',
      notes_markdown: '# Big update\nNew hub widgets shipped.',
      published_at: '2026-05-30T00:00:00Z',
    })).toEqual({
      id: 'r1', title: 'Feature · v4.8', body: 'Big update', author: null,
      created_at: '2026-05-30T00:00:00Z', unread: undefined,
    });
  });

  it('omits the type prefix + defaults the version', () => {
    expect(toAnnouncement({ id: 'r2' }).title).toBe('v—');
  });
});

describe('notesPreview', () => {
  it('takes the first meaningful line, stripped of markdown', () => {
    expect(notesPreview('## Heading\n\n**Bold** detail here')).toBe('Heading');
    expect(notesPreview('')).toBe('');
  });
});

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
