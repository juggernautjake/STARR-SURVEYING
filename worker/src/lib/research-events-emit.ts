// worker/src/lib/research-events-emit.ts
//
// Worker-side helper for publishing research events into Redis. Consumed
// by `server/ws.ts` (see worker/src/shared/research-events.ts for the catalog).
//
// Architecture rationale (per Phase A spec, answer D): the worker MUST
// publish via Redis pub/sub rather than connect directly to the WS
// server. This decouples the two processes — the WS server can restart
// without losing in-flight worker events (Redis just buffers nothing,
// but a redeploy is fast), and we can horizontally scale workers
// without each needing its own outbound WS connection.
//
// We also do NOT use BullMQ events for application-level progress.
// BullMQ events are job-lifecycle (queued/active/completed) and don't
// give us the granularity we need (per-document, per-CAPTCHA, etc.).
// Application-level events get their own channel.

import IORedis from 'ioredis';
import {
  researchEventsChannel,
  serializeResearchEvent,
  type ResearchEvent,
} from '../shared/research-events.js';

let pubClient: IORedis | null = null;

/**
 * Get (or lazily create) the publisher Redis client. Reusing the
 * connection across emits avoids the cost of opening a TCP socket per
 * event. Disconnects are handled by ioredis automatically.
 */
function getPublisher(): IORedis {
  if (pubClient) return pubClient;
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  pubClient = new IORedis(url, {
    // Don't crash the worker if Redis is briefly unreachable — telemetry is
    // best-effort. Reconnect aggressively.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 3,
  });
  pubClient.on('error', (err) => {
    // Single warn per connection burst; ioredis emits on every reconnect attempt.
    console.warn('[research-events-emit] redis error:', err.message);
  });
  return pubClient;
}

/**
 * Override the publisher (for tests). Pass null to fall back to the
 * lazy-initialized real client on the next emit.
 */
export function _setPublisherForTesting(client: IORedis | null): void {
  pubClient = client;
}

/**
 * Publish a single research event. Best-effort: a failure here will warn
 * but never throw. The worker's pipeline does not block on telemetry.
 *
 * Validation: every event is parsed against the zod schema before being
 * placed on the wire. A malformed event is a programmer error and will
 * throw a ZodError — that IS surfaced because it indicates a bug in the
 * caller, not infrastructure flakiness.
 */
export async function emit(event: ResearchEvent): Promise<void> {
  // Schema validation — synchronous, throws ZodError on misuse.
  const message = serializeResearchEvent(event);
  const channel = researchEventsChannel(event.jobId);
  try {
    await getPublisher().publish(channel, message);
  } catch (err) {
    // Telemetry is best-effort — log and move on.
    console.warn('[research-events-emit] publish failed:', (err as Error).message);
  }
}

/**
 * Convenience: emit a job_started event with a fresh timestamp. Equivalent
 * helpers exist if needed but emit() is the canonical entry point.
 */
export async function emitJobStarted(args: {
  jobId: string;
  phases: string[];
  countyFips?: string;
}): Promise<void> {
  await emit({
    type:      'job_started',
    jobId:     args.jobId,
    phases:    args.phases,
    countyFips: args.countyFips,
    timestamp: new Date().toISOString(),
  });
}

/** Close the publisher connection. Call from worker shutdown hooks. */
export async function closeEmitter(): Promise<void> {
  if (!pubClient) return;
  try { await pubClient.quit(); } catch { /* ignore */ }
  pubClient = null;
}
