// __tests__/hub/widgets/messages.test.ts
//
// Slice 109 — Messages widget helpers + registry round-trip.

import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import {
  capForBucket,
  filterConversations,
} from '@/lib/hub/widgets/messages';

describe('messages widget — registry', () => {
  it('registers under id "messages" in communication category', () => {
    const def = getWidget('messages');
    expect(def).toBeDefined();
    expect(def?.id).toBe('messages');
    expect(def?.category).toBe('communication');
    expect(def?.iconName).toBe('MessageSquare');
  });

  it('only internal roles can add it (no student/teacher)', () => {
    const def = getWidget('messages');
    expect(def?.allowedRoles).toEqual([
      'admin', 'developer', 'field_crew', 'drawer', 'researcher', 'equipment_manager', 'tech_support',
    ]);
  });

  it('default size 4×3, min 3×2, max 8×6', () => {
    const def = getWidget('messages');
    expect(def?.defaultSize).toEqual({ w: 4, h: 3 });
    expect(def?.minSize).toEqual({ w: 3, h: 2 });
    expect(def?.maxSize).toEqual({ w: 8, h: 6 });
  });

  it('default content opts in to groups + preview, opts out of mark-read', () => {
    const def = getWidget('messages');
    const c = def?.defaultContent as { includeGroups: boolean; showPreview: boolean; markAsReadOnView: boolean };
    expect(c.includeGroups).toBe(true);
    expect(c.showPreview).toBe(true);
    expect(c.markAsReadOnView).toBe(false);
  });
});

describe('messages — capForBucket', () => {
  it('tiny → 3', () => { expect(capForBucket('tiny')).toBe(3); });
  it('small → 5', () => { expect(capForBucket('small')).toBe(5); });
  it('medium → 8', () => { expect(capForBucket('medium')).toBe(8); });
  it('large → 12', () => { expect(capForBucket('large')).toBe(12); });
  it('xlarge → 20', () => { expect(capForBucket('xlarge')).toBe(20); });
});

describe('messages — filterConversations', () => {
  const list = [
    { id: 'a', is_group: false, is_external: false },
    { id: 'b', is_group: true,  is_external: false },
    { id: 'c', is_group: false, is_external: true },
    { id: 'd', is_group: true,  is_external: true },
  ];

  it('with defaults keeps every conversation', () => {
    const out = filterConversations(list, { includeGroups: true, senderFilter: 'any' });
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('drops groups when includeGroups=false', () => {
    const out = filterConversations(list, { includeGroups: false, senderFilter: 'any' });
    expect(out.map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('team-only drops external conversations', () => {
    const out = filterConversations(list, { includeGroups: true, senderFilter: 'team-only' });
    expect(out.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('external-only keeps only external conversations', () => {
    const out = filterConversations(list, { includeGroups: true, senderFilter: 'external-only' });
    expect(out.map((x) => x.id)).toEqual(['c', 'd']);
  });

  it('combinations stack (no groups + team-only)', () => {
    const out = filterConversations(list, { includeGroups: false, senderFilter: 'team-only' });
    expect(out.map((x) => x.id)).toEqual(['a']);
  });
});
