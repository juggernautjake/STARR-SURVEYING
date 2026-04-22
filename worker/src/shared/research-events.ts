// worker/src/shared/research-events.ts
//
// Canonical event catalog for the Starr Recon real-time progress channel.
//
// **Location rationale:** the worker is the producer of these events, so
// the catalog lives inside worker/src/ to satisfy worker tsconfig's
// `rootDir: ./src` constraint. The Next.js app (consumer) imports this
// file via the `@/worker/src/shared/...` path alias from root tsconfig.
// The standalone WS server (server/ws.ts) imports it via relative path.
//
// All three consumers reference exactly the same source file — there is
// no duplication and no risk of schema drift.
//
// This file is the single source of truth for the event shape that flows
// from the worker (emit side) through Redis pub/sub to the WebSocket
// server, then out to the Next.js client (consume side). Both sides
// import from here — never define event shapes ad-hoc.
//
// Architecture (see docs/platform/WEBSOCKET_ARCHITECTURE.md):
//
//   worker emit() ──► Redis channel "research-events:<jobId>"
//                                     │
//                                     ▼
//                                 server/ws.ts
//                                     │
//                                     ▼
//                          per-client filter (by user's authorized jobIds)
//                                     │
//                                     ▼
//                          useResearchProgress(jobId) hook
//
// Why a discriminated union: TypeScript exhaustiveness checking at every
// switch site, no string-typed `event.type === 'foo'` guesswork.
//
// Why zod schemas: round-trip validation at both ends (the WS server
// validates outgoing payloads in dev to catch worker bugs; the client
// validates incoming payloads to defend against version skew).
//
// Versioning policy: any addition is backward compatible (older clients
// that don't recognize a new event type just ignore it). Renaming or
// removing an event is a BREAKING change and requires bumping
// `RESEARCH_EVENTS_PROTOCOL_VERSION` + adding a server-side adapter for
// old clients during a deprecation window. Update
// docs/planning/in-progress/PHASE_A_INTEGRATION_PREP.md when bumping.

import { z } from 'zod';

/** Bumped on every breaking change to the event schema. Clients send this on connect. */
export const RESEARCH_EVENTS_PROTOCOL_VERSION = 1;

// ── Common fields ──────────────────────────────────────────────────────────

const baseFields = {
  /** Job (research_projects.id) this event belongs to. */
  jobId: z.string().uuid(),
  /** Wall-clock at the worker, ISO8601. */
  timestamp: z.string(),
};

// ── Individual event schemas ───────────────────────────────────────────────

export const jobStartedSchema = z.object({
  ...baseFields,
  type:     z.literal('job_started'),
  /** What the worker plans to attempt; informational. */
  phases:   z.array(z.string()),
  countyFips: z.string().optional(),
});

export const phaseStartedSchema = z.object({
  ...baseFields,
  type:    z.literal('phase_started'),
  phase:   z.string(),
  /** Adapter id (filename stem) handling this phase, if applicable. */
  adapterId: z.string().optional(),
});

export const documentDiscoveredSchema = z.object({
  ...baseFields,
  type:           z.literal('document_discovered'),
  documentId:     z.string(),
  documentType:   z.string(),
  instrumentNumber: z.string().optional(),
  /** Storage key (storage.ts namespace) — empty string until upload completes. */
  storageKey:     z.string().default(''),
});

export const captchaRequiredSchema = z.object({
  ...baseFields,
  type:           z.literal('captcha_required'),
  challengeType:  z.enum([
    'turnstile', 'recaptcha-v2', 'recaptcha-v2-invisible',
    'recaptcha-v3', 'recaptcha-enterprise', 'hcaptcha', 'datadome', 'unknown',
  ]),
  pageUrl:        z.string(),
  /** Estimated time the worker thinks this will take to clear. */
  estimatedSolveSeconds: z.number().int().nonnegative().optional(),
});

export const captchaResolvedSchema = z.object({
  ...baseFields,
  type:           z.literal('captcha_resolved'),
  challengeType:  z.string(),
  /** 'auto' = solver token; 'manual' = human handoff; 'failed' = escalation. */
  resolution:     z.enum(['auto', 'manual', 'failed']),
  /** Total cost in USD (sum of solve attempts). */
  costUsd:        z.number().nonnegative().default(0),
});

export const phaseCompletedSchema = z.object({
  ...baseFields,
  type:           z.literal('phase_completed'),
  phase:          z.string(),
  durationMs:     z.number().int().nonnegative(),
  /** Documents produced in this phase. */
  documentCount:  z.number().int().nonnegative().default(0),
});

export const jobCompletedSchema = z.object({
  ...baseFields,
  type:           z.literal('job_completed'),
  durationMs:     z.number().int().nonnegative(),
  documentCount:  z.number().int().nonnegative(),
  /** Total CAPTCHA cost across all phases. */
  totalCostUsd:   z.number().nonnegative().default(0),
});

export const jobFailedSchema = z.object({
  ...baseFields,
  type:           z.literal('job_failed'),
  /** Where the failure happened. */
  phase:          z.string().optional(),
  /** Operator-friendly summary; not a stack trace. */
  errorMessage:   z.string(),
  /** Stable category for client UI to branch on. */
  errorCategory:  z.enum([
    'unknown', 'captcha_unsolved', 'site_down', 'auth_required',
    'rate_limited', 'pricing_failure', 'timeout', 'data_validation',
  ]).default('unknown'),
});

// ── Discriminated union ────────────────────────────────────────────────────

export const researchEventSchema = z.discriminatedUnion('type', [
  jobStartedSchema,
  phaseStartedSchema,
  documentDiscoveredSchema,
  captchaRequiredSchema,
  captchaResolvedSchema,
  phaseCompletedSchema,
  jobCompletedSchema,
  jobFailedSchema,
]);

export type ResearchEvent       = z.infer<typeof researchEventSchema>;
export type JobStartedEvent     = z.infer<typeof jobStartedSchema>;
export type PhaseStartedEvent   = z.infer<typeof phaseStartedSchema>;
export type DocumentDiscoveredEvent = z.infer<typeof documentDiscoveredSchema>;
export type CaptchaRequiredEvent  = z.infer<typeof captchaRequiredSchema>;
export type CaptchaResolvedEvent  = z.infer<typeof captchaResolvedSchema>;
export type PhaseCompletedEvent   = z.infer<typeof phaseCompletedSchema>;
export type JobCompletedEvent     = z.infer<typeof jobCompletedSchema>;
export type JobFailedEvent        = z.infer<typeof jobFailedSchema>;

// ── Redis pub/sub channel naming ───────────────────────────────────────────

/**
 * Returns the Redis channel name for a given job. The WS server subscribes
 * to a wildcard pattern (`research-events:*`) and fans out to clients
 * filtered by their authorized jobIds.
 *
 * Channel namespacing convention:
 *   research-events:<jobId>
 */
export function researchEventsChannel(jobId: string): string {
  return `research-events:${jobId}`;
}

/** Wildcard pattern for the WS server's pSubscribe call. */
export const RESEARCH_EVENTS_CHANNEL_PATTERN = 'research-events:*';

/** Inverse of researchEventsChannel — extract jobId from a channel name. */
export function jobIdFromChannel(channel: string): string | null {
  const m = /^research-events:(.+)$/.exec(channel);
  return m ? m[1]! : null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Validate an arbitrary JSON value against the event schema. Returns the
 * parsed event or throws ZodError. Use on both ends of the pipe.
 */
export function parseResearchEvent(input: unknown): ResearchEvent {
  return researchEventSchema.parse(input);
}

/**
 * Stringify an event for transport. Always uses the schema's parse step
 * first so we never put an invalid event onto the wire.
 */
export function serializeResearchEvent(event: ResearchEvent): string {
  // Re-parse to ensure default fields are populated and types are coerced.
  const validated = researchEventSchema.parse(event);
  return JSON.stringify(validated);
}
