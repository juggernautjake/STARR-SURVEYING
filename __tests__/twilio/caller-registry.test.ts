// The caller ID memory: what we know about a number, how sure we are, and who is allowed to say so.
//
// Owner, 2026-09-16: "The voice agent needs to know that my number is (254)-315-1123 (Jacob
// Maddux). it should not assume that anyone else's number is me. Please build out the whole
// infrastructure for the call id rememberance log that attaches call info and names and stuff to a
// number."
//
// Those are two rules pulling in opposite directions, and every test here holds one end of them:
// the agent must greet the owner's son by name, and must never do that to anybody else. The thing
// that separates them is provenance — a name a person typed versus a name a transcript guessed —
// so most of this file is about which of those two a given name is, and what it licenses.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { registryKey, formatPhone, rememberCaller, saveRegistryEntry, type RegistryEntry } from '@/lib/receptionist/registry';
import { knownCallerLine, type KnownCaller } from '@/lib/receptionist/known-caller';

const read = (p: string) => readFileSync(p, 'utf8');

const JACOB = '2543151123';

/** A Supabase stand-in that keeps one table in memory, so `rememberCaller` can be exercised for
 *  real rather than asserted about from the outside. */
function fakeRegistry(initial: Record<string, Partial<Record<string, unknown>>> = {}) {
  const rows = new Map<string, Record<string, unknown>>(Object.entries(initial).map(([k, v]) => [k, { phone: k, name_source: 'observed', relationship: 'unknown', never_assume: false, times_called: 0, ...v }]));
  const client = {
    from() {
      let where = '';
      let pending: Record<string, unknown> | null = null;
      let mode: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
      const api: Record<string, unknown> = {
        select: () => api,
        eq: (_col: string, val: string) => { where = val; return api; },
        order: () => api,
        limit: () => api,
        or: () => api,
        insert: (row: Record<string, unknown>) => { mode = 'insert'; pending = row; return api; },
        update: (row: Record<string, unknown>) => { mode = 'update'; pending = row; return api; },
        upsert: (row: Record<string, unknown>) => { mode = 'upsert'; pending = row; return api; },
        delete: () => { mode = 'delete'; return api; },
        maybeSingle: () => {
          if (mode === 'insert' || mode === 'upsert') {
            const key = String(pending!.phone);
            rows.set(key, { name_source: 'observed', relationship: 'unknown', never_assume: false, times_called: 0, ...(rows.get(key) ?? {}), ...pending });
            return Promise.resolve({ data: rows.get(key), error: null });
          }
          if (mode === 'update') {
            const cur = rows.get(where) ?? { phone: where };
            rows.set(where, { ...cur, ...pending });
            return Promise.resolve({ data: rows.get(where), error: null });
          }
          if (mode === 'delete') { rows.delete(where); return Promise.resolve({ data: null, error: null }); }
          return Promise.resolve({ data: rows.get(where) ?? null, error: null });
        },
      };
      return api;
    },
  } as never;
  return { client, rows };
}

/** The shape `lookupKnownCaller` hands the model, with the bits each test cares about. */
const caller = (over: Partial<KnownCaller> = {}): KnownCaller => ({
  name: null, nameCertain: false, relationship: 'unknown', notes: null, email: null,
  source: 'registry', lastSeen: '2026-09-15T12:00:00Z', lastAbout: null, timesCalled: 1, enquiries: [],
  ...over,
});

describe('a number is a key, however it was written down', () => {
  it('every spelling of the same number is the same row', () => {
    for (const spelling of ['+12543151123', '12543151123', '2543151123', '(254) 315-1123', '254.315.1123', ' 254-315-1123 ']) {
      expect(registryKey(spelling), spelling).toBe(JACOB);
    }
  });
  it('refuses what is not a US phone number, rather than keying on nonsense', () => {
    for (const junk of ['', null, undefined, '12345', 'client:jacob@starr', '0125551234', '+447700900000']) {
      expect(registryKey(junk as string), String(junk)).toBeNull();
    }
  });
  it('writes a number back the way a person reads one', () => {
    expect(formatPhone('+12543151123')).toBe('(254) 315-1123');
  });
});

describe('the owner’s own number, and nobody else’s', () => {
  it('is seeded as CONFIRMED, so the receptionist may greet him by name', () => {
    const seed = read('seeds/640_caller_registry.sql');
    expect(seed).toContain("'2543151123'");
    expect(seed).toContain('Jacob Maddux');
    expect(seed).toContain("'verified'");
    expect(seed, 'and as crew, so he is never interviewed like a customer').toContain("'staff'");
  });

  it('a confirmed name is greeted with, once, as a question', () => {
    const line = knownCallerLine(caller({ name: 'Jacob Maddux', nameCertain: true, relationship: 'staff' }))!;
    expect(line).toMatch(/the office has confirmed/);
    expect(line).toMatch(/is this Jacob\?/);
    // …and it still bends the moment the person says otherwise, because phones get borrowed.
    expect(line).toMatch(/If they say they are someone else/);
    expect(line).toMatch(/believe them immediately/);
  });

  it('the crew are not interviewed like customers', () => {
    const line = knownCallerLine(caller({ name: 'Jacob Maddux', nameCertain: true, relationship: 'staff' }))!;
    expect(line).toMatch(/NOT a customer/i);
    expect(line).toMatch(/Never run a survey enquiry/);
  });

  it('an OVERHEARD name is never spoken first — this is the "anyone else" half of the rule', () => {
    const line = knownCallerLine(caller({ name: 'Jacob Maddux', nameCertain: false }))!;
    expect(line).toMatch(/nobody has confirmed it belongs to them/);
    expect(line).toMatch(/DO NOT say that name first/);
    expect(line).not.toMatch(/is this Jacob\?/);
  });

  it('a number with no name at all is asked about, not guessed at', () => {
    const line = knownCallerLine(caller({ name: null }))!;
    expect(line).toMatch(/There is no confirmed name for this number/);
    expect(line).toMatch(/do not guess/);
  });

  it('a number marked "never put a name to this" gets none', () => {
    // What `never_assume` produces: history, no identity.
    const line = knownCallerLine(caller({ name: null, timesCalled: 4 }))!;
    expect(line).toMatch(/4 times before/);
    expect(line).not.toMatch(/Jacob/);
  });
});

describe('the log half: what a finished call teaches it', () => {
  it('counts the call, starts the clock, and records what they rang about', async () => {
    const { client, rows } = fakeRegistry();
    await rememberCaller(client, { phone: '+12545550142', name: 'Ed Bowen', email: 'ED@Example.test', about: 'boundary at 4557 Briggs Road', at: '2026-09-16T10:00:00Z' });
    const row = rows.get('2545550142')!;
    expect(row.times_called).toBe(1);
    expect(row.display_name).toBe('Ed Bowen');
    expect(row.name_source, 'heard on a call, not confirmed').toBe('observed');
    expect(row.email, 'emails are lowercase, always').toBe('ed@example.test');
    expect(row.last_about).toBe('boundary at 4557 Briggs Road');
    expect(row.first_seen_at).toBe('2026-09-16T10:00:00Z');

    await rememberCaller(client, { phone: '(254) 555-0142', about: 'checking on the plat', at: '2026-09-17T10:00:00Z' });
    expect(rows.get('2545550142')!.times_called, 'the second call counts too').toBe(2);
    expect(rows.get('2545550142')!.first_seen_at, 'and the first time stays the first time').toBe('2026-09-16T10:00:00Z');
  });

  it('never overwrites a name a person confirmed with one a transcript guessed', async () => {
    const { client, rows } = fakeRegistry({ [JACOB]: { display_name: 'Jacob Maddux', name_source: 'verified', relationship: 'staff' } });
    await rememberCaller(client, { phone: '+12543151123', name: 'Jake Mad Ducks', about: 'the pins on Briggs' });
    expect(rows.get(JACOB)!.display_name, 'the transcript does not get to rename him').toBe('Jacob Maddux');
    expect(rows.get(JACOB)!.name_source).toBe('verified');
    expect(rows.get(JACOB)!.times_called, 'but the call still counts').toBe(1);
  });

  it('A TEST CALL TEACHES IT NOTHING — the bug that started all of this', async () => {
    const { client, rows } = fakeRegistry();
    const out = await rememberCaller(client, { phone: '+12545550199', name: 'Jacob', isTest: true });
    expect(out).toBeNull();
    expect(rows.size, 'the owner testing the agent must not become a caller on file').toBe(0);
  });

  it('a call from something that is not a phone number is not recorded', async () => {
    const { client, rows } = fakeRegistry();
    expect(await rememberCaller(client, { phone: 'client:jacobmaddux@starr-surveying.com', name: 'Jacob' })).toBeNull();
    expect(rows.size).toBe(0);
  });

  it('a database that fails does not fail the call', async () => {
    const broken = { from() { throw new Error('database is down'); } } as never;
    await expect(rememberCaller(broken, { phone: '+12545550142', name: 'Ed' })).resolves.toBeNull();
  });
});

describe('the edit half: a person putting a name to a number', () => {
  it('typing a name is what makes it confirmed', async () => {
    const { client, rows } = fakeRegistry({ '2545550142': { display_name: 'Ed Bowen', name_source: 'observed' } });
    const saved = await saveRegistryEntry(client, '(254) 555-0142', { displayName: 'Edward Bowen', relationship: 'customer' }, 'hank@starr-surveying.com');
    expect(saved.displayName).toBe('Edward Bowen');
    expect(saved.nameSource).toBe('verified');
    expect(rows.get('2545550142')!.updated_by).toBe('hank@starr-surveying.com');
  });

  it('clearing the name drops it back to "we overheard something once"', async () => {
    const { client } = fakeRegistry({ '2545550142': { display_name: 'Ed Bowen', name_source: 'verified' } });
    const saved = await saveRegistryEntry(client, '2545550142', { displayName: '' }, 'hank@starr-surveying.com');
    expect(saved.displayName).toBeNull();
    expect(saved.nameSource).toBe('observed');
  });

  it('refuses to key a row on something that is not a phone number', async () => {
    const { client } = fakeRegistry();
    await expect(saveRegistryEntry(client, 'not a number', { displayName: 'Nobody' }, 'hank@starr-surveying.com')).rejects.toThrow(/ten-digit/);
  });
});

describe('the wiring, where the call sites are what matters', () => {
  it('every finished real call teaches the registry, and no test call does', () => {
    const finish = read('lib/receptionist/finish.ts');
    expect(finish).toContain('rememberCaller(supabaseAdmin');
    expect(finish).toContain('if (call && !call.is_test)');
    const transcript = read('app/api/twilio/transcript/route.ts');
    expect(transcript, 'the analysis is the best contact data a call produces').toContain('rememberCaller(supabaseAdmin');
  });

  it('the lookup asks the registry first, and answers for a known number that has never rung', () => {
    const src = read('lib/receptionist/known-caller.ts');
    expect(src).toContain("lookupRegistry(client, ten)");
    // Jacob's number is in the registry from a seed, not from a call. A lookup that needed a prior
    // call would never recognise him.
    expect(src).toContain('if (!registry && priorCalls.length === 0) return null;');
    expect(src, 'the office answer beats anything overheard').toContain('if (registry?.displayName)');
    expect(src, 'and only the office answer can be certain').toContain("registry.nameSource === 'verified'");
  });

  it('the live agent is handed the same line the relay gets', () => {
    const init = read('lib/receptionist/agent-init.ts');
    expect(init).toContain('knownCallerLine');
    expect(init).toContain('lookupKnownCaller');
  });

  it('the admin route is admin-only and can only confirm names deliberately', () => {
    const route = read('app/api/admin/caller-registry/route.ts');
    expect(route).toContain('isAdmin(session.user.roles)');
    for (const verb of ['export const GET', 'export const PUT', 'export const DELETE']) expect(route).toContain(verb);
    expect(route, 'a bad number is a 400, not a row keyed on junk').toContain('A ten-digit US phone number is required.');
  });
});

describe('the entry the rest of the app sees', () => {
  it('has the fields the receptionist and the admin page both need', () => {
    const entry: RegistryEntry = {
      phone: JACOB, displayName: 'Jacob Maddux', nameSource: 'verified', email: null, company: null,
      relationship: 'staff', notes: 'party chief', neverAssume: false, timesCalled: 3,
      firstSeenAt: null, lastSeenAt: null, lastAbout: null, updatedBy: null, updatedAt: null,
    };
    expect(entry.nameSource).toBe('verified');
    expect(entry.relationship).toBe('staff');
  });
});
