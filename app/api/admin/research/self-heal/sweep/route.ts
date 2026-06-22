// app/api/admin/research/self-heal/sweep/route.ts
//
// Slice 1 of research-self-heal-slice-1-manual-sweep-2026-06-22.md —
// POST kicks off a manual one-time sweep of every registered adapter.
// For each adapter we:
//   1. fetch base_url with a 10s timeout
//   2. classify the HTTP outcome (network error / 4xx / 5xx / 2xx)
//   3. if the adapter has an active canary baseline_dom_skeleton,
//      re-fingerprint the live HTML body and compare
//   4. record a research_adapter_health_checks row
//
// The pure summary reducer in lib/research/self-heal-sweep does the
// tally so the API response shape is testable in isolation. The
// dashboard at /admin/research/self-heal renders the result.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { fingerprintHtml } from '@/lib/research/dom-fingerprint';
import {
  classifySweepStatus,
  describeProbe,
  describeSweep,
  summarizeSweep,
  type SweepRow,
  type SweepStatus,
} from '@/lib/research/self-heal-sweep';
import {
  buildBreakageProposal,
  shouldProposeRepair,
} from '@/lib/research/self-heal-proposals';
import { runApplyEvaluator } from '@/lib/research/self-heal-apply-runner';

const FETCH_TIMEOUT_MS = 10_000;
const PER_HOST_DELAY_MS = 100; // tiny politeness gap when many adapters share a host

interface AdapterRow {
  id: string;
  base_url: string;
  status: string;
  site_type: string;
  county_id: string;
  vendor_id: string | null;
  config: Record<string, unknown>;
  field_map: Record<string, unknown>;
  // joined columns
  county_name?: string;
  vendor_name?: string | null;
}

interface CanaryRow {
  adapter_id: string;
  baseline_dom_skeleton: string | null;
}

async function authGate(): Promise<
  | { ok: true; email: string }
  | { ok: false; res: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.email) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!isAdmin(session.user.roles)) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, email: session.user.email };
}

export const POST = withErrorHandler(async (_req: NextRequest) => {
  const g = await authGate();
  if (!g.ok) return g.res;

  // Defensive: respect the settings.manual_sweep_enabled toggle even
  // though it defaults TRUE. If the user explicitly turned the manual
  // button off, refuse the request.
  const { data: settings } = await supabaseAdmin
    .from('research_self_heal_settings')
    .select('manual_sweep_enabled')
    .eq('id', 'singleton')
    .maybeSingle();
  if (settings && settings.manual_sweep_enabled === false) {
    return NextResponse.json(
      { error: 'Manual sweeps are disabled in self-heal settings.' },
      { status: 409 },
    );
  }

  // 1. Load every adapter that's worth checking. Skip drafts +
  //    retired — drafts haven't been validated yet, retired adapters
  //    aren't expected to work.
  const { data: adapters, error: adaptersErr } = await supabaseAdmin
    .from('research_site_adapters')
    .select('id, base_url, status, site_type, county_id, vendor_id, config, field_map')
    .in('status', ['active', 'degraded', 'broken', 'quarantined']);

  if (adaptersErr) {
    return NextResponse.json({ error: adaptersErr.message }, { status: 500 });
  }
  const adapterRows = (adapters ?? []) as AdapterRow[];

  if (adapterRows.length === 0) {
    const summary = summarizeSweep([], 0);
    return NextResponse.json({
      summary,
      description: describeSweep(summary),
      sweep_started_at: new Date().toISOString(),
    });
  }

  // 2. Fetch joins so the dashboard can render county + vendor names
  //    without an extra round-trip per row.
  const countyIds = Array.from(new Set(adapterRows.map((a) => a.county_id)));
  const vendorIds = Array.from(new Set(adapterRows.map((a) => a.vendor_id).filter((x): x is string => !!x)));
  const [counties, vendors] = await Promise.all([
    countyIds.length > 0
      ? supabaseAdmin.from('research_counties').select('id, name').in('id', countyIds)
      : { data: [], error: null } as const,
    vendorIds.length > 0
      ? supabaseAdmin.from('research_data_vendors').select('id, name').in('id', vendorIds)
      : { data: [], error: null } as const,
  ]);
  const countyName = new Map<string, string>();
  for (const c of (counties.data ?? []) as Array<{ id: string; name: string }>) {
    countyName.set(c.id, c.name);
  }
  const vendorName = new Map<string, string>();
  for (const v of (vendors.data ?? []) as Array<{ id: string; name: string }>) {
    vendorName.set(v.id, v.name);
  }

  // 3. Pull the active canary per adapter so we can fingerprint-compare
  //    when there's a baseline.
  const { data: canaries } = await supabaseAdmin
    .from('research_adapter_canaries')
    .select('adapter_id, baseline_dom_skeleton')
    .in('adapter_id', adapterRows.map((a) => a.id))
    .eq('is_active', true);
  const canaryByAdapter = new Map<string, CanaryRow>();
  for (const c of (canaries ?? []) as CanaryRow[]) {
    canaryByAdapter.set(c.adapter_id, c);
  }

  // 4. Probe each adapter. We run them serially in slice 1 to keep
  //    the surface area small + the per-host pressure minimal. A
  //    future slice can introduce the per-host concurrency cap from
  //    health-check-scheduler.ts.
  const sweepStart = Date.now();
  const rows: SweepRow[] = [];

  for (const adapter of adapterRows) {
    const adapterLabel = `${countyName.get(adapter.county_id) ?? 'Unknown'} · ${adapter.site_type}`;
    const probeStart = Date.now();
    let ok = false;
    let httpStatus: number | null = null;
    let error: string | null = null;
    let bodySnippet: string | null = null;
    let fingerprintMatch: boolean | null = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(adapter.base_url, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'Starr-Surveying/SelfHealSweep (admin manual check)' },
      });
      clearTimeout(timeout);
      ok = true;
      httpStatus = res.status;
      if (res.ok) {
        const body = await res.text().catch(() => '');
        bodySnippet = body;
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
      ok,
      http_status: httpStatus,
      duration_ms: duration,
      fingerprint_match: fingerprintMatch,
      error,
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

    // Record the health-check row. Best-effort — a failure to write
    // the audit row shouldn't abort the entire sweep.
    let insertedHealthCheckId: string | null = null;
    const { data: insertedHealth } = await supabaseAdmin
      .from('research_adapter_health_checks')
      .insert({
        adapter_id: adapter.id,
        canary_id: null,
        triggered_by: 'manual',
        status,
        layer_results: {
          structural: {
            severity: fingerprintMatch === false ? 'high' : 'none',
            fingerprint_match: fingerprintMatch,
          },
          network: {
            ok,
            http_status: httpStatus,
            duration_ms: duration,
            error,
          },
        },
        diff_summary: summary,
        http_status: httpStatus,
        duration_ms: duration,
        error_message: error,
      })
      .select('id')
      .single();
    insertedHealthCheckId = insertedHealth?.id ?? null;

    // slice 3 — when the probe trips the breakage thresholds, write a
    // proposal row so the admin sees this adapter in the review queue.
    // The proposal carries confidence=0 in slice 3 (no AI fix yet);
    // apply-policy will keep it 'proposed' until a human triages.
    if (shouldProposeRepair({ status, fingerprint_match: fingerprintMatch })) {
      const proposal = buildBreakageProposal({
        adapter_id: adapter.id,
        health_check_id: insertedHealthCheckId,
        status,
        http_status: httpStatus,
        fingerprint_match: fingerprintMatch,
        duration_ms: duration,
        probe_summary: summary,
        prior_config: adapter.config ?? {},
        prior_field_map: adapter.field_map ?? {},
      });
      void supabaseAdmin
        .from('research_adapter_change_proposals')
        .insert(proposal)
        .then(() => undefined, () => undefined);
    }

    void bodySnippet; // suppress unused-var; we may keep the snippet later
    if (PER_HOST_DELAY_MS > 0) {
      await new Promise((r) => setTimeout(r, PER_HOST_DELAY_MS));
    }
  }

  const sweepDuration = Date.now() - sweepStart;
  const summary = summarizeSweep(rows, sweepDuration);

  // Stamp the settings row so the dashboard can show "last manual sweep".
  void supabaseAdmin
    .from('research_self_heal_settings')
    .upsert({
      id: 'singleton',
      last_manual_sweep_at: new Date().toISOString(),
      last_manual_sweep_by: g.email,
      updated_at: new Date().toISOString(),
      updated_by: g.email,
    }, { onConflict: 'id' })
    .then(() => undefined, () => undefined);

  // slice 4 — run the apply evaluator so any high-confidence
  // proposals filed by an upstream AI generator get applied
  // immediately when autoapply_enabled is ON. With confidence=0
  // proposals (the slice-3 default), this is a no-op + just stamps
  // the policy onto the response for the dashboard's status banner.
  const applyResult = await runApplyEvaluator(supabaseAdmin, g.email).catch(() => null);

  return NextResponse.json({
    summary,
    description: describeSweep(summary),
    sweep_started_at: new Date(sweepStart).toISOString(),
    sweep_finished_at: new Date().toISOString(),
    apply: applyResult,
  });
}, { routeName: 'admin/research/self-heal/sweep.post' });
