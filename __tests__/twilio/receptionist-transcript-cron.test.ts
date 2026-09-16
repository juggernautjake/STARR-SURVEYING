// Saving the agents' transcripts without anyone pressing anything.
//
// Owner, 2026-09-16: "can you save the transcripts". Until today they were saved only when somebody
// opened /admin/dev/receptionist and pressed **File the conversation**. Everything said to an agent
// on a day nobody did that existed only inside ElevenLabs' history page — not on /admin/calls, not
// searchable beside the phone calls, and gone when the retention window closed.
//
// The failure mode this guards is the quiet one, and it has two halves:
//
//   1. a cron route that exists but is not in `vercel.json` — code that reads as though something
//      is running on a schedule while nothing ever calls it (the mirror of `cron-registration`'s
//      check, which catches a schedule with no route);
//   2. the import silently doing nothing, or doing the WRONG thing, on a deployment that has no
//      ElevenLabs credentials. Preview and local deploys are in that state permanently, so "no key"
//      must be a 200 with zeros rather than a 500 — otherwise every preview deploy alerts every
//      fifteen minutes and the alert stops meaning anything.
//
// The row shape itself (`EL-` key, `is_test`) is asserted in `answering-machine.test.ts`, where it
// has been since the button was written; what is new here is that ONE module writes it.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');

// `withErrorHandler` reaches for the session when it logs a failure, and next-auth does not load
// under the node test environment. A cron has no session by definition, so a null one is honest.
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => null), isAdmin: () => false }));

// ── the ElevenLabs side, faked ─────────────────────────────────────────────────────────────────
// `env` is what the deployment knows; `conversations` is what ElevenLabs would return. Both are
// reset per test so a run cannot depend on the order the tests happen to execute in.
const el = vi.hoisted(() => ({
  key: 'sk_test' as string | null,
  agents: { starr: 'agent_starr', generic: 'agent_generic' } as Record<string, string | null>,
  conversations: {} as Record<string, Array<Record<string, unknown>>>,
  listCalls: [] as Array<{ agentId: string; limit: number }>,
  throwOnList: false,
}));
vi.mock('@/lib/receptionist/elevenlabs-agents', async (orig) => ({
  ...(await orig<typeof import('@/lib/receptionist/elevenlabs-agents')>()),
  elevenLabsKey: () => el.key,
  agentIdFor: (kind: string) => el.agents[kind] ?? null,
  agentsConfigured: () => el.key !== null && el.agents.starr !== null,
  listConversations: async (agentId: string, limit: number) => {
    el.listCalls.push({ agentId, limit });
    if (el.throwOnList) throw new Error('ElevenLabs is down');
    return el.conversations[agentId] ?? [];
  },
  getConversation: async (id: string) =>
    Object.values(el.conversations).flat().find((c) => (c as { conversation_id: string }).conversation_id === id) ?? null,
}));

// ── the database side, faked ───────────────────────────────────────────────────────────────────
// `existing` decides whether a conversation reads as new (no transcript yet) or as a re-import.
const calls = vi.hoisted(() => ({
  started: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ sid: string; patch: Record<string, unknown> }>,
  existing: null as null | { transcript: unknown[] },
}));
vi.mock('@/lib/receptionist/calls', async (orig) => ({
  ...(await orig<typeof import('@/lib/receptionist/calls')>()),
  startCall: async (_c: unknown, args: Record<string, unknown>) => { calls.started.push(args); return calls.existing; },
  updateCall: async (_c: unknown, sid: string, patch: Record<string, unknown>) => { calls.updates.push({ sid, patch }); return null; },
}));

import { importAgentConversations } from '@/lib/receptionist/import-conversations';
import { GET as cron } from '@/app/api/cron/receptionist-transcripts/route';

const CRON_PATH = '/api/cron/receptionist-transcripts';

const conversation = (id: string, over: Record<string, unknown> = {}) => ({
  conversation_id: id,
  agent_id: 'agent_starr',
  start_time_unix_secs: 1_757_000_000,
  call_duration_secs: 42,
  transcript: [
    { role: 'agent', message: 'Starr Surveying, this is Ellie.' },
    { role: 'user', message: 'I need a boundary survey.' },
  ],
  analysis: { transcript_summary: 'Caller wants a boundary survey.' },
  ...over,
});

beforeEach(() => {
  el.key = 'sk_test';
  el.agents = { starr: 'agent_starr', generic: 'agent_generic' };
  el.conversations = {};
  el.listCalls = [];
  el.throwOnList = false;
  calls.started = [];
  calls.updates = [];
  calls.existing = null;
  process.env.CRON_SECRET = 'cron-secret';
});

const req = (headers: Record<string, string> = {}) =>
  new Request(`https://www.starr-surveying.com${CRON_PATH}`, { headers }) as unknown as Parameters<typeof cron>[0];

describe('the transcript import, shared by the button and the cron', () => {
  it('files a conversation from each agent, keyed by the ElevenLabs id and flagged as a test row', async () => {
    el.conversations = { agent_starr: [conversation('conv_1')], agent_generic: [conversation('conv_2')] };

    const result = await importAgentConversations(30);

    expect(result).toMatchObject({ imported: 2, updated: 0, skipped: 0, errors: [] });
    expect(calls.updates.map((u) => u.sid)).toEqual(['EL-conv_1', 'EL-conv_2']);
    // Never notified, never a lead: these rows are reviewed, not acted on.
    expect(calls.started.every((s) => s.isTest === true)).toBe(true);
    const patch = calls.updates[0].patch;
    expect(patch.is_test).toBe(true);
    expect(patch.transcript).toEqual([
      { role: 'assistant', text: 'Starr Surveying, this is Ellie.' },
      { role: 'caller', text: 'I need a boundary survey.' },
    ]);
    expect(patch.summary).toBe('Caller wants a boundary survey.');
    expect(patch.duration_seconds).toBe(42);
    // The audio is linked, not copied — it stays with ElevenLabs.
    expect(patch.recording_source).toBe('elevenlabs');
    expect(patch.recording_url).toContain('conv_1');
  });

  it('counts a re-import as an update, not a second call', async () => {
    // Why it matters: the cron runs every fifteen minutes forever. If a conversation already filed
    // counted as `imported` each tick, the number in the log would be a measure of the schedule
    // rather than of anything that happened.
    el.conversations = { agent_starr: [conversation('conv_1')] };
    calls.existing = { transcript: [{ role: 'caller', text: 'earlier' }] };

    expect(await importAgentConversations(30)).toMatchObject({ imported: 0, updated: 1 });
  });

  it('skips a conversation with nothing said in it', async () => {
    // A click that opened a session and closed it again. Filing that as a call puts an empty row on
    // /admin/calls for somebody to open and find nothing in.
    el.conversations = { agent_starr: [conversation('conv_1', { transcript: [{ role: 'user', message: '  ' }] })] };

    expect(await importAgentConversations(30)).toMatchObject({ imported: 0, updated: 0, skipped: 1 });
    expect(calls.updates).toEqual([]);
  });

  it('reports a failing agent instead of throwing, and still files the other one', async () => {
    el.throwOnList = true;
    el.conversations = { agent_starr: [conversation('conv_1')] };

    const result = await importAgentConversations(30);
    expect(result.errors.length).toBe(2);
    expect(result.errors[0]).toContain('ElevenLabs is down');
  });

  it('does nothing at all without a key, and skips an agent that is not configured', async () => {
    el.key = null;
    el.conversations = { agent_starr: [conversation('conv_1')] };
    expect(await importAgentConversations(30)).toEqual({ imported: 0, updated: 0, skipped: 0, errors: [] });
    expect(el.listCalls, 'no key means no request is made at all').toEqual([]);

    el.key = 'sk_test';
    el.agents = { starr: 'agent_starr', generic: null };
    await importAgentConversations(30);
    expect(el.listCalls.map((c) => c.agentId)).toEqual(['agent_starr']);
  });

  it('there is exactly one implementation of it', () => {
    // The button and the cron writing their own upsert is two chances for the key to drift, and a
    // drifted `call_sid` files the second copy as a NEW call rather than updating the first.
    const route = read('app/api/admin/receptionist-test/import/route.ts');
    expect(route).toContain('importAgentConversations');
    expect(route, 'the route is the admin gate now, not a copy of the import')
      .not.toContain('updateCall(');
  });
});

describe('the cron route', () => {
  it('refuses without the secret and reports a missing one rather than running open', async () => {
    expect((await cron(req({ authorization: 'Bearer wrong' }))).status).toBe(401);
    expect((await cron(req())).status).toBe(401);

    delete process.env.CRON_SECRET;
    // A misconfigured deployment must be loud, not an open door.
    expect((await cron(req({ authorization: 'Bearer cron-secret' }))).status).toBe(500);
  });

  it('runs the import and returns its counts', async () => {
    el.conversations = { agent_starr: [conversation('conv_1')] };
    const res = await cron(req({ authorization: 'Bearer cron-secret' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ configured: true, imported: 1, updated: 0, skipped: 0, errors: [] });
  });

  it('is a 200 no-op where ElevenLabs is not configured, not a 500', async () => {
    // Preview and local deploys have no key, permanently. A cron that 500s there is retried and
    // alerted on every fifteen minutes, and an alert that is always firing is not an alert.
    el.key = null;
    const res = await cron(req({ authorization: 'Bearer cron-secret' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ configured: false, imported: 0, updated: 0 });
  });
});

describe('vercel.json', () => {
  const crons: Array<{ path: string; schedule: string }> = JSON.parse(read('vercel.json')).crons ?? [];

  it('schedules the transcript import every fifteen minutes', () => {
    // Half of the failure: a cron route with no entry here is never called, and reads exactly like
    // one that is. `__tests__/research/cron-registration.test.ts` guards the other half.
    const row = crons.find((c) => c.path === CRON_PATH);
    expect(row, `${CRON_PATH} is not scheduled in vercel.json — nothing will ever call it`).toBeTruthy();
    expect(row!.schedule).toBe('*/15 * * * *');
  });
});
