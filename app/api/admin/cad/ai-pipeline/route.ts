// app/api/admin/cad/ai-pipeline/route.ts
//
// POST /api/admin/cad/ai-pipeline
//
// Phase 6 — server entry point that runs the AI Drawing Engine
// pipeline against an uploaded job payload. The Phase 6 spec
// originally called for a separate DigitalOcean worker; in
// practice we already invoke Claude from `lib/research/`
// inside Vercel functions (5min maxDuration) and that envelope
// is enough for a deed parse + reconciliation pass. Putting the
// AI pipeline in a Next.js API route keeps the deploy story
// simple — no separate droplet, no separate package.
//
// Body: AIJobPayload (the same shape the in-process orchestrator
// accepts). Response: AIJobResult.
//
// Claude integration: when `deedData.calls.length === 0` AND
// `deedData.rawText` is non-empty AND the regex parser produces
// low confidence, we fall back to the Claude-assisted parser
// before invoking the orchestrator. ANTHROPIC_API_KEY missing →
// silently skips Claude (regex-only) and surfaces a warning in
// the response.
//
// Auth: admin / developer / equipment_manager (mirrors the
// rest of the /admin/* routes). CAD-specific role gating can
// land later.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { runAIPipeline } from '@/lib/cad/ai-engine/pipeline';
import { parseCallsRegex } from '@/lib/cad/ai-engine/deed-parser';
import {
  parseCallsWithClaude,
  MissingApiKeyError,
} from '@/lib/cad/ai-engine/claude-deed-parser';
import { fetchEnrichmentData } from '@/lib/cad/ai-engine/enrichment';
import { applyAnswerEffects } from '@/lib/cad/ai-engine/apply-answers';
import type { AIJobPayload } from '@/lib/cad/ai-engine/types';

// 5 minutes — matches the research feature's Vision OCR ceiling
// and gives Claude headroom for a multi-call deed.
export const maxDuration = 300;

// Below this regex confidence we kick to Claude. Empirically,
// 0.5 catches the common "regex got most of the calls but
// missed the curves" case while staying off the API for
// well-formatted deeds.
const REGEX_CONFIDENCE_FALLBACK_THRESHOLD = 0.5;

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userRoles =
    (session.user as { roles?: string[] } | undefined)?.roles ?? [];
  if (
    !isAdmin(session.user.roles) &&
    !userRoles.includes('equipment_manager')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as AIJobPayload | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Body must be a JSON object matching AIJobPayload.' },
      { status: 400 }
    );
  }
  if (!Array.isArray(body.points) || body.points.length === 0) {
    return NextResponse.json(
      { error: 'Body must include a non-empty `points` array.' },
      { status: 400 }
    );
  }

  const warnings: string[] = [];

  // ── Claude-assisted deed parsing fallback ──────────────────
  if (
    body.deedData &&
    body.deedData.calls.length === 0 &&
    body.deedData.rawText &&
    body.deedData.rawText.trim().length > 0
  ) {
    // Layer 1: try regex first.
    const regexResult = parseCallsRegex(body.deedData.rawText);
    if (
      regexResult.calls.length > 0 &&
      regexResult.confidence >= REGEX_CONFIDENCE_FALLBACK_THRESHOLD
    ) {
      body.deedData.calls = regexResult.calls;
    } else {
      // Layer 2: Claude. Phase 6 §1922 — retry once with a small
      // back-off before falling through to regex output, so a
      // transient Anthropic 503 doesn't poison an otherwise-clean
      // pipeline run.
      try {
        const claudeResult = await callClaudeWithRetry(
          body.deedData.rawText
        );
        body.deedData.calls = claudeResult.calls;
        // Merge any deedMeta Claude extracted that wasn't already
        // populated on the inbound payload (don't overwrite
        // surveyor-provided values).
        for (const [key, value] of Object.entries(
          claudeResult.deedMeta
        ) as Array<[keyof typeof claudeResult.deedMeta, string]>) {
          if (!body.deedData[key]) {
            (body.deedData as unknown as Record<string, unknown>)[key] =
              value;
          }
        }
        if (regexResult.calls.length > 0) {
          warnings.push(
            `Regex parser had low confidence (${regexResult.confidence.toFixed(2)}); ` +
              `Claude extracted ${claudeResult.calls.length} calls instead.`
          );
        }
      } catch (err) {
        if (err instanceof MissingApiKeyError) {
          // API key not configured — fall back to regex output
          // even if it's low-confidence.
          if (regexResult.calls.length > 0) {
            body.deedData.calls = regexResult.calls;
            warnings.push(
              `ANTHROPIC_API_KEY not set; using low-confidence regex output ` +
                `(${regexResult.calls.length} calls, ` +
                `confidence ${regexResult.confidence.toFixed(2)}).`
            );
          } else {
            warnings.push(
              'ANTHROPIC_API_KEY not set and regex parser found zero calls; ' +
                'reconciliation will be skipped.'
            );
          }
        } else {
          console.warn(
            '[admin/cad/ai-pipeline] Claude parse failed; falling back to regex',
            { error: err instanceof Error ? err.message : String(err) }
          );
          if (regexResult.calls.length > 0) {
            body.deedData.calls = regexResult.calls;
            warnings.push(
              `Claude parse failed (${err instanceof Error ? err.message : String(err)}); ` +
                `using regex output (${regexResult.calls.length} calls).`
            );
          } else {
            warnings.push(
              `Claude parse failed (${err instanceof Error ? err.message : String(err)}) ` +
                'and regex parser found zero calls; reconciliation skipped.'
            );
          }
        }
      }
    }
  }

  // ── Run pipeline + §27 enrichment in parallel ──────────────
  // The pipeline is synchronous + pure, but JS will still pump
  // microtasks while enrichment awaits the USGS HTTP round-trip.
  // Wrapping the pipeline call in Promise.resolve lets us await
  // both in one shot without blocking the elevation lookup on
  // pipeline completion.
  const enrichmentPromise = fetchEnrichmentData({
    latLon: body.projectLatLon ?? null,
  });
  let result = runAIPipeline(body);
  result.warnings = [...warnings, ...result.warnings];
  try {
    result.enrichmentData = await enrichmentPromise;
  } catch (err) {
    result.warnings.push(
      'Online enrichment failed: ' +
        (err instanceof Error ? err.message : 'unknown')
    );
  }

  // ── §28.5 Fold clarifying-question answers back in ─────────
  // The deliberation engine just produced a fresh question set;
  // any answers carried in `body.answers` come from prior rounds
  // and need their deterministic effects re-applied so the new
  // result reflects them (e.g. fence material stays stamped).
  if (body.answers && body.answers.length > 0) {
    result = applyAnswerEffects(result, body.answers);
  }

  console.log('[admin/cad/ai-pipeline] ok', {
    points: body.points.length,
    deed: !!body.deedData,
    deed_calls: body.deedData?.calls.length ?? 0,
    features: result.features.length,
    annotations: result.annotations.length,
    review_total: result.reviewQueue.summary.totalElements,
    processing_ms: result.processingTimeMs,
    actor_email: session.user.email,
  });

  return NextResponse.json(result);
}, { routeName: 'admin/cad/ai-pipeline#post' });

// Phase 6 §1922 — wrap `parseCallsWithClaude` in a single retry
// with a 1-second backoff. We only retry on generic Error
// (network blips, 5xx). `MissingApiKeyError` rethrows immediately
// so the route's fall-through-to-regex branch fires.
async function callClaudeWithRetry(
  rawText: string,
): Promise<Awaited<ReturnType<typeof parseCallsWithClaude>>> {
  try {
    return await parseCallsWithClaude(rawText);
  } catch (err) {
    if (err instanceof MissingApiKeyError) throw err;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return parseCallsWithClaude(rawText);
  }
}
