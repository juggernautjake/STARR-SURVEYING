// worker/src/websocket/progress-server.ts — Phase 11 Module H
// WebSocket server for real-time pipeline progress updates.
// Clients connect with projectId to receive phase-by-phase progress.
//
// Spec §11.9.2 — Real-Time Progress via WebSocket

import { WebSocketServer, WebSocket } from 'ws';
import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'http';
import type { ProgressEvent } from '../types/expansion.js';
import { verifyWsTicket } from '../shared/ws-ticket.js';

// ── Structured logger (mirrors PipelineLogger style without requiring projectId) ──

function wsLog(
  level: 'info' | 'warn' | 'error',
  context: string,
  message: string,
): void {
  const ts = new Date().toISOString();
  // eslint-disable-next-line no-console
  console[level](`[${ts}] [WebSocket] [${context}] ${message}`);
}

// ── Progress Server ─────────────────────────────────────────────────────────

export class ProgressServer {
  private wss: WebSocketServer;
  private clients: Map<string, Set<WebSocket>> = new Map();
  private readonly ticketSecret: string | undefined;

  constructor(
    server: any,
    path: string = '/ws/research',
    opts: { ticketSecret?: string } = {},
  ) {
    // Read once at construction so tests can inject one, and so a secret that
    // appears in the environment AFTER boot cannot silently change the auth
    // posture of an already-running server. Mirrors server/ws.ts.
    this.ticketSecret = opts.ticketSecret ?? process.env.WS_TICKET_SECRET;
    if (!this.ticketSecret) {
      wsLog(
        'warn',
        'startup',
        'WS_TICKET_SECRET is not set — every ticket-bearing connection will be ' +
          'REJECTED. Only WORKER_API_KEY service connections can attach.',
      );
    }

    this.wss = new WebSocketServer({ server, path });

    this.wss.on('connection', (ws, req: IncomingMessage) => {
      // ── Parse URL safely — malformed URLs must not crash the server ───
      let projectId: string | null = null;
      let token: string | null = null;
      try {
        // req.headers.host may be undefined on certain proxy configs; fall back
        // to 'localhost' so that new URL() never throws due to a missing base.
        const base = `ws://${req.headers.host || 'localhost'}`;
        const url = new URL(req.url ?? '/', base);
        projectId = url.searchParams.get('projectId');
        token = url.searchParams.get('token');
      } catch (err: any) {
        wsLog('warn', 'connection', `URL parse failed: ${err.message}`);
        ws.close(4003, 'Malformed request URL');
        return;
      }

      if (!projectId) {
        ws.close(4002, 'Missing projectId parameter');
        return;
      }

      // Sanitise projectId — reject anything containing path-traversal chars
      // or invalid formats (must start and end with alphanumeric character).
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,126}[a-zA-Z0-9]$/.test(projectId) &&
          !/^[a-zA-Z0-9]$/.test(projectId)) {
        ws.close(4004, 'Invalid projectId format');
        return;
      }

      // Authorisation runs AFTER the projectId is known, because a ticket
      // authorises SPECIFIC projects rather than the connection as a whole.
      // The format check above leaks nothing to an unauthenticated caller: the
      // regex is public and its answer does not depend on any stored state.
      const auth = this.authorize(token, projectId);
      if (!auth.ok) {
        wsLog('warn', projectId, `Connection rejected: ${auth.log}`);
        ws.close(auth.code, auth.reason);
        return;
      }

      // Register client for this project
      if (!this.clients.has(projectId)) {
        this.clients.set(projectId, new Set());
      }
      this.clients.get(projectId)!.add(ws);

      wsLog(
        'info',
        projectId,
        `Client connected (${this.clients.get(projectId)!.size} active)`,
      );

      // Mark socket as alive for heartbeat
      (ws as any).isAlive = true;

      // Send welcome message
      try {
        ws.send(
          JSON.stringify({
            type: 'connected',
            projectId,
            message: 'Connected to STARR RECON progress stream',
          }),
        );
      } catch (err: any) {
        wsLog('warn', projectId, `Welcome send failed: ${err.message}`);
      }

      // Handle disconnect
      ws.on('close', () => {
        this.clients.get(projectId!)?.delete(ws);
        if (this.clients.get(projectId!)?.size === 0) {
          this.clients.delete(projectId!);
        }
        wsLog('info', projectId!, 'Client disconnected');
      });

      // Handle errors on the individual socket
      ws.on('error', (err: Error) => {
        wsLog('warn', projectId!, `Socket error: ${err.message}`);
      });

      // Handle pings to keep connection alive
      ws.on('pong', () => {
        (ws as any).isAlive = true;
      });
    });

    // Unhandled server-level errors must not crash the process
    this.wss.on('error', (err: Error) => {
      wsLog('error', 'server', `WebSocket server error: ${err.message}`);
    });

    // Heartbeat — ping every 30 seconds to detect dead connections
    const interval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if ((ws as any).isAlive === false) {
          ws.terminate();
          return;
        }
        (ws as any).isAlive = false;
        ws.ping();
      });
    }, 30000);

    this.wss.on('close', () => {
      clearInterval(interval);
    });
  }

  /**
   * Broadcast progress to all clients watching a project.
   */
  broadcast(event: ProgressEvent): void {
    const clients = this.clients.get(event.projectId);
    if (!clients || clients.size === 0) return;

    const message = JSON.stringify({
      type: 'progress',
      ...event,
      timestamp: new Date().toISOString(),
    });

    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  /**
   * Send phase start event.
   */
  phaseStart(
    projectId: string,
    phase: number,
    phaseName: string,
  ): void {
    this.broadcast({
      projectId,
      phase,
      phaseName,
      status: 'running',
      detail: `Starting Phase ${phase}: ${phaseName}`,
    });
  }

  /**
   * Send phase completion event.
   */
  phaseComplete(
    projectId: string,
    phase: number,
    phaseName: string,
    durationMs: number,
  ): void {
    this.broadcast({
      projectId,
      phase,
      phaseName,
      status: 'completed',
      timing: {
        elapsed: durationMs / 1000,
        estimated: 0,
      },
      detail: `Phase ${phase} completed in ${(durationMs / 1000).toFixed(1)}s`,
    });
  }

  /**
   * Send phase failure event.
   */
  phaseFailed(
    projectId: string,
    phase: number,
    phaseName: string,
    error: string,
  ): void {
    this.broadcast({
      projectId,
      phase,
      phaseName,
      status: 'failed',
      detail: `Phase ${phase} failed: ${error}`,
    });
  }

  /**
   * Send pipeline completion event.
   */
  pipelineComplete(projectId: string): void {
    const clients = this.clients.get(projectId);
    if (!clients) return;

    const message = JSON.stringify({
      type: 'complete',
      projectId,
      timestamp: new Date().toISOString(),
    });

    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  /**
   * Get number of connected clients for a project.
   */
  getClientCount(projectId: string): number {
    return this.clients.get(projectId)?.size || 0;
  }

  /**
   * Shut the server down and release the heartbeat timer.
   *
   * The 30s heartbeat is only cleared by the `wss` 'close' event, so without
   * this there is no way for a caller — or a test — to stop the interval, and
   * the process stays alive holding a timer for a server nobody is using.
   */
  close(): Promise<void> {
    return new Promise((resolve) => {
      for (const clients of this.clients.values()) {
        for (const ws of clients) ws.terminate();
      }
      this.clients.clear();
      this.wss.close(() => resolve());
    });
  }

  /**
   * Get total connected clients.
   */
  getTotalClients(): number {
    let total = 0;
    for (const clients of this.clients.values()) {
      total += clients.size;
    }
    return total;
  }

  // ── Authorisation ───────────────────────────────────────────────────────
  //
  // This method used to end with `return token.length > 0` under a comment
  // reading "For now, accept any non-empty token". That is a fail-OPEN auth
  // check: every branch above it could miss and the connection was still
  // admitted. It was inert only because nothing constructs this class — which
  // makes it a trap for whoever wires it up, not a safe default.
  //
  // The ticket this server needed already existed in the same repository.
  // `worker/src/shared/ws-ticket.ts` signs `{ userId, jobIds, iat, exp }`, and
  // `app/api/ws/ticket/route.ts` fills `jobIds` with `research_projects.id`
  // values it has confirmed the caller owns (`created_by = session email`).
  // Those ids are the same namespace as this server's `projectId`, so the
  // ticket carries per-project authorisation and we enforce it rather than
  // stopping at "the signature is valid" — otherwise any authenticated user
  // could stream any other user's run.
  //
  // Fails CLOSED in every direction: no token, no configured secret, bad
  // signature, expired ticket, or a project the ticket does not name.

  private authorize(
    token: string | null,
    projectId: string,
  ):
    | { ok: true; principal: string }
    | { ok: false; code: number; reason: string; log: string } {
    if (!token) {
      return { ok: false, code: 4001, reason: 'Unauthorized', log: 'no token supplied' };
    }

    // Service-to-service path: the worker's own API key streams any project.
    // Compared in constant time, and only when the key is actually configured
    // — an unset WORKER_API_KEY must never make an empty token match.
    const apiKey = process.env.WORKER_API_KEY;
    if (apiKey && constantTimeEquals(token, apiKey)) {
      return { ok: true, principal: 'service:worker-api-key' };
    }

    if (!this.ticketSecret) {
      return {
        ok: false,
        code: 4001,
        reason: 'Unauthorized',
        log: 'WS_TICKET_SECRET is not configured — cannot verify any ticket',
      };
    }

    let payload;
    try {
      payload = verifyWsTicket(token, this.ticketSecret);
    } catch (err: any) {
      // Operator-readable reason to the log; the client learns only that it
      // was rejected, so a probe cannot tell "expired" from "forged".
      return {
        ok: false,
        code: 4001,
        reason: 'Unauthorized',
        log: `ticket rejected (${err.message})`,
      };
    }

    if (!payload.jobIds.includes(projectId)) {
      return {
        ok: false,
        code: 4005,
        reason: 'Forbidden',
        log: `ticket for ${payload.userId} does not authorise this project ` +
          `(authorises ${payload.jobIds.length})`,
      };
    }

    return { ok: true, principal: payload.userId };
  }
}

/** Length-safe constant-time string comparison. */
function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, so the length check has to
  // come first. Length is not the secret here; the key material is.
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
