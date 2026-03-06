// worker/src/websocket/progress-server.ts — Phase 11 Module H
// WebSocket server for real-time pipeline progress updates.
// Clients connect with projectId to receive phase-by-phase progress.
//
// Spec §11.9.2 — Real-Time Progress via WebSocket

import { WebSocketServer, WebSocket } from 'ws';
import type { ProgressEvent } from '../types/expansion.js';

// ── Progress Server ─────────────────────────────────────────────────────────

export class ProgressServer {
  private wss: WebSocketServer;
  private clients: Map<string, Set<WebSocket>> = new Map();

  constructor(server: any, path: string = '/ws/research') {
    this.wss = new WebSocketServer({ server, path });

    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url!, `ws://${req.headers.host}`);
      const projectId = url.searchParams.get('projectId');
      const token = url.searchParams.get('token');

      // Validate auth token
      if (!this.validateToken(token)) {
        ws.close(4001, 'Unauthorized');
        return;
      }

      if (!projectId) {
        ws.close(4002, 'Missing projectId parameter');
        return;
      }

      // Register client for this project
      if (!this.clients.has(projectId)) {
        this.clients.set(projectId, new Set());
      }
      this.clients.get(projectId)!.add(ws);

      console.log(
        `[WebSocket] Client connected for project ${projectId} (${this.clients.get(projectId)!.size} clients)`,
      );

      // Send welcome message
      ws.send(
        JSON.stringify({
          type: 'connected',
          projectId,
          message: 'Connected to STARR RECON progress stream',
        }),
      );

      // Handle disconnect
      ws.on('close', () => {
        this.clients.get(projectId)?.delete(ws);
        if (this.clients.get(projectId)?.size === 0) {
          this.clients.delete(projectId);
        }
        console.log(
          `[WebSocket] Client disconnected from project ${projectId}`,
        );
      });

      // Handle pings to keep connection alive
      ws.on('pong', () => {
        (ws as any).isAlive = true;
      });
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
   * Get total connected clients.
   */
  getTotalClients(): number {
    let total = 0;
    for (const clients of this.clients.values()) {
      total += clients.size;
    }
    return total;
  }

  // ── Token Validation ────────────────────────────────────────────────────

  private validateToken(token: string | null): boolean {
    if (!token) return false;

    // Check against worker API key for direct API access
    const apiKey = process.env.WORKER_API_KEY;
    if (apiKey && token === apiKey) return true;

    // In production, validate Supabase JWT here
    // For now, accept any non-empty token
    return token.length > 0;
  }
}
