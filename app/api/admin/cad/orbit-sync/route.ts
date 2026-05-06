// app/api/admin/cad/orbit-sync/route.ts
//
// POST /api/admin/cad/orbit-sync
//
// Phase 7 §17.4 — CAD → Orbit sync. Browser posts a structured
// `OrbitSyncPayload`; this route forwards to Orbit using the
// per-tenant secret. Logs-only fallback when env vars aren't
// configured.
//
// Auth: admin / equipment_manager.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface OrbitSyncBody {
  jobId?:       string;
  projectName?: string;
  at?:          string;
  sourceCRS?:   string;
  monumentRefs?: unknown;
}

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

  const body = (await req.json().catch(() => null)) as
    | OrbitSyncBody
    | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Body must be a JSON OrbitSyncPayload.' },
      { status: 400 }
    );
  }
  if (typeof body.jobId !== 'string' || body.jobId.length === 0) {
    return NextResponse.json(
      { error: 'OrbitSyncPayload requires a non-empty jobId.' },
      { status: 400 }
    );
  }

  const webhookUrl = process.env.ORBIT_WEBHOOK_URL;
  const webhookSecret = process.env.ORBIT_WEBHOOK_SECRET;

  if (!webhookUrl) {
    console.log(
      '[admin/cad/orbit-sync] webhook not configured — skipped',
      {
        job_id: body.jobId,
        monument_count: Array.isArray(body.monumentRefs)
          ? body.monumentRefs.length
          : 0,
        actor_email: session.user.email,
      }
    );
    return NextResponse.json({
      ok: true,
      forwardedTo: null,
      message:
        'ORBIT_WEBHOOK_URL not set — payload logged but not forwarded.',
    });
  }

  try {
    const upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(webhookSecret
          ? { 'X-Starr-Orbit-Secret': webhookSecret }
          : {}),
      },
      body: JSON.stringify(body),
    });
    console.log('[admin/cad/orbit-sync] forwarded', {
      job_id: body.jobId,
      upstream_status: upstream.status,
      actor_email: session.user.email,
    });
    if (!upstream.ok) {
      return NextResponse.json(
        {
          ok: false,
          forwardedTo: webhookUrl,
          status: upstream.status,
          message:
            `Orbit webhook returned ${upstream.status}; payload ` +
            'was logged for retry.',
        },
        { status: 502 }
      );
    }
    return NextResponse.json({
      ok: true,
      forwardedTo: webhookUrl,
      status: upstream.status,
    });
  } catch (err) {
    console.warn('[admin/cad/orbit-sync] forward failed', err);
    return NextResponse.json(
      {
        ok: false,
        forwardedTo: webhookUrl,
        message:
          err instanceof Error
            ? err.message
            : 'Orbit webhook fetch failed.',
      },
      { status: 502 }
    );
  }
}, { routeName: 'admin/cad/orbit-sync#post' });
