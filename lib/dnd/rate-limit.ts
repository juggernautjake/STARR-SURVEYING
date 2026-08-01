// lib/dnd/rate-limit.ts — MOVED to `lib/rate-limit.ts` on 2026-08-01. This is the forwarding address.
//
// A1-1 of docs/planning/in-progress/SURVEYING_BACKEND_ANALYSIS_2026-08-01.md.
//
// The throttle was built here, for the tabletop API, and it worked — 27 routes covered since P2-1. The
// analysis found the other half of the picture: the BUSINESS routes had no limit on anything, including a
// public contact form that sends three emails and uploads files per submission. The limiter was in the
// hobby project and the money was outside it.
//
// So the module moved up a level and grew buckets for the public surfaces. **This file re-exports rather
// than duplicating**, for the reason this repo keeps re-learning: two copies is how one gets a fix and the
// other quietly does not. `MAX_BYTES` in two places (P1-6), the fourth roll log nobody's guard listed
// (D7-2), the stage token three of four stylesheets read (D7-3) — same failure, three times.
//
// The 27 existing importers are untouched and keep working. New code should import from `@/lib/rate-limit`
// directly; this file exists so that "should" never becomes a reason to break something that works today.
export {
  RATE_LIMIT_BUCKETS,
  SWEEP_RETAIN_SEC,
  rateLimitSubject,
  windowStart,
  retryAfterSeconds,
  decide,
  checkRateLimit,
  rateLimitHeaders,
  enforceRateLimit,
  peekRateLimit,
  enforceAiLimits,
} from '@/lib/rate-limit';

export type { RateBucket, BucketPolicy, RateLimitResult, BudgetStatus } from '@/lib/rate-limit';
