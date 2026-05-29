import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { capForBucket, filterByRange } from '@/lib/hub/widgets/mentions-inbox';

describe('mentions-inbox — registry', () => {
  it('registers in communication category', () => {
    const def = getWidget('mentions-inbox');
    expect(def?.category).toBe('communication');
    expect(def?.iconName).toBe('AtSign');
  });
});

describe('mentions-inbox — capForBucket', () => {
  it('returns expected counts', () => {
    expect(capForBucket('tiny')).toBe(2);
    expect(capForBucket('small')).toBe(4);
    expect(capForBucket('medium')).toBe(6);
    expect(capForBucket('large')).toBe(10);
    expect(capForBucket('xlarge')).toBe(20);
  });
});

describe('mentions-inbox — filterByRange', () => {
  const NOW = Date.parse('2026-05-29T12:00:00Z');
  const list = [
    { id: 'a', message_id: '1', conversation_id: 'c1', created_at: '2026-05-29T08:00:00Z' }, // 4h ago
    { id: 'b', message_id: '2', conversation_id: 'c1', created_at: '2026-05-25T12:00:00Z' }, // 4 days ago
    { id: 'c', message_id: '3', conversation_id: 'c1', created_at: '2026-04-20T12:00:00Z' }, // 39 days
  ];

  it('today keeps last 24h only', () => {
    expect(filterByRange(list, 'today', NOW).map((m) => m.id)).toEqual(['a']);
  });

  it('week keeps last 7 days', () => {
    expect(filterByRange(list, 'week', NOW).map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('month keeps last 30 days', () => {
    expect(filterByRange(list, 'month', NOW).map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('all returns everything', () => {
    expect(filterByRange(list, 'all', NOW).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });
});
