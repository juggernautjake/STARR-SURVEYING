// app/api/admin/research/worker-status/route.ts — does the research engine exist? (plan R2)
//
// GET → the verdict from `lib/research/worker-status.ts`, from one probe of the worker's `/healthz`.
//
// Everything opinionated lives in that module; this handler does the three things a route should:
// read config, make one bounded request, and cache the answer so a page left open does not turn into
// a health-check flood against a machine that may already be struggling.
//
// ── WHY THE TIMEOUT IS SHORT ────────────────────────────────────────────────────────────────────
//
// Four seconds. This endpoint's whole job is to answer "is it there" quickly enough that the UI can
// say so before somebody clicks Run. A probe that waits 30 seconds to report a dead host has
// reproduced the problem it exists to solve.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  WORKER_PROBE_TTL_MS,
  interpretWorkerProbe,
  type WorkerHealthzBody,
  type WorkerProbe,
  type WorkerVerdict,
} from '@/lib/research/worker-status';

const PROBE_TIMEOUT_MS = 4_000;

let cached: { at: number; verdict: WorkerVerdict } | null = null;
let inFlight: Promise<WorkerVerdict> | null = null;

async function probeWorker(): Promise<WorkerVerdict> {
  const url = process.env.WORKER_URL?.trim() ?? '';
  const key = process.env.WORKER_API_KEY?.trim() ?? '';
  const startedAt = Date.now();

  if (!url || !key) {
    return interpretWorkerProbe({ configured: false, httpStatus: null, body: null, latencyMs: 0 });
  }

  let probe: WorkerProbe;
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/healthz`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: 'no-store',
    });
    // /healthz answers 503 with a full body when degraded, so the body is read on both paths — the
    // reason the browser could not launch is the most useful thing on the screen.
    const body = (await res.json().catch(() => null)) as WorkerHealthzBody | null;
    probe = { configured: true, httpStatus: res.status, body, latencyMs: Date.now() - startedAt };
  } catch (err) {
    probe = {
      configured: true,
      httpStatus: null,
      body: null,
      transportError: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - startedAt,
    };
  }
  return interpretWorkerProbe(probe);
}

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const fresh = cached && Date.now() - cached.at < WORKER_PROBE_TTL_MS;
  if (!fresh && !inFlight) {
    inFlight = probeWorker().then((verdict) => {
      cached = { at: Date.now(), verdict };
      inFlight = null;
      return verdict;
    }).catch((err) => {
      inFlight = null;
      throw err;
    });
  }

  // A cached answer is served immediately; only the first caller after expiry waits.
  const verdict = fresh ? cached!.verdict : await inFlight!;

  return NextResponse.json(
    { ...verdict, checkedAt: new Date(cached?.at ?? Date.now()).toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
