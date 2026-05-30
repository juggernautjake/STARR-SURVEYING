import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { capForBucket, toDiscussion } from '@/lib/hub/widgets/open-discussions';

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

describe('open-discussions — toDiscussion (R1: real discussion_threads shape)', () => {
  it('maps id/title/status/created_at + strips the "[Discussion]" prefix', () => {
    expect(toDiscussion({
      id: 't1', title: '[Discussion] Boundary dispute', status: 'open', created_at: '2026-05-30T10:00:00Z',
    })).toEqual({
      id: 't1', title: 'Boundary dispute', status: 'open', created_at: '2026-05-30T10:00:00Z',
    });
  });

  it('falls back the title + defaults status to open', () => {
    const d = toDiscussion({ id: 't2' });
    expect(d.title).toBe('Discussion');
    expect(d.status).toBe('open');
    expect(d.created_at).toBeNull();
  });
});
