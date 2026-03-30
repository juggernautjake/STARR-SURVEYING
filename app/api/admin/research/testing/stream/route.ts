// app/api/admin/research/testing/stream/route.ts
// Server-Sent Events (SSE) stream for real-time pipeline events
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

  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return new Response('projectId is required', { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection event
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', projectId })}\n\n`));

      // Poll the worker's live log registry for events
      let running = true;
      let lastLogCount = 0;

      const poll = async () => {
        while (running) {
          try {
            if (WORKER_URL && WORKER_API_KEY) {
              const res = await fetch(`${WORKER_URL}/research/logs/${projectId}`, {
                headers: {
                  'Authorization': `Bearer ${WORKER_API_KEY}`,
                },
              });

              if (res.ok) {
                const data = await res.json();
                const logs = data.logs || data.log || [];

                // Only send new logs
                if (logs.length > lastLogCount) {
                  const newLogs = logs.slice(lastLogCount);
                  for (const log of newLogs) {
                    controller.enqueue(encoder.encode(
                      `data: ${JSON.stringify({ type: 'log', ...log })}\n\n`
                    ));
                  }
                  lastLogCount = logs.length;
                }

                // Check if pipeline completed
                if (data.status === 'complete' || data.status === 'failed') {
                  controller.enqueue(encoder.encode(
                    `data: ${JSON.stringify({ type: 'complete', status: data.status })}\n\n`
                  ));
                  running = false;
                  controller.close();
                  return;
                }
              }
            }
          } catch {
            // Silently continue polling
          }

          // Poll every 1 second
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      };

      poll();

      // Heartbeat every 15 seconds
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
      }, 15000);

      // Clean up on abort
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
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
