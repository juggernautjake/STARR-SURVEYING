// app/api/admin/research/testing/stream/route.ts
// Server-Sent Events (SSE) stream for real-time pipeline events.
// Polls the worker's /research/status endpoint and forwards new log entries
// and stage updates to the client.
//
// Bug fixed (pass 10): Previously polled /research/logs which:
//   (a) Returns 404 while the pipeline is running (no live data at all).
//   (b) Returns { projectId, log: [...] } after completion — no `status` field,
//       so the completion check (data.status === 'complete') was always false
//       and the stream ran until the 10-minute safety valve every time.
// The correct endpoint is /research/status which returns:
//   { status: 'running', log: [...], currentStage: '...' }  — while running
//   { status: 'complete'/'failed', log: [...] }             — when done
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

const WORKER_URL = process.env.WORKER_URL || '';
const WORKER_API_KEY = process.env.WORKER_API_KEY || '';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || session.user.role !== 'admin') {
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
      let lastTimelineCount = 0;
      // Safety valve: SSE streams that never receive a 'complete'/'failed' status
      // from the worker (e.g. when the worker crashes mid-run) would otherwise
      // run forever, consuming server resources and keeping Vercel functions alive.
      const MAX_STREAM_MS = 10 * 60 * 1000; // 10 minutes
      const streamStart = Date.now();

      const poll = async () => {
        while (running) {
          try {
            if (WORKER_URL && WORKER_API_KEY) {
              // Poll /research/status (not /research/logs) — the status endpoint
              // returns live log entries AND a `status` field both while running
              // and after completion, enabling correct completion detection.
              const res = await fetch(`${WORKER_URL}/research/status/${projectId}`, {
                headers: { 'Authorization': `Bearer ${WORKER_API_KEY}` },
                signal: AbortSignal.timeout(5_000),
              });

              if (res.ok) {
                const data = await res.json() as Record<string, unknown>;
                // logs can be the worker's LogEntry[] or any log array shape
                const logs = (Array.isArray(data.logs) ? data.logs
                  : Array.isArray(data.log) ? data.log
                  : []) as Record<string, unknown>[];

                // Forward stage update if present
                if (typeof data.currentStage === 'string' && data.currentStage) {
                  send({ type: 'stage', stage: data.currentStage, message: data.message ?? '' });
                }

                // Forward only NEW timeline events since last poll — these include
                // file/line metadata for the CodeViewer and per-step granularity
                // for the ExecutionTimeline.  Timeline events are the richer
                // representation of the same LayerAttempt data that raw logs carry,
                // so when timeline events are available we prefer them.
                const timeline = Array.isArray(data.timeline) ? data.timeline as Record<string, unknown>[] : [];
                const hasTimeline = timeline.length > 0;
                if (hasTimeline && timeline.length > lastTimelineCount) {
                  const newEntries = timeline.slice(lastTimelineCount);
                  for (const entry of newEntries) {
                    send({ sseType: 'tl', ...entry });
                  }
                  lastTimelineCount = timeline.length;
                }

                // Forward raw log entries only when timeline events are NOT
                // available (fallback for workers without TimelineTracker).
                // When both are present, the client would receive duplicates.
                if (!hasTimeline && logs.length > lastLogCount) {
                  const newLogs = logs.slice(lastLogCount);
                  for (const log of newLogs) {
                    send({ type: 'log', ...log });
                  }
                }
                // Always track lastLogCount so we don't re-send if timeline
                // stops mid-run and we fall back to raw logs.
                lastLogCount = logs.length;

                // Detect pipeline completion — /research/status always returns a
                // status field: 'running', 'complete', 'failed', or 'partial'.
                const status = typeof data.status === 'string' ? data.status : '';
                if (status === 'complete' || status === 'failed' || status === 'partial') {
                  send({ type: 'complete', status });
                  running = false;
                  try { controller.close(); } catch { /* already closed */ }
                  return;
                }
              } else if (res.status === 404) {
                // Worker doesn't know this project — it may have been evicted from
                // the in-memory cache. Treat as completion so we don't loop forever.
                send({ type: 'complete', status: 'unknown', message: 'Pipeline result no longer in worker cache' });
                running = false;
                try { controller.close(); } catch { /* already closed */ }
                return;
              }
            }

            // Safety valve: close the stream if it has been running too long.
            // Prevents zombie SSE connections when the worker never terminates.
            if (Date.now() - streamStart > MAX_STREAM_MS) {
              send({ type: 'error', message: 'Stream exceeded maximum duration (10 min); closing.' });
              running = false;
              try { controller.close(); } catch { /* already closed */ }
              return;
            }
          } catch (err) {
            // Log unexpected errors; transient network errors just continue polling.
            // AbortError is expected (timeout) and can be silently retried.
            if (err instanceof Error && err.name !== 'AbortError') {
              console.error('[TestingStream] poll error:', err.message);
            }
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
