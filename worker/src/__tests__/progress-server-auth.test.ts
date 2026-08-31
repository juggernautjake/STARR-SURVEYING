// worker/src/__tests__/progress-server-auth.test.ts
//
// Authorisation tests for ProgressServer's WebSocket handshake.
//
// WHY THIS FILE EXISTS. `validateToken` used to end with:
//
//     // In production, validate Supabase JWT here
//     // For now, accept any non-empty token
//     return token.length > 0;
//
// That is fail-OPEN: every check above it could miss and the connection was
// still admitted. It was inert only because nothing constructs this class, so
// the danger was never a live breach — it was that the first person to wire it
// up would inherit an auth check that always says yes.
//
// These tests drive the REAL handshake over a REAL socket rather than calling
// the private method, because the thing worth pinning is what an attacker can
// actually do: open a connection and get bytes. A test that called `authorize`
// directly would pass just as happily if the handshake stopped calling it.
//
// Every rejection is asserted by CLOSE CODE, and the codes are distinct on
// purpose — 4001 unauthenticated, 4005 authenticated-but-not-for-this-project,
// 4002/4004 malformed — so a future failure says which of several opposite
// things went wrong instead of collapsing them into "it didn't connect".

import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { ProgressServer } from '../websocket/progress-server.js';
import { issueWsTicket } from '../shared/ws-ticket.js';

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
const OTHER_SECRET = 'a-different-secret-that-must-not-verify-anything';
const PROJECT = 'proj-alpha-123';

// ── Harness ────────────────────────────────────────────────────────────────

interface Harness {
  port: number;
  server: ProgressServer;
  http: Server;
}

const live: Harness[] = [];

async function start(opts: { ticketSecret?: string } = {}): Promise<Harness> {
  const http = createServer();
  const server = new ProgressServer(http, '/ws/research', opts);
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const port = (http.address() as AddressInfo).port;
  const h: Harness = { port, server, http };
  live.push(h);
  return h;
}

afterEach(async () => {
  const envKeys = ['WORKER_API_KEY', 'WS_TICKET_SECRET'] as const;
  for (const k of envKeys) delete process.env[k];
  while (live.length) {
    const h = live.pop()!;
    await h.server.close();
    await new Promise<void>((resolve) => h.http.close(() => resolve()));
  }
});

type Outcome =
  | { outcome: 'accepted'; welcome: Record<string, unknown> }
  | { outcome: 'rejected'; code: number };

/**
 * Connect and report what the SERVER did. Resolves on the welcome frame
 * (accepted) or on close (rejected) — never on 'open', because a rejected
 * connection also opens: the handshake completes and the server then closes
 * it. Resolving on 'open' would report every rejection as a success.
 */
function connect(port: number, query: string): Promise<Outcome> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/research${query}`);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('connect(): neither a welcome frame nor a close in 5s'));
    }, 5000);

    ws.on('message', (data) => {
      clearTimeout(timer);
      const welcome = JSON.parse(data.toString()) as Record<string, unknown>;
      ws.close();
      resolve({ outcome: 'accepted', welcome });
    });
    ws.on('close', (code) => {
      clearTimeout(timer);
      resolve({ outcome: 'rejected', code });
    });
    ws.on('error', () => {
      /* close fires next and carries the code */
    });
  });
}

function ticketFor(projectIds: string[], secret = SECRET, ttl = 60): string {
  return issueWsTicket('user@example.com', projectIds, secret, ttl).ticket;
}

// ── The regression this file is named for ──────────────────────────────────

describe('ProgressServer: the fail-open token check is gone', () => {
  it('rejects a token that is merely non-empty', async () => {
    const { port } = await start({ ticketSecret: SECRET });
    // Under the old `return token.length > 0` this connected and streamed.
    const r = await connect(port, `?projectId=${PROJECT}&token=anything-at-all`);
    expect(r).toEqual({ outcome: 'rejected', code: 4001 });
  });

  it('rejects a connection with no token', async () => {
    const { port } = await start({ ticketSecret: SECRET });
    const r = await connect(port, `?projectId=${PROJECT}`);
    expect(r).toEqual({ outcome: 'rejected', code: 4001 });
  });

  it('rejects a token that only LOOKS like a ticket', async () => {
    const { port } = await start({ ticketSecret: SECRET });
    const r = await connect(port, `?projectId=${PROJECT}&token=aaa.bbb.ccc`);
    expect(r).toEqual({ outcome: 'rejected', code: 4001 });
  });
});

// ── Ticket verification ────────────────────────────────────────────────────

describe('ProgressServer: ticket verification', () => {
  it('accepts a valid ticket for a project the ticket names', async () => {
    const { port } = await start({ ticketSecret: SECRET });
    const r = await connect(
      port,
      `?projectId=${PROJECT}&token=${ticketFor([PROJECT])}`,
    );
    expect(r.outcome).toBe('accepted');
    if (r.outcome !== 'accepted') return;
    expect(r.welcome.type).toBe('connected');
    expect(r.welcome.projectId).toBe(PROJECT);
  });

  it('rejects a ticket signed with a different secret', async () => {
    const { port } = await start({ ticketSecret: SECRET });
    const r = await connect(
      port,
      `?projectId=${PROJECT}&token=${ticketFor([PROJECT], OTHER_SECRET)}`,
    );
    expect(r).toEqual({ outcome: 'rejected', code: 4001 });
  });

  it('rejects an expired ticket', async () => {
    const { port } = await start({ ticketSecret: SECRET });
    const expired = ticketFor([PROJECT], SECRET, -60);
    const r = await connect(port, `?projectId=${PROJECT}&token=${expired}`);
    expect(r).toEqual({ outcome: 'rejected', code: 4001 });
  });

  it('rejects a tampered payload — the signature is checked, not just the shape', async () => {
    const { port } = await start({ ticketSecret: SECRET });
    const good = ticketFor([PROJECT]);
    const [header, , sig] = good.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        userId: 'attacker@example.com',
        jobIds: [PROJECT],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60,
      }),
      'utf8',
    )
      .toString('base64url');
    const r = await connect(
      port,
      `?projectId=${PROJECT}&token=${header}.${forged}.${sig}`,
    );
    expect(r).toEqual({ outcome: 'rejected', code: 4001 });
  });
});

// ── Per-project authorisation ──────────────────────────────────────────────

describe('ProgressServer: a ticket authorises PROJECTS, not the connection', () => {
  it('rejects a valid ticket for a project it does not name', async () => {
    const { port } = await start({ ticketSecret: SECRET });
    // Signature valid, holder authenticated — but for somebody else's run.
    const r = await connect(
      port,
      `?projectId=${PROJECT}&token=${ticketFor(['proj-belonging-to-someone-else'])}`,
    );
    expect(r).toEqual({ outcome: 'rejected', code: 4005 });
  });

  it('distinguishes forbidden (4005) from unauthenticated (4001)', async () => {
    const { port } = await start({ ticketSecret: SECRET });
    const forbidden = await connect(
      port,
      `?projectId=${PROJECT}&token=${ticketFor(['other-project'])}`,
    );
    const unauth = await connect(port, `?projectId=${PROJECT}&token=garbage`);
    expect(forbidden).toEqual({ outcome: 'rejected', code: 4005 });
    expect(unauth).toEqual({ outcome: 'rejected', code: 4001 });
  });

  it('admits each project a multi-project ticket names', async () => {
    const { port } = await start({ ticketSecret: SECRET });
    const token = ticketFor(['proj-one', 'proj-two']);
    for (const id of ['proj-one', 'proj-two']) {
      const r = await connect(port, `?projectId=${id}&token=${token}`);
      expect(r.outcome).toBe('accepted');
    }
    const denied = await connect(port, `?projectId=proj-three&token=${token}`);
    expect(denied).toEqual({ outcome: 'rejected', code: 4005 });
  });
});

// ── Fail-closed postures ───────────────────────────────────────────────────

describe('ProgressServer: fails closed when it cannot verify', () => {
  it('rejects every ticket when no secret is configured', async () => {
    delete process.env.WS_TICKET_SECRET;
    const { port } = await start(); // no injected secret either
    // A ticket that is valid against SECRET is still refused: the server has
    // nothing to check it with, and "cannot verify" must not mean "allow".
    const r = await connect(
      port,
      `?projectId=${PROJECT}&token=${ticketFor([PROJECT])}`,
    );
    expect(r).toEqual({ outcome: 'rejected', code: 4001 });
  });

  it('an unset WORKER_API_KEY does not admit an empty-string token', async () => {
    delete process.env.WORKER_API_KEY;
    const { port } = await start({ ticketSecret: SECRET });
    const r = await connect(port, `?projectId=${PROJECT}&token=`);
    expect(r).toEqual({ outcome: 'rejected', code: 4001 });
  });
});

// ── The service path ───────────────────────────────────────────────────────

describe('ProgressServer: the worker service key', () => {
  it('admits the exact WORKER_API_KEY for any project', async () => {
    process.env.WORKER_API_KEY = 'service-key-abcdef123456';
    const { port } = await start({ ticketSecret: SECRET });
    const r = await connect(
      port,
      `?projectId=${PROJECT}&token=service-key-abcdef123456`,
    );
    expect(r.outcome).toBe('accepted');
  });

  it('rejects a near-miss of the service key', async () => {
    process.env.WORKER_API_KEY = 'service-key-abcdef123456';
    const { port } = await start({ ticketSecret: SECRET });
    const r = await connect(
      port,
      `?projectId=${PROJECT}&token=service-key-abcdef12345`,
    );
    expect(r).toEqual({ outcome: 'rejected', code: 4001 });
  });
});

// ── Malformed requests keep their own codes ────────────────────────────────

describe('ProgressServer: malformed requests', () => {
  it('reports a missing projectId as 4002, not as an auth failure', async () => {
    const { port } = await start({ ticketSecret: SECRET });
    const r = await connect(port, `?token=${ticketFor([PROJECT])}`);
    expect(r).toEqual({ outcome: 'rejected', code: 4002 });
  });

  it('rejects a path-traversal projectId as 4004', async () => {
    const { port } = await start({ ticketSecret: SECRET });
    const token = ticketFor(['../../etc/passwd']);
    const r = await connect(
      port,
      `?projectId=${encodeURIComponent('../../etc/passwd')}&token=${token}`,
    );
    expect(r).toEqual({ outcome: 'rejected', code: 4004 });
  });
});

// ── The accepted path is fully wired, not merely admitted ──────────────────

describe('ProgressServer: an authorised client actually receives progress', () => {
  it('registers the client so broadcast() reaches it', async () => {
    const { port, server } = await start({ ticketSecret: SECRET });
    const token = ticketFor([PROJECT]);

    const ws = new WebSocket(
      `ws://127.0.0.1:${port}/ws/research?projectId=${PROJECT}&token=${token}`,
    );

    const frames: Array<Record<string, unknown>> = [];
    const gotProgress = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('no progress frame in 5s')),
        5000,
      );
      ws.on('message', (data) => {
        const frame = JSON.parse(data.toString()) as Record<string, unknown>;
        frames.push(frame);
        if (frame.type === 'progress') {
          clearTimeout(timer);
          resolve();
        }
      });
      ws.on('error', reject);
    });

    await new Promise<void>((resolve) => ws.on('open', () => resolve()));
    // Wait for the welcome frame so registration has certainly happened.
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (server.getClientCount(PROJECT) === 1) {
          clearInterval(check);
          resolve();
        }
      }, 10);
    });

    server.phaseStart(PROJECT, 3, 'Deed retrieval');
    await gotProgress;

    expect(frames[0]?.type).toBe('connected');
    const progress = frames.find((f) => f.type === 'progress');
    expect(progress?.projectId).toBe(PROJECT);
    expect(progress?.phaseName).toBe('Deed retrieval');
    ws.close();
  });

  it('does not register a rejected client', async () => {
    const { port, server } = await start({ ticketSecret: SECRET });
    await connect(port, `?projectId=${PROJECT}&token=not-a-ticket`);
    expect(server.getClientCount(PROJECT)).toBe(0);
    expect(server.getTotalClients()).toBe(0);
  });
});
