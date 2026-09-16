// What the conversational agent is told before it says hello, and what it is told when everything
// that could go wrong does.
//
// Owner, 2026-09-16: "Please try and wire up the call history and make it so that elevenlabs can
// recognize callers if possible. make it as intuitive and natural and robust as possible."
//
// The robustness half is the half worth testing. This endpoint sits in front of every live call, so
// each of these is a way the phone could stop being answered, held open so it cannot close again.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  initVariables, initPayload, initToken, validInitToken, officeStatus, spokenNumber,
  INIT_PLACEHOLDERS, NO_HISTORY,
} from '@/lib/receptionist/agent-init';

const read = (p: string) => readFileSync(p, 'utf8');

/** A Supabase stand-in. `rows` decides what every table returns; `hang` never answers at all. */
function fakeClient(rows: Record<string, unknown[]>, opts: { hang?: boolean; throws?: boolean } = {}) {
  const result = (table: string) => {
    if (opts.throws) throw new Error('database is down');
    if (opts.hang) return new Promise(() => { /* never resolves */ });
    return Promise.resolve({ data: rows[table] ?? [], error: null });
  };
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'or', 'ilike', 'order', 'limit', 'eq']) {
      chain[m] = () => chain;
    }
    // Awaiting the builder runs the query, like the real client.
    chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
      try { return Promise.resolve(result(table)).then(resolve, reject); } catch (e) { return Promise.resolve(reject(e)); }
    };
    return chain;
  };
  return { from: (table: string) => builder(table) } as never;
}

const PRIOR_CALL = {
  call_sid: 'CAold', caller_name: 'Ed Bowen', caller_email: 'ed@example.test', callback_number: null,
  from_number: '+12545550142', service: 'boundary', property_address: '4557 Briggs Road, Killeen',
  started_at: '2026-08-02T15:00:00Z', is_test: false,
};

describe('what ElevenLabs is told before it answers', () => {
  it('a number that has called before comes back as history the agent must ask about, not announce', async () => {
    const vars = await initVariables(fakeClient({ phone_calls: [PRIOR_CALL], leads: [], customers: [] }), { caller_id: '+12545550142' });
    expect(vars.caller_history).toContain('Ed Bowen');
    expect(vars.caller_history).toContain('4557 Briggs Road, Killeen');
    // The standing order travels with the facts — and for a name nobody confirmed, the order is
    // that it may be recognised but never spoken first (lib/receptionist/registry.ts).
    expect(vars.caller_history).toMatch(/DO NOT say that name first/);
    expect(vars.caller_history).toMatch(/nobody has confirmed it belongs to them/);
    expect(vars.caller_history).toMatch(/have you called us before\?/);
    expect(vars.caller_history).toMatch(/or is this a new request/);
    expect(vars.caller_history).toMatch(/NEVER MIX JOBS/);
  });

  it('a number that has not is told plainly not to ask whether they have called before', async () => {
    const vars = await initVariables(fakeClient({ phone_calls: [], leads: [], customers: [] }), { caller_id: '+12545550999' });
    expect(vars.caller_history).toBe(NO_HISTORY);
    expect(vars.caller_history).toMatch(/Treat this caller as brand new/);
    expect(vars.caller_history).toMatch(/Do not ask whether they have called before/);
  });

  it('the call being answered is never its own history', async () => {
    // The row for THIS call exists by the time ElevenLabs asks — Twilio wrote it seconds ago. It is
    // the bug the owner heard as "are you the same Angela who called in September?", and the fix has
    // to hold here too, because this is now the path that feeds the live agent.
    const thisCall = { ...PRIOR_CALL, call_sid: 'CAnow', caller_name: 'Angela', started_at: new Date().toISOString() };
    const vars = await initVariables(fakeClient({ phone_calls: [thisCall], leads: [], customers: [] }), { caller_id: '+12545550142', call_sid: 'CAnow' });
    expect(vars.caller_history).toBe(NO_HISTORY);
    expect(vars.caller_history).not.toContain('Angela');
  });

  it('a test call left behind by the owner never makes a stranger into a known caller', async () => {
    const vars = await initVariables(fakeClient({ phone_calls: [{ ...PRIOR_CALL, is_test: true }], leads: [{ name: 'Jacob Maddux', email: null, phone: '+12545550142', property_address: null, created_at: '2026-08-01T00:00:00Z' }], customers: [] }), { caller_id: '+12545550142' });
    expect(vars.caller_history).toBe(NO_HISTORY);
    expect(vars.caller_history).not.toContain('Jacob');
  });

  it('a database that hangs answers "new caller" rather than holding the call open', async () => {
    const started = Date.now();
    const vars = await initVariables(fakeClient({}, { hang: true }), { caller_id: '+12545550142' });
    expect(vars.caller_history).toBe(NO_HISTORY);
    expect(Date.now() - started, 'raced against a short timeout').toBeLessThan(4000);
  }, 10_000);

  it('a database that throws answers "new caller" too', async () => {
    const vars = await initVariables(fakeClient({}, { throws: true }), { caller_id: '+12545550142' });
    expect(vars.caller_history).toBe(NO_HISTORY);
  });

  it('no caller id at all — a browser test — is a new caller, and says so about the number', async () => {
    const vars = await initVariables(fakeClient({}), {});
    expect(vars.caller_history).toBe(NO_HISTORY);
    expect(vars.caller_number).toMatch(/not available/);
  });

  it('the number is offered for confirming a callback, never for guessing who it is', async () => {
    const vars = await initVariables(fakeClient({ phone_calls: [], leads: [], customers: [] }), { caller_id: '+12545550142' });
    expect(vars.caller_number).toContain('two five four');
    expect(vars.caller_number).toMatch(/never to guess who they are/);
  });

  it('says numbers the way a person says them', () => {
    expect(spokenNumber('+12543151123')).toBe('two five four, three one five, one one two three');
    expect(spokenNumber('(254) 315-1123')).toBe('two five four, three one five, one one two three');
    expect(spokenNumber('12345')).toBeNull();
    expect(spokenNumber(null)).toBeNull();
  });
});

describe('the agent knows what time it is', () => {
  const at = (iso: string) => officeStatus(new Date(iso));
  it('open on a weekday morning, closed in the evening and at the weekend', () => {
    expect(at('2026-09-16T15:30:00Z'), 'Wednesday 10:30 a.m. Central').toMatch(/OPEN right now/);
    expect(at('2026-09-16T03:00:00Z'), 'Tuesday 10 p.m. Central').toMatch(/CLOSED right now/);
    expect(at('2026-09-19T18:00:00Z'), 'Saturday 1 p.m. Central').toMatch(/CLOSED right now/);
    expect(at('2026-09-19T18:00:00Z')).toMatch(/Monday morning/);
  });
  it('never promises a time, and always names the day and the clock', () => {
    for (const iso of ['2026-09-16T15:30:00Z', '2026-09-16T03:00:00Z', '2026-09-20T20:00:00Z']) {
      expect(at(iso)).toMatch(/Never promise a time/);
      expect(at(iso)).toMatch(/It is (Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), \d{1,2}:\d{2} (a|p)\.m\. Central\./);
    }
  });
  it('closed hours tell the caller an urgent message still gets marked urgent', () => {
    expect(at('2026-09-16T03:00:00Z')).toMatch(/marking it urgent/);
  });
});

describe('who may ask, and what a misconfiguration costs', () => {
  const env = { TWILIO_AUTH_TOKEN: 'a-twilio-token' };
  it('the token is derived, stable, and not the secret itself', () => {
    const t = initToken(env)!;
    expect(t).toHaveLength(32);
    expect(t).toBe(initToken(env));
    expect(t).not.toContain('a-twilio-token');
    expect(initToken({}), 'no secret, no token').toBeNull();
  });
  it('accepts only the right token, and never crashes on a wrong-length one', () => {
    expect(validInitToken(initToken(env), env)).toBe(true);
    expect(validInitToken('x', env)).toBe(false);
    expect(validInitToken('0'.repeat(32), env)).toBe(false);
    expect(validInitToken(null, env)).toBe(false);
    expect(validInitToken(initToken(env), {}), 'no secret configured means no access').toBe(false);
  });
  it('an unauthenticated request is answered as a new caller — never with an error, never with a name', () => {
    const src = read('app/api/elevenlabs/conversation-init/route.ts');
    expect(src).toContain('if (!validInitToken(token))');
    expect(src).toContain('return NextResponse.json(initPayload(INIT_PLACEHOLDERS));');
    expect(src, 'every failure still answers the call').not.toMatch(/status:\s*(4|5)\d\d/);
  });
  it('the placeholders alone make a sane prompt, for a conversation with no webhook at all', () => {
    expect(INIT_PLACEHOLDERS.caller_history).toBe(NO_HISTORY);
    expect(INIT_PLACEHOLDERS.caller_number).toMatch(/not available/);
    expect(INIT_PLACEHOLDERS.office_status).toMatch(/nine to five/);
    // and the payload is the shape ElevenLabs reads
    const payload = initPayload(INIT_PLACEHOLDERS);
    expect(payload.type).toBe('conversation_initiation_client_data');
    expect(Object.keys(payload.dynamic_variables).sort()).toEqual(['caller_history', 'caller_number', 'office_status']);
  });
});

describe('the prompt and the webhook agree about the variable names', () => {
  it('every {{placeholder}} in the prompt is one this endpoint sends', async () => {
    const { agentPrompt } = await import('@/lib/receptionist/agent-prompt');
    const used = [...agentPrompt().matchAll(/\{\{([a-z_]+)\}\}/g)].map((m) => m[1]).sort();
    expect(used.length, 'the prompt actually uses them').toBeGreaterThan(0);
    expect([...new Set(used)]).toEqual(Object.keys(INIT_PLACEHOLDERS).sort());
  });
  it('the agent is configured with both the webhook and the fallback placeholders', () => {
    const script = read('scripts/elevenlabs-agent.mjs');
    expect(script).toContain('conversation_initiation_client_data_webhook');
    expect(script).toContain('dynamic_variable_placeholders');
    expect(script, 'the same derivation as the route').toContain('elevenlabs-conversation-init:v1');
    expect(script).toContain('TWILIO_AUTH_TOKEN');
  });
});
