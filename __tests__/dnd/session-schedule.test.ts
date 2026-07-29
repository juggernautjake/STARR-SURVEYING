// __tests__/dnd/session-schedule.test.ts — session scheduling (P1-5, audit B-5).
//
// `dnd_sessions.scheduled_at` existed in the schema, was SELECTed by the campaign GET, passed through the
// API untouched, and sat in the PATCH route's WRITABLE list. Nothing ever set it and nothing ever rendered
// it — the fourth "ready and unreachable" find in this audit, after the currency fields, FEATS_2014_STATUS,
// and the PF2 builder's `picks.languages`.
//
// The timezone conversions get the most attention here because they are the part that fails quietly: a
// session at 19:00 rendered as 18:00 is not an error anyone sees until somebody arrives an hour early.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  toLocalInputValue,
  fromLocalInputValue,
  formatSessionTime,
  nextSession,
  relativeSessionTime,
} from '@/lib/dnd/session-schedule';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('local ⇄ UTC round-trips', () => {
  it('an instant survives a round-trip through the input format', () => {
    // The property that matters, and it holds in ANY timezone the suite runs in — which is why it is
    // written as a round-trip rather than as a hard-coded expected string.
    const iso = new Date('2026-08-14T19:30:00Z').toISOString();
    const back = fromLocalInputValue(toLocalInputValue(iso));
    expect(back).toBe(iso);
  });

  it('the input value is the viewer’s WALL CLOCK, not UTC', () => {
    // The bug this prevents: using `toISOString().slice(0,16)` renders UTC into a control that means local
    // time, so the box shows the wrong hour everywhere except UTC+0.
    const d = new Date(2026, 7, 14, 19, 30); // local 19:30 by construction
    expect(toLocalInputValue(d.toISOString())).toBe('2026-08-14T19:30');
  });

  it('pads single-digit months, days, hours and minutes', () => {
    const d = new Date(2026, 0, 5, 9, 7);
    expect(toLocalInputValue(d.toISOString())).toBe('2026-01-05T09:07');
  });

  it('an empty field means UNSCHEDULED, not an invalid date', () => {
    // This is what lets a DM clear a date; mapping it to anything but null would make unscheduling
    // impossible or write a bogus timestamp.
    expect(fromLocalInputValue('')).toBeNull();
    expect(fromLocalInputValue('   ')).toBeNull();
  });

  it('and junk in either direction degrades to empty rather than throwing', () => {
    expect(toLocalInputValue(null)).toBe('');
    expect(toLocalInputValue(undefined)).toBe('');
    expect(toLocalInputValue('not a date')).toBe('');
    expect(fromLocalInputValue('not a date')).toBeNull();
    expect(formatSessionTime(null)).toBe('');
    expect(formatSessionTime('nonsense')).toBe('');
  });
});

describe('formatting', () => {
  it('renders something human in a fixed locale', () => {
    const out = formatSessionTime(new Date(2026, 7, 14, 19, 30).toISOString(), 'en-US');
    expect(out).toMatch(/Aug/);
    expect(out).toMatch(/14/);
  });
});

describe('which session is NEXT', () => {
  const now = new Date('2026-08-14T12:00:00Z');
  const at = (iso: string, status = 'prep', id = iso) => ({ id, title: id, status, scheduled_at: iso });

  it('picks the soonest upcoming one', () => {
    const list = [
      at('2026-08-20T18:00:00Z'),
      at('2026-08-15T18:00:00Z'),
      at('2026-09-01T18:00:00Z'),
    ];
    expect(nextSession(list, now)?.id).toBe('2026-08-15T18:00:00Z');
  });

  it('ignores sessions in the past', () => {
    const list = [at('2026-08-01T18:00:00Z'), at('2026-08-20T18:00:00Z')];
    expect(nextSession(list, now)?.id).toBe('2026-08-20T18:00:00Z');
  });

  it('ignores DONE sessions even when their time is in the future', () => {
    // A session marked finished early is not the next thing the party is doing.
    const list = [at('2026-08-15T18:00:00Z', 'done'), at('2026-08-20T18:00:00Z')];
    expect(nextSession(list, now)?.id).toBe('2026-08-20T18:00:00Z');
  });

  it('but a LIVE session in the past still wins — that is the one happening now', () => {
    // Hiding the banner the moment a live session's start time passes is exactly when it is most useful.
    const list = [at('2026-08-14T11:00:00Z', 'live'), at('2026-08-20T18:00:00Z')];
    expect(nextSession(list, now)?.id).toBe('2026-08-14T11:00:00Z');
  });

  it('ignores unscheduled sessions rather than nominating one arbitrarily', () => {
    const list = [{ id: 'a', title: 'a', status: 'prep', scheduled_at: null }];
    expect(nextSession(list, now)).toBeNull();
  });

  it('returns null for an empty or missing list', () => {
    expect(nextSession([], now)).toBeNull();
    expect(nextSession(undefined as never, now)).toBeNull();
  });
});

describe('relative time', () => {
  const now = new Date('2026-08-14T12:00:00Z');
  it('uses minutes, hours and days by magnitude', () => {
    expect(relativeSessionTime('2026-08-14T12:30:00Z', now, 'en-US')).toMatch(/30 minutes/);
    expect(relativeSessionTime('2026-08-14T17:00:00Z', now, 'en-US')).toMatch(/5 hours/);
    expect(relativeSessionTime('2026-08-17T12:00:00Z', now, 'en-US')).toMatch(/days|day/);
  });

  it('says "now" at the boundary and handles the past', () => {
    expect(relativeSessionTime('2026-08-14T12:00:00Z', now)).toBe('now');
    expect(relativeSessionTime('2026-08-14T11:00:00Z', now, 'en-US')).toMatch(/ago/);
  });

  it('and is empty when unscheduled', () => {
    expect(relativeSessionTime(null, now)).toBe('');
  });
});

describe('the surfaces are wired — the actual B-5 gap', () => {
  // The column was always writable. What did not exist was anything to write it or show it, so source
  // assertions are the only thing that distinguishes this slice from the state before it.
  it('the DM console has a datetime control that PATCHes scheduled_at', () => {
    const console_ = read('app/dnd/_ui/SessionConsole.tsx');
    expect(console_).toContain("type=\"datetime-local\"");
    expect(console_).toContain('saveSchedule');
    expect(console_).toMatch(/JSON\.stringify\(\{ scheduled_at \}\)/);
    expect(console_).toContain('fromLocalInputValue');
  });

  it('and it is DM-only', () => {
    // Scheduling is a DM's call; everyone else reads the banner.
    const console_ = read('app/dnd/_ui/SessionConsole.tsx');
    expect(console_).toMatch(/session\.role === 'dm' && \([\s\S]{0,600}datetime-local/);
  });

  it('the campaign hub renders a next-session banner for every member', () => {
    const hub = read('app/dnd/_ui/CampaignPageClient.tsx');
    expect(hub).toContain('nextSession(data.sessions)');
    expect(hub).toContain('Next session');
    // Not gated on role — a player needs this more than the DM who set it.
    expect(hub).not.toMatch(/role === 'dm'[\s\S]{0,120}nextSession\(/);
  });

  it('and the session type carries the column, or none of it can render', () => {
    // The type omitted `scheduled_at` while the API had been sending it all along, which is why this was
    // invisible to every consumer on this page.
    expect(read('app/dnd/_ui/CampaignPageClient.tsx')).toMatch(/sessions: \{[^}]*scheduled_at/);
    expect(read('app/api/dnd/campaigns/[id]/route.ts')).toContain("'id, title, status, scheduled_at, sort_order'");
  });

  it('the PATCH route still accepts the field', () => {
    expect(read('app/api/dnd/sessions/[id]/route.ts')).toMatch(/WRITABLE = \[[^\]]*'scheduled_at'/);
  });
});
