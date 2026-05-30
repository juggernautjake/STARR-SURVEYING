// __tests__/notifications/drawing-note-recipients.test.ts
//
// drawings-collaboration Slice 3 — locks the pure recipient resolver
// that picks who gets pinged when someone leaves a note on a drawing.

import { describe, it, expect } from 'vitest';
import { resolveNoteRecipients } from '@/lib/notifications/drawing-note-recipients';

describe('resolveNoteRecipients', () => {
  it('explicit list wins, deduped + lowercased', () => {
    expect(resolveNoteRecipients({
      explicit: ['DRAWER@x.com', ' rpls@x.com ', 'drawer@x.com'],
      assignee: 'someone-else@x.com',
      scope: ['team@x.com'],
      author: 'author@x.com',
    })).toEqual(['drawer@x.com', 'rpls@x.com']);
  });

  it('always excludes the author (case-insensitive)', () => {
    expect(resolveNoteRecipients({
      explicit: ['Author@x.com', 'drawer@x.com'],
      author: 'author@x.com',
      scope: [],
    })).toEqual(['drawer@x.com']);
  });

  it('falls back to assignee + scope when no explicit list', () => {
    expect(resolveNoteRecipients({
      assignee: 'drawer@x.com',
      scope: ['rpls@x.com', 'pm@x.com'],
      author: 'rpls@x.com',
    })).toEqual(['drawer@x.com', 'pm@x.com']);
  });

  it('puts the assignee first, then the scope cohort', () => {
    expect(resolveNoteRecipients({
      assignee: 'drawer@x.com',
      scope: ['a@x.com', 'b@x.com'],
      author: 'author@x.com',
    })).toEqual(['drawer@x.com', 'a@x.com', 'b@x.com']);
  });

  it('returns [] when there is no one left to notify', () => {
    expect(resolveNoteRecipients({
      assignee: null,
      scope: [],
      author: 'author@x.com',
    })).toEqual([]);
    expect(resolveNoteRecipients({
      assignee: 'author@x.com', // same as author
      scope: [],
      author: 'author@x.com',
    })).toEqual([]);
  });

  it('treats an empty explicit list the same as omitted (fallback fires)', () => {
    expect(resolveNoteRecipients({
      explicit: [],
      assignee: 'drawer@x.com',
      scope: [],
      author: 'author@x.com',
    })).toEqual(['drawer@x.com']);
  });
});
