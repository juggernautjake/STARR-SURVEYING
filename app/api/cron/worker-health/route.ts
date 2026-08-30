// app/api/cron/worker-health/route.ts — notice when the research worker dies, without being asked.
//
//   Vercel cron: { "path": "/api/cron/worker-health", "schedule": "17 * * * *" }
//   Hourly, at :17 rather than :00 — every cron in the world fires on the hour, and a worker that is
//   busy because eighteen other schedulers just woke is not a worker that is unhealthy.
//
// W5 of docs/planning/in-progress/RESEARCH_WORKER_REBUILD_AND_GROWTH_2026-08-26.md.
//
// ── WHY, WHEN A BANNER AND A CLI ALREADY EXIST ──────────────────────────────────────────────────
//
// `/admin/research` renders the verdict, and `npm run verify:worker` prints it with an exit code.
// Both require somebody to go and look, and the failure this is for is precisely that nobody did:
// the previous worker died by silently never coming back, and the first person to find out was the
// first person who needed it.
//
// Three callers, one brain. This route probes and notifies; it does not decide what the states mean
// (`interpretWorkerProbe`) and it does not decide what is worth saying (`decideWatchdogAlert`).
//
// ── STATE LIVES IN app_settings ─────────────────────────────────────────────────────────────────
//
// The alert policy needs to know the PREVIOUS state, because the news is the transition and not the
// state. One row under `research_worker_health`. A dedicated table for one row would be a migration
// nobody needs.
//
// ── IT WRITES THE STATE EVEN WHEN IT DOES NOT NOTIFY ────────────────────────────────────────────
//
// Easy to get backwards, and getting it backwards is silent: if the row were only written when an
// alert fired, then a recovery that is deliberately quiet would leave `unreachable` on disk, and the
// NEXT genuine outage would compare bad-to-bad and say nothing at all. The stored value is a record
// of what was last observed, not of what was last announced.

import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase';
import { notify } from '@/lib/notifications';
import { interpretWorkerProbe, type WorkerState } from '@/lib/research/worker-status';
import { decideWatchdogAlert } from '@/lib/research/worker-watchdog';

export const runtime = 'nodejs';

const SETTINGS_KEY = 'research_worker_health';
const PROBE_TIMEOUT_MS = 15_000;

/** Probe `/healthz`. Never throws — a probe that throws reports nothing, and "reports nothing" is
 *  indistinguishable from "the worker is fine" to everything downstream. */
async function probeWorker() {
  const base = (process.env.WORKER_URL ?? '').replace(/\/+$/, '');
  if (!base) return { configured: false, httpStatus: null, body: null, latencyMs: 0 };

  const started = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/healthz`, { signal: ac.signal, cache: 'no-store' });
    const body = await res.json().catch(() => null);
    return { configured: true, httpStatus: res.status, body, latencyMs: Date.now() - started };
  } catch (e) {
    // `httpStatus: null` is what tells the interpreter the request never reached the server —
    // distinct from reaching it and being told no.
    return {
      configured: true,
      httpStatus: null,
      body: null,
      transportError: e instanceof Error ? e.message : String(e),
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron/worker-health] CRON_SECRET not set');
    return NextResponse.json({ error: 'CRON_SECRET not configured.' }, { status: 500 });
  }
  if ((req.headers.get('authorization') ?? '') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const verdict = interpretWorkerProbe(await probeWorker());

  const { data: row } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle();
  const previous = ((row as { value?: { state?: WorkerState } } | null)?.value?.state ?? null);

  const decision = decideWatchdogAlert(previous, verdict);

  let notified = 0;
  if (decision.notify) {
    // Every admin who is not banned. A worker outage is not one person's problem, and the one
    // person it was routed to is the one person who is on holiday.
    //
    // ── `registered_users`, NOT `users` ────────────────────────────────────────────────────────
    //
    // The first version of this queried `from('users')`, which is not a table in this system. It
    // was the ONLY place in the repo that named it. `__tests__/schema-coverage.test.ts` caught it —
    // every table the code queries must have a CREATE statement in `seeds/`, and this one had none.
    //
    // Worth dwelling on, because of what the bug was: a watchdog that queries a non-existent table
    // gets nothing back, notifies nobody, and reports success. It would have been a watchdog that
    // silently never barks — which is precisely the failure it was written to prevent, reproduced
    // inside the fix for it. Nothing about the route's own tests would have shown this.
    //
    // The filter is `roles.cs.{admin}` because that is what every other admin lookup in this repo
    // uses (equipment check-in, the role broadcast in admin/email/send). Doing it in Postgres also
    // sidesteps the `roles: []` trap — an empty array means NO roles, not every role, and reading
    // it back to filter in JS is where that has been got wrong before.
    const { data: admins } = await supabaseAdmin
      .from('registered_users')
      .select('email, is_banned')
      .or('roles.cs.{admin}');

    const recipients = ((admins ?? []) as Array<{ email: string | null; is_banned: boolean | null }>)
      .filter((u) => u.email && !u.is_banned)
      .map((u) => u.email as string);

    for (const email of recipients) {
      await notify({
        user_email: email,
        type: 'research_worker_health',
        title: decision.title,
        body: decision.body,
        link: '/admin/research',
        escalation_level: decision.level,
        source_type: 'research_worker',
        // One thread, so a break and its later recovery group together rather than arriving as two
        // unrelated notifications a day apart.
        thread_id: SETTINGS_KEY,
      });
      notified += 1;
    }
  }

  // Written on EVERY tick, notified or not — see the header. `checked_at` is the freshness signal
  // that distinguishes "the worker is healthy" from "this watchdog stopped running in June".
  await supabaseAdmin.from('app_settings').upsert({
    key: SETTINGS_KEY,
    value: {
      state: verdict.state,
      checked_at: new Date().toISOString(),
      version: verdict.version ?? null,
      latency_ms: verdict.latencyMs,
      warnings: verdict.warnings,
    },
  }, { onConflict: 'key' });

  return NextResponse.json({
    state: verdict.state,
    previous,
    notified,
    headline: verdict.headline,
  });
}
