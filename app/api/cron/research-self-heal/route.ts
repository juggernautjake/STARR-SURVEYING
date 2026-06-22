// app/api/cron/research-self-heal/route.ts
//
// Slice 2 of research-self-heal-slice-1-manual-sweep-2026-06-22.md —
// the scheduled-cron counterpart to the admin's manual sweep button.
//
// Vercel cron config (see vercel.json):
//   { path: '/api/cron/research-self-heal', schedule: '0 6 * * *' }
//   06:00 UTC = 01:00 CST / midnight CDT — runs before the office is
//   open so admins see overnight breakage on first login.
//
// Behavior:
//   1. Auth via the shared CRON_SECRET bearer token (same pattern as
//      every other cron route in this app).
//   2. Reads research_self_heal_settings.schedule_enabled. If FALSE
//      (the default), exits early with `{ skipped: 'schedule_disabled' }`.
//      The admin flips this on from /admin/research/self-heal.
//   3. Loads every active/degraded/broken/quarantined adapter, joins
//      the registry of last_verified_at + metro_tier, and runs the
//      pure `planScheduledChecks()` planner from health-check-scheduler.
//      The planner enforces per-host concurrency caps + batch caps so
//      we never hammer a single county portal.
//   4. For each scheduled adapter, probes base_url (10s timeout),
//      fingerprint-compares against the active canary, classifies,
//      and writes a research_adapter_health_checks row with
//      triggered_by = 'scheduled'.
//   5. Updates each adapter's last_verified_at + status (degraded /
//      broken) so the next planner run respects the priority order.
//
// What this slice does NOT do:
//   - No AI repair proposal generation (slice 3).
//   - No auto-apply (slice 4).
//   - No Playwright deep-check (slice 5).
//
// All gated on the SAME `schedule_enabled` toggle — flipping it OFF
// stops every automated layer in one click.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { fingerprintHtml } from '@/lib/research/dom-fingerprint';
import {
  planScheduledChecks,
  type SchedulableAdapter,
} from '@/lib/research/health-check-scheduler';
import {
  classifySweepStatus,
  describeProbe,
  describeSweep,
  summarizeSweep,
  type SweepRow,
  type SweepStatus,
} from '@/lib/research/self-heal-sweep';

const FETCH_TIMEOUT_MS = 10_000;

interface AdapterRow {
  id: string;
  base_url: string;
  status: SchedulableAdapter['status'];
  site_type: string;
  county_id: string;
  vendor_id: string | null;
  last_verified_at: string | null;
}

interface CanaryRow {
  adapter_id: string;
  baseline_dom_skeleton: string | null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  // 1. Bearer-token auth — same pattern as every other cron in this app.
  const authHeader = req.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron/research-self-heal] CRON_SECRET not set');
    return NextResponse.json({ error: 'CRON_SECRET not configured.' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Honor the settings toggle. Defaults to FALSE; admin flips it
  //    from /admin/research/self-heal.
  const { data: settings } = await supabaseAdmin
    .from('research_self_heal_settings')
    .select('schedule_enabled')
    .eq('id', 'singleton')
    .maybeSingle();
  if (!settings || settings.schedule_enabled !== true) {
    return NextResponse.json({
      skipped: 'schedule_disabled',
      message: 'Self-heal automatic monitoring is OFF. Toggle it on at /admin/research/self-heal.',
    });
  }

  // 3. Load every schedulable adapter + the joined metro tier so the
  //    planner can apply the per-tier cadence policy.
  const { data: adaptersRaw, error: adaptersErr } = await supabaseAdmin
    .from('research_site_adapters')
    .select('id, base_url, status, site_type, county_id, vendor_id, last_verified_at');
  if (adaptersErr) {
    return NextResponse.json({ error: adaptersErr.message }, { status: 500 });
  }
  const adapters = (adaptersRaw ?? []) as AdapterRow[];
  if (adapters.length === 0) {
    return NextResponse.json({ skipped: 'no_adapters' });
  }

  const countyIds = Array.from(new Set(adapters.map((a) => a.county_id)));
  const { data: counties } = await supabaseAdmin
    .from('research_counties')
    .select('id, name, metro_tier')
    .in('id', countyIds);
  const tierByCounty = new Map<string, number | null>();
  const countyName = new Map<string, string>();
  for (const c of (counties ?? []) as Array<{ id: string; name: string; metro_tier: number | null }>) {
    tierByCounty.set(c.id, c.metro_tier);
    countyName.set(c.id, c.name);
  }

  const vendorIds = Array.from(new Set(adapters.map((a) => a.vendor_id).filter((x): x is string => !!x)));
  const { data: vendors } = vendorIds.length > 0
    ? await supabaseAdmin.from('research_data_vendors').select('id, name').in('id', vendorIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const vendorName = new Map<string, string>();
  for (const v of (vendors ?? []) as Array<{ id: string; name: string }>) {
    vendorName.set(v.id, v.name);
  }

  const schedulable: SchedulableAdapter[] = adapters.map((a) => ({
    id: a.id,
    base_url: a.base_url,
    status: a.status,
    last_verified_at: a.last_verified_at,
    metro_tier: tierByCounty.get(a.county_id) ?? null,
  }));

  const now = new Date();
  const plan = planScheduledChecks(schedulable, now);

  if (plan.scheduled.length === 0) {
    return NextResponse.json({
      skipped: 'nothing_due',
      eligible: 0,
      deferred: plan.deferred.length,
      skipped_by_status: plan.skipped.length,
    });
  }

  // 4. Pull canaries for the chosen adapters.
  const scheduledIds = plan.scheduled.map((s) => s.adapter_id);
  const { data: canariesRaw } = await supabaseAdmin
    .from('research_adapter_canaries')
    .select('adapter_id, baseline_dom_skeleton')
    .in('adapter_id', scheduledIds)
    .eq('is_active', true);
  const canaryByAdapter = new Map<string, CanaryRow>();
  for (const c of (canariesRaw ?? []) as CanaryRow[]) {
    canaryByAdapter.set(c.adapter_id, c);
  }

  // 5. Probe each adapter the planner picked, serially. The planner
  //    has already applied per-host concurrency caps so we don't
  //    need to re-check here.
  const adapterById = new Map(adapters.map((a) => [a.id, a]));
  const sweepStart = Date.now();
  const rows: SweepRow[] = [];

  for (const scheduledRow of plan.scheduled) {
    const adapter = adapterById.get(scheduledRow.adapter_id);
    if (!adapter) continue;

    const probeStart = Date.now();
    let ok = false;
    let httpStatus: number | null = null;
    let error: string | null = null;
    let fingerprintMatch: boolean | null = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(adapter.base_url, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'Starr-Surveying/SelfHealCron (scheduled)' },
      });
      clearTimeout(timeout);
      ok = true;
      httpStatus = res.status;
      if (res.ok) {
        const body = await res.text().catch(() => '');
        const canary = canaryByAdapter.get(adapter.id);
        if (canary?.baseline_dom_skeleton) {
          const live = fingerprintHtml(body);
          fingerprintMatch = live.skeleton === canary.baseline_dom_skeleton;
        } else {
          fingerprintMatch = null;
        }
      }
    } catch (err) {
      ok = false;
      error = err instanceof Error ? err.message : String(err);
    }

    const duration = Date.now() - probeStart;
    const status: SweepStatus = classifySweepStatus({
      ok, http_status: httpStatus, duration_ms: duration, fingerprint_match: fingerprintMatch, error,
    });
    const summary = describeProbe({ status, httpStatus, fingerprintMatch, error });

    rows.push({
      adapter_id: adapter.id,
      county: countyName.get(adapter.county_id) ?? 'Unknown',
      vendor: adapter.vendor_id ? vendorName.get(adapter.vendor_id) ?? null : null,
      site_type: adapter.site_type,
      base_url: adapter.base_url,
      status,
      http_status: httpStatus,
      duration_ms: duration,
      fingerprint_match: fingerprintMatch,
      summary,
    });

    // Audit row + adapter status update + last_verified_at stamp.
    void supabaseAdmin
      .from('research_adapter_health_checks')
      .insert({
        adapter_id: adapter.id,
        canary_id: null,
        triggered_by: 'scheduled',
        status,
        layer_results: {
          structural: {
            severity: fingerprintMatch === false ? 'high' : 'none',
            fingerprint_match: fingerprintMatch,
          },
          network: { ok, http_status: httpStatus, duration_ms: duration, error },
          planner_reason: scheduledRow.reason,
        },
        diff_summary: summary,
        http_status: httpStatus,
        duration_ms: duration,
        error_message: error,
      })
      .then(() => undefined, () => undefined);

    // Bump last_verified_at + status when the planner picked this
    // adapter. Only escalate to broken/degraded; don't auto-promote
    // back to active from broken without a human reviewing — that's
    // slice 4 territory.
    const nextStatus = adapter.status === 'broken' && status !== 'broken'
      ? adapter.status // leave broken until reviewed
      : status === 'broken' ? 'broken'
        : status === 'degraded' ? 'degraded'
          : adapter.status === 'degraded' && status === 'healthy' ? 'active'
            : adapter.status;
    void supabaseAdmin
      .from('research_site_adapters')
      .update({
        last_verified_at: new Date().toISOString(),
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', adapter.id)
      .then(() => undefined, () => undefined);
  }

  const sweepDuration = Date.now() - sweepStart;
  const summary = summarizeSweep(rows, sweepDuration);

  return NextResponse.json({
    ran: rows.length,
    deferred: plan.deferred.length,
    skipped_by_status: plan.skipped.length,
    summary,
    description: describeSweep(summary),
    sweep_started_at: new Date(sweepStart).toISOString(),
    sweep_finished_at: new Date().toISOString(),
  });
}, { routeName: 'cron/research-self-heal' });
