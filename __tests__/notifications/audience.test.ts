// __tests__/notifications/audience.test.ts — who hears a broadcast, and who decided that.
//
// Owner, 2026-09-23: "Work on determining what roles should exist and what all they should have
// access to, and which roles should get what notifications."
//
// ── THE BUG THIS EXISTS TO PREVENT COMING BACK ──────────────────────────────────────────────────
//
// `INTAKE_ROUTING_ROLES` routed phone calls to ['admin','employee','equipment_manager','field_crew']
// and looked like a filter. It was not one. `employee` is the base role in lib/auth-roles.ts and
// `lib/admin/apply-roles.ts` force-injects it into every roles array, so the list matched every
// person in the firm — measured at six of six — and the field crew got a bell for every customer
// call about title work.
//
// A routing list that contains a universal role is indistinguishable, by reading, from one that
// does not. The first test here is the one that can tell them apart.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  BROADCAST_KINDS, broadcastKind, rolesForKind, isEligibleFor, eligibleRecipients,
} from '@/lib/notifications/audience';
import { recipientsFor, preferencesFor } from '@/lib/notifications/notification-preferences';
import { ALL_ROLES } from '@/lib/auth-roles';

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

/** Roles every person holds by construction, so routing on them selects everybody. */
const UNIVERSAL_ROLES = ['employee'];

/** A Supabase stand-in holding one users table and one preferences table. */
function db(users: Array<{ email: string; roles: string[]; is_approved?: boolean; is_banned?: boolean }>,
  prefs: Array<{ user_email: string; kind: string; enabled: boolean }> = [],
  hours: Array<{ user_email: string; notify_on_submit: boolean }> = []) {
  return {
    from(table: string) {
      const api: Record<string, unknown> = {};
      let wantRoles: string[] = [];
      let wantKind = '';
      let wantEmail = '';
      const result = () => {
        if (table === 'registered_users') {
          return { data: users.filter((u) => u.roles.some((r) => wantRoles.includes(r))), error: null };
        }
        if (table === 'notification_preferences') {
          return { data: prefs.filter((p) => (!wantKind || p.kind === wantKind) && (!wantEmail || p.user_email === wantEmail)), error: null };
        }
        return { data: hours.filter((h) => !wantEmail || h.user_email === wantEmail), error: null };
      };
      api.select = () => api;
      api.overlaps = (_c: string, v: string[]) => { wantRoles = v; return result(); };
      api.eq = (c: string, v: string) => { if (c === 'kind') wantKind = v; else wantEmail = v; return api; };
      api.maybeSingle = () => Promise.resolve({ data: result().data[0] ?? null, error: null });
      // `select()` with no filter still has to resolve — the hours table is read unfiltered.
      api.then = (f: (r: unknown) => unknown) => Promise.resolve(result()).then(f);
      return api;
    },
  };
}

describe('a routing list must be able to exclude somebody', () => {
  it('no broadcast routes on a role that every person holds', () => {
    // This is the whole bug. `employee` in a list means "everybody", and a list that means
    // everybody is not routing — it just looks like it from the outside.
    for (const kind of BROADCAST_KINDS) {
      for (const universal of UNIVERSAL_ROLES) {
        expect(kind.roles, `"${kind.id}" routes on "${universal}", which everybody holds`)
          .not.toContain(universal);
      }
    }
  });

  it('and `employee` really is universal, so that check means something', () => {
    // If this ever stops being true the test above becomes decoration, so it is pinned here.
    expect(read('lib/admin/apply-roles.ts')).toContain("'employee'");
    expect(read('lib/auth-roles.ts')).toContain("employee: 'Base role.");
  });
});

describe('every kind is a real, answerable thing', () => {
  it('names only roles that exist', () => {
    for (const kind of BROADCAST_KINDS) {
      for (const r of kind.roles) {
        expect(ALL_ROLES as readonly string[], `"${kind.id}" wants role "${r}"`).toContain(r);
      }
    }
  });

  it('has an audience, a label and a reason', () => {
    for (const kind of BROADCAST_KINDS) {
      expect(kind.roles.length, `"${kind.id}" has no audience`).toBeGreaterThan(0);
      expect(kind.label.length).toBeGreaterThan(0);
      // The reason is the part that survives: it is what the next person reads before widening it.
      expect(kind.why.length, `"${kind.id}" does not say why`).toBeGreaterThan(40);
    }
  });

  it('ids are unique, because they key the stored opt-outs', () => {
    const ids = BROADCAST_KINDS.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('an unknown kind tells nobody rather than everybody', () => {
  it('resolves to no roles', () => {
    // Failing open here would mean a typo in a kind id broadcasts to the whole firm.
    expect(rolesForKind('nope.not.a.kind')).toEqual([]);
    expect(broadcastKind('nope')).toBeUndefined();
    expect(isEligibleFor('nope', ['admin'])).toBe(false);
  });

  it('and sends to nobody', async () => {
    expect(await eligibleRecipients(db([{ email: 'a@x.com', roles: ['admin'] }]), 'nope')).toEqual([]);
  });
});

describe('who actually gets a phone call', () => {
  const USERS = [
    { email: 'jacob@x.com', roles: ['employee', 'admin', 'field_crew'] },
    { email: 'jack@x.com', roles: ['employee', 'field_crew'] },
    { email: 'banned@x.com', roles: ['employee', 'admin'], is_banned: true },
    { email: 'pending@x.com', roles: ['employee', 'admin'], is_approved: false },
  ];

  it('the people who can act on it, and not the crew', async () => {
    const got = await eligibleRecipients(db(USERS), 'call.received');
    expect(got).toContain('jacob@x.com');
    // The actual regression: a field crew member cannot action a customer asking about a boundary
    // survey, and a bell for work you cannot do is one you learn to ignore.
    expect(got).not.toContain('jack@x.com');
  });

  it('never a banned or unapproved account', async () => {
    const got = await eligibleRecipients(db(USERS), 'call.received');
    expect(got).not.toContain('banned@x.com');
    expect(got).not.toContain('pending@x.com');
  });
});

describe('opting out', () => {
  const USERS = [
    { email: 'a@x.com', roles: ['admin'] },
    { email: 'b@x.com', roles: ['admin'] },
  ];

  it('removes only the person who opted out', async () => {
    const got = await recipientsFor(db(USERS, [{ user_email: 'a@x.com', kind: 'call.received', enabled: false }]), 'call.received');
    expect(got).toEqual(['b@x.com']);
  });

  it('an absent row means notified — opt-out, not opt-in', async () => {
    // The direction is load-bearing. Opt-in would have meant everybody went quiet the day this
    // shipped, and silence is exactly what a quiet week looks like, so nobody would report it.
    const got = await recipientsFor(db(USERS), 'call.received');
    expect(got.sort()).toEqual(['a@x.com', 'b@x.com']);
  });

  it('an opt-out for one kind does not silence another', async () => {
    const got = await recipientsFor(db(USERS, [{ user_email: 'a@x.com', kind: 'lead.received', enabled: false }]), 'call.received');
    expect(got.sort()).toEqual(['a@x.com', 'b@x.com']);
  });
});

describe('the settings list only offers what applies to you', () => {
  it('a field crew member is offered nothing, rather than switches that do nothing', async () => {
    expect(await preferencesFor(db([]), 'jack@x.com', ['employee', 'field_crew'])).toEqual([]);
  });

  it('an admin is offered the kinds they can act on', async () => {
    const got = await preferencesFor(db([]), 'a@x.com', ['admin']);
    expect(got.map((k) => k.id)).toContain('call.received');
  });

  it('but not one that has its own panel, which would be two switches for one setting', async () => {
    const got = await preferencesFor(db([]), 'a@x.com', ['admin']);
    expect(got.map((k) => k.id)).not.toContain('hours.submitted');
    expect(BROADCAST_KINDS.find((k) => k.id === 'hours.submitted')?.hasOwnPanel).toBe(true);
    // …and that panel is still mounted, so the setting has not simply disappeared.
    expect(read('app/admin/settings/page.tsx')).toContain('<HoursNotificationSetting');
  });
});

describe('the call and lead paths actually use this', () => {
  it('the receptionist routes through the registry, not a local role list', () => {
    const src = read('lib/receptionist/notify.ts');
    expect(src).toContain("'call.received'");
    expect(src).not.toContain('findIntakeRecipients');
  });

  it('a website query goes to the same audience, being the same event through a different door', () => {
    expect(read('lib/leads/intake.ts')).toContain("'lead.received'");
  });
});

describe('roles named in notification code are real roles', () => {
  it('JOB_AUDIENCE_ROLES holds no invented one', () => {
    // `bookkeeper` sat in this set and matched nobody — the money role is `finance`. A role name
    // that does not exist fails silently, which is why it survived.
    const src = read('lib/notifications.ts');
    const set = src.match(/JOB_AUDIENCE_ROLES = new Set\(\[([^\]]*)\]/)?.[1] ?? '';
    const names = [...set.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(3);
    for (const n of names) expect(ALL_ROLES as readonly string[], `"${n}" is not a role`).toContain(n);
  });
});
