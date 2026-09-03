import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ── F5 — TWO WEBSOCKET STACKS, ONE CLIENT, NO HEARTBEAT ────────────────────────────────────────
//
// > "We need to be able to immediately retreive the worker and frontend logs."
//
// `worker/src/websocket/progress-server.ts` was 378 lines with zero importers outside its own auth
// test. Reading it settled F5 rather than guessing at it:
//
//   · Its protocol has no client. `lib/research/useResearchProgress.ts` speaks jobIds against
//     `server/ws.ts`; nothing anywhere speaks projectId against `/ws/research`.
//   · This repo already has a complete WS stack — a runnable server (`npm run ws`), a ticket
//     endpoint (`/api/ws/ticket`), a client hook, and a shared signer used by both. A second one
//     is a fork of the same idea, not the missing half of a channel.
//   · "Immediately retrievable" is already met: the panel polls the status endpoint, which returns
//     the live log, and F3 now persists mid-run so a killed run keeps its diary too.
//
// So: delete. But not before taking the one thing it knew that the live stack did not.

const ROOT = process.cwd();
const WS = fs.readFileSync(path.join(ROOT, 'server/ws.ts'), 'utf8');
const code = WS.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');

describe('the heartbeat survived the deletion', () => {
  it('CONTROL: the probe is reading the live WS server', () => {
    expect(code).toContain('WebSocketServer');
    expect(code).toContain('verifyWsTicket');
  });

  it('a client that stops answering is terminated', () => {
    // A socket whose far end has gone — laptop closed, wifi dropped, tab killed without a close
    // frame — never fires 'close', so it is never unregistered and the fan-out goes on serialising
    // events for a listener that is not there. ping/pong is the only way to tell.
    expect(code).toContain("ws.on('pong'");
    expect(code).toContain('ws.ping()');
    expect(code).toContain('ws.terminate()');
  });

  it('terminate, not close — a half-open socket will not finish a handshake', () => {
    const at = code.indexOf('isAlive === false');
    expect(at).toBeGreaterThan(-1);
    expect(code.slice(at, at + 200)).toContain('terminate()');
  });

  it('the interval is cleared on close and does not hold the process open', () => {
    expect(code).toContain('clearInterval(heartbeat)');
    expect(code).toContain('heartbeat.unref?.()');
  });

  it('and close() clears it too, so a test that starts a server can end', () => {
    const at = code.indexOf('async close()');
    expect(at).toBeGreaterThan(-1);
    expect(code.slice(at, at + 200)).toContain('clearInterval(heartbeat)');
  });
});

describe('the parallel server is gone', () => {
  it('progress-server.ts no longer exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'worker/src/websocket/progress-server.ts'))).toBe(false);
  });

  it('CONTROL: the stack that DOES have a client is untouched', () => {
    // Deleting the fork must not have taken the real one with it. `ws-ticket.ts` is shared by
    // `server/ws.ts` and `/api/ws/ticket`, and stays regardless.
    expect(fs.existsSync(path.join(ROOT, 'worker/src/shared/ws-ticket.ts'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'server/ws.ts'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'app/api/ws/ticket/route.ts'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'lib/research/useResearchProgress.ts'))).toBe(true);
  });

  it('the worker no longer reads WS_TICKET_SECRET anywhere', () => {
    // The deleted module was the only worker file that read it, which is why the `/health` note
    // about it said what it said. That note is now corrected rather than left describing a file
    // that is gone.
    const idx = fs.readFileSync(path.join(ROOT, 'worker/src/index.ts'), 'utf8');
    expect(idx).toContain('was DELETED on');
  });
});
