// __tests__/notifications/drawing.test.ts
//
// drawings-collaboration Slice 2 — locks the pure drawing notification
// builders: assigned, due-soon (boundary + overdue), and the
// drawingHref deep-link composer.

import { describe, it, expect } from 'vitest';
import {
  drawingHref,
  buildDrawingAssignedNotification,
  buildDrawingNoteNotification,
  buildDrawingDueReminders,
  DRAWING_DUE_BOUNDARIES,
} from '@/lib/notifications/drawing';

describe('drawingHref', () => {
  it('includes job + drawing when both are present', () => {
    expect(drawingHref('d1', 'j1')).toBe('/admin/cad?job=j1&drawing=d1');
  });
  it('falls back to drawing-only when there is no job', () => {
    expect(drawingHref('d1', null)).toBe('/admin/cad?drawing=d1');
    expect(drawingHref('d1')).toBe('/admin/cad?drawing=d1');
  });
});

describe('buildDrawingAssignedNotification', () => {
  it('composes a friendly assigned payload with the deep link', () => {
    const out = buildDrawingAssignedNotification({
      user_email: 'drawer@x.com', drawing_id: 'd1', drawing_name: 'Boundary stake',
      job_id: 'j1', assigned_by: 'rpls@x.com',
    });
    expect(out).toMatchObject({
      type: 'drawing',
      source_type: 'drawing_assigned',
      source_id: 'd1',
      title: "🎯 You've been assigned Boundary stake",
      link: '/admin/cad?job=j1&drawing=d1',
    });
    expect(out!.body).toContain('rpls@x.com');
  });

  it('falls back to "a drawing" when no name + omits attribution without assigned_by', () => {
    const out = buildDrawingAssignedNotification({
      user_email: 'drawer@x.com', drawing_id: 'd1',
    });
    expect(out!.title).toBe("🎯 You've been assigned a drawing");
    expect(out!.body).toBe('Open the drawing in the CAD editor.');
  });

  it('returns null without a user email or drawing id', () => {
    expect(buildDrawingAssignedNotification({ user_email: '', drawing_id: 'd1' })).toBeNull();
    expect(buildDrawingAssignedNotification({ user_email: 'a@x.com', drawing_id: '' })).toBeNull();
  });
});

describe('buildDrawingNoteNotification', () => {
  it('composes a note payload with author + body preview', () => {
    const out = buildDrawingNoteNotification({
      user_email: 'drawer@x.com', drawing_id: 'd1', drawing_name: 'Lot 7',
      job_id: 'j1', author_email: 'rpls@x.com', body: 'Please re-check the easement on the north side.',
    });
    expect(out).toMatchObject({
      type: 'drawing',
      source_type: 'drawing_note',
      source_id: 'd1',
      title: '💬 Note on Lot 7 from rpls@x.com',
      link: '/admin/cad?job=j1&drawing=d1',
    });
    expect(out!.body).toBe('Please re-check the easement on the north side.');
  });

  it('truncates very long body previews to 140 chars', () => {
    const long = 'x'.repeat(200);
    const out = buildDrawingNoteNotification({
      user_email: 'a@x.com', drawing_id: 'd1', author_email: 'b@x.com', body: long,
    });
    expect(out!.body.length).toBe(140);
    expect(out!.body.endsWith('…')).toBe(true);
  });

  it('returns null without recipient, drawing id, or non-empty body', () => {
    expect(buildDrawingNoteNotification({
      user_email: '', drawing_id: 'd1', author_email: 'b@x.com', body: 'hi',
    })).toBeNull();
    expect(buildDrawingNoteNotification({
      user_email: 'a@x.com', drawing_id: '', author_email: 'b@x.com', body: 'hi',
    })).toBeNull();
    expect(buildDrawingNoteNotification({
      user_email: 'a@x.com', drawing_id: 'd1', author_email: 'b@x.com', body: '   ',
    })).toBeNull();
  });
});

describe('buildDrawingDueReminders', () => {
  const NOW = Date.UTC(2026, 4, 30); // 2026-05-30 UTC

  it('boundary days fire (3 / 1 / 0)', () => {
    const out = buildDrawingDueReminders([
      { id: 'd3', name: '3-day', assigned_to: 'a@x.com', due_date: '2026-06-02' },
      { id: 'd1', name: '1-day', assigned_to: 'a@x.com', due_date: '2026-05-31' },
      { id: 'd0', name: 'today',  assigned_to: 'a@x.com', due_date: '2026-05-30' },
    ], NOW);
    expect(out.map((r) => r.source_id)).toEqual(['d3', 'd1', 'd0']);
    expect(out[2].title).toContain('due today');
    expect(out[1].title).toContain('due tomorrow');
    expect(out[0].title).toContain('due in 3 days');
  });

  it('non-boundary days are skipped, but overdue fires once', () => {
    const out = buildDrawingDueReminders([
      { id: 'd2', name: '2-day', assigned_to: 'a@x.com', due_date: '2026-06-01' },
      { id: 'd-2', name: 'late',  assigned_to: 'a@x.com', due_date: '2026-05-28' },
    ], NOW);
    expect(out.map((r) => r.source_id)).toEqual(['d-2']);
    expect(out[0].title).toContain('overdue');
    expect(out[0].escalation_level).toBe('high');
  });

  it('skips rows without an assignee, id, or parseable due date', () => {
    expect(buildDrawingDueReminders([
      { id: 'd', name: 'x', assigned_to: '', due_date: '2026-05-30' },
      { id: '', name: 'y', assigned_to: 'a@x.com', due_date: '2026-05-30' },
      { id: 'd', name: 'z', assigned_to: 'a@x.com', due_date: null },
      { id: 'd', name: 'w', assigned_to: 'a@x.com', due_date: 'not-a-date' },
    ], NOW)).toEqual([]);
  });

  it('exposes the default boundary set', () => {
    expect(DRAWING_DUE_BOUNDARIES).toEqual([3, 1, 0]);
  });
});
