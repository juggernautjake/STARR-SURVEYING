// app/api/admin/research/testing/stream/route.ts
// Server-Sent Events (SSE) stream for real-time pipeline events.
// Polls the worker's live-log registry and forwards new entries to the client.
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

const WORKER_URL = process.env.WORKER_URL || '';
const WORKER_API_KEY = process.env.WORKER_API_KEY || '';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || (session.user as any).role !== 'admin') {
    return new Response('Unauthorized', { status: 401 });
  }

  // Support both `projectId` (primary) and `runId` (alias) query params.
  const projectId =
    req.nextUrl.searchParams.get('projectId') ||
    req.nextUrl.searchParams.get('runId');

  if (!projectId) {
    return new Response('projectId (or runId) is required', { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // Stream already closed
        }
      };

      // Announce connection
      send({ type: 'connected', projectId });

      let running = true;
      let lastLogCount = 0;

      const poll = async () => {
        while (running) {
          try {
            if (WORKER_URL && WORKER_API_KEY) {
              const res = await fetch(`${WORKER_URL}/research/logs/${projectId}`, {
                headers: { 'Authorization': `Bearer ${WORKER_API_KEY}` },
                signal: AbortSignal.timeout(5_000),
              });

              if (res.ok) {
                const data = await res.json() as Record<string, unknown>;
                const logs = (data.logs ?? data.log ?? []) as unknown[];

                // Forward only new log entries since last poll
                if (logs.length > lastLogCount) {
                  const newLogs = logs.slice(lastLogCount);
                  for (const log of newLogs) {
                    send({ type: 'log', ...(log as Record<string, unknown>) });
                  }
                  lastLogCount = logs.length;
                }

                // Detect pipeline completion
                if (data.status === 'complete' || data.status === 'failed') {
                  send({ type: 'complete', status: data.status });
                  running = false;
                  try { controller.close(); } catch { /* already closed */ }
                  return;
                }
              }
            }
          } catch {
            // Network hiccup — continue polling; client heartbeat keeps the
            // connection alive until the abort signal fires.
          }

          await new Promise<void>((resolve) => setTimeout(resolve, 1000));
        }
      };

      poll();

      // Heartbeat comment line — keeps proxies / Vercel from closing the stream
      const heartbeat = setInterval(() => {
        if (!running) {
          clearInterval(heartbeat);
          return;
        }
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          running = false;
          clearInterval(heartbeat);
        }
      }, 15_000);

      // Clean up when the client disconnects
      req.signal.addEventListener('abort', () => {
        running = false;
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      // Disable nginx/proxy buffering so events reach the client immediately
      'X-Accel-Buffering': 'no',
    },
  });
}
