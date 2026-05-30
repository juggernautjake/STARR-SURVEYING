// __tests__/team/status.test.ts
//
// hub-widget-excellence-14 — team-status R1: the /api/admin/team/status
// endpoint was a `{ members: [] }` stub. Locks the pure roster-join
// helper that now powers the real "active today" endpoint.

import { describe, it, expect } from 'vitest';
import { buildTeamStatus, type TimeLogRow, type RosterEntry } from '@/lib/team/status';

const roster: RosterEntry[] = [
  { user_email: 'lead@x.com', user_name: 'Lead Surveyor', roles: ['admin', 'field_worker'] },
  { user_email: 'rod@x.com', user_name: 'Rod Person', roles: [] },
];

describe('buildTeamStatus', () => {
  it('surfaces today\'s loggers as clocked-in with name + first role', () => {
    const logs: TimeLogRow[] = [{ user_email: 'lead@x.com' }];
    expect(buildTeamStatus(logs, roster)).toEqual([
      {
        user_email: 'lead@x.com',
        user_name: 'Lead Surveyor',
        role: 'admin',
        shift: null,
        status: 'clocked-in',
        since: null,
      },
    ]);
  });

  it('de-dupes repeated emails + trims whitespace, preserving first-seen order', () => {
    const logs: TimeLogRow[] = [
      { user_email: 'rod@x.com' },
      { user_email: ' lead@x.com ' },
      { user_email: 'rod@x.com' },
    ];
    expect(buildTeamStatus(logs, roster).map((m) => m.user_email)).toEqual([
      'rod@x.com',
      'lead@x.com',
    ]);
  });

  it('falls back to null name/role when the email is not on the roster', () => {
    const logs: TimeLogRow[] = [{ user_email: 'ghost@x.com' }];
    expect(buildTeamStatus(logs, roster)[0]).toMatchObject({
      user_email: 'ghost@x.com',
      user_name: null,
      role: null,
    });
  });

  it('skips blank/null emails and returns [] for no logs', () => {
    expect(buildTeamStatus([{ user_email: '' }, { user_email: null }], roster)).toEqual([]);
    expect(buildTeamStatus([], roster)).toEqual([]);
  });

  it('yields a null role when the roster entry has an empty roles array', () => {
    expect(buildTeamStatus([{ user_email: 'rod@x.com' }], roster)[0].role).toBeNull();
  });
});
