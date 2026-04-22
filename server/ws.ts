// server/ws.ts
//
// Standalone WebSocket server for the Starr Recon real-time progress
// channel. Runs as its own process (default port 3001), independently
// from the Next.js app and the worker.
//
// Why a separate process:
//   - Keeps long-lived connections off the serverless Next.js function
//     (Vercel + ws don't mix; even on Node hosting it's cleaner).
//   - Lets us scale the WS layer horizontally (sticky sessions on a
//     load balancer) without pulling app routes along.
//   - Decouples deploys: the Next app can redeploy without dropping
//     active WS connections.
//
// See docs/platform/WEBSOCKET_ARCHITECTURE.md for the full picture.

import { createServer } from 'node:http';
import { WebSocketServer, WebSocket as WS } from 'ws';
import IORedis from 'ioredis';
import {
  RESEARCH_EVENTS_CHANNEL_PATTERN,
  jobIdFromChannel,
  parseResearchEvent,
} from '../worker/src/shared/research-events.js';
import { verifyWsTicket, type WsTicketPayload } from '../worker/src/shared/ws-ticket.js';

interface ClientState {
  payload:    WsTicketPayload;
  jobIdSet:   Set<string>;
  socket:     WS;
}

interface StartOptions {
  port?:        number;
  redisUrl?:    string;
  ticketSecret?: string;
  /** For tests: skip listen() and pSubscribe so we can drive the server in-process. */
  noListen?:   boolean;
}

export interface WsServerHandles {
  httpServer: ReturnType<typeof createServer>;
  wss:        WebSocketServer;
  subRedis:   IORedis;
  /** Total connected clients. Useful for /healthz and tests. */
  clientCount(): number;
  close():    Promise<void>;
}

export function startWsServer(opts: StartOptions = {}): WsServerHandles {
  const port         = opts.port         ?? parseInt(process.env.WEBSOCKET_PORT ?? '3001', 10);
  const redisUrl     = opts.redisUrl     ?? process.env.REDIS_URL ?? 'redis://localhost:6379';
  const ticketSecret = opts.ticketSecret ?? process.env.WS_TICKET_SECRET;

  if (!ticketSecret) {
    throw new Error(
      '[ws] WS_TICKET_SECRET must be set. Generate one with `openssl rand -hex 32`.',
    );
  }

  const httpServer = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, clients: clients.size }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss     = new WebSocketServer({ noServer: true });
  const clients = new Set<ClientState>();

  // ── Authenticate on the upgrade handshake (before WS protocol switch) ──
  httpServer.on('upgrade', (req, socket, head) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const ticket = url.searchParams.get('ticket');
      if (!ticket) throw new Error('missing ticket');
      const payload = verifyWsTicket(ticket, ticketSecret);
      wss.handleUpgrade(req, socket, head, (ws) => {
        const state: ClientState = {
          payload,
          jobIdSet: new Set(payload.jobIds),
          socket: ws,
        };
        clients.add(state);
        ws.on('close', () => { clients.delete(state); });
        // Initial hello so clients can confirm auth without sending anything first.
        ws.send(JSON.stringify({
          type: 'hello',
          authorizedJobIds: payload.jobIds,
          expiresAt: payload.exp,
        }));
      });
    } catch (err) {
      // Operator log only; the client just sees the connection rejected.
      console.warn('[ws] upgrade rejected:', (err as Error).message);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  // ── Subscribe to all research-events channels and fan out ──
  const subRedis = new IORedis(redisUrl, { lazyConnect: opts.noListen ?? false });

  if (!opts.noListen) {
    subRedis.psubscribe(RESEARCH_EVENTS_CHANNEL_PATTERN).catch((err) => {
      console.error('[ws] psubscribe failed:', err);
    });
  }

  subRedis.on('pmessage', (_pattern, channel, message) => {
    const jobId = jobIdFromChannel(channel);
    if (!jobId) return;
    // Validate before fan-out so a malformed publish does not crash clients.
    let payloadStr: string;
    try {
      const parsed = parseResearchEvent(JSON.parse(message));
      payloadStr = JSON.stringify(parsed);
    } catch (err) {
      console.warn(`[ws] dropping malformed event on ${channel}:`, (err as Error).message);
      return;
    }
    for (const client of clients) {
      if (!client.jobIdSet.has(jobId)) continue;
      // Ticket may have expired mid-connection; close in that case.
      if (client.payload.exp <= Math.floor(Date.now() / 1000)) {
        client.socket.close(4001, 'ticket expired');
        clients.delete(client);
        continue;
      }
      if (client.socket.readyState === WS.OPEN) {
        client.socket.send(payloadStr);
      }
    }
  });

  if (!opts.noListen) {
    httpServer.listen(port, () => {
      console.log(`[ws] listening on :${port}, redis ${redisUrl}`);
    });
  }

  return {
    httpServer,
    wss,
    subRedis,
    clientCount: () => clients.size,
    async close() {
      for (const c of clients) c.socket.terminate();
      clients.clear();
      wss.close();
      await subRedis.quit().catch(() => { /* ignore */ });
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}

// Allow direct invocation: `node server/ws.js`
// We check import.meta.url against process.argv[1] (ESM idiom for "is this
// the entry module") rather than require.main, because we're ESM.
const isDirect = import.meta.url === `file://${process.argv[1]}`;
if (isDirect) {
  startWsServer();
}
