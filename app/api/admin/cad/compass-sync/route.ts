// app/api/admin/cad/compass-sync/route.ts
//
// POST /api/admin/cad/compass-sync
//
// Phase 7 §17.2 — CAD → Compass status sync. The browser-side
// sync helper posts a structured `CompassSyncPayload` to this
// route; the route forwards it to Compass using the per-tenant
// secret kept on the server (`COMPASS_WEBHOOK_URL` +
// `COMPASS_WEBHOOK_SECRET`). When neither env var is set the
// route logs the payload and returns ok=true with
// `forwardedTo: null` so dev environments don't error out
// when Compass isn't wired yet.
//
// Auth: admin / equipment_manager (mirrors the rest of the
// /admin/cad/* routes).

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface CompassSyncBody {
  jobId?:  string;
  status?: 'SEALED' | 'DELIVERED';
  at?:     string;
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
    | CompassSyncBody
    | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Body must be a JSON CompassSyncPayload.' },
      { status: 400 }
    );
  }
  if (typeof body.jobId !== 'string' || body.jobId.length === 0) {
    return NextResponse.json(
      { error: 'CompassSyncPayload requires a non-empty jobId.' },
      { status: 400 }
    );
  }
  if (body.status !== 'SEALED' && body.status !== 'DELIVERED') {
    return NextResponse.json(
      { error: 'CompassSyncPayload status must be SEALED or DELIVERED.' },
      { status: 400 }
    );
  }

  const webhookUrl = process.env.COMPASS_WEBHOOK_URL;
  const webhookSecret = process.env.COMPASS_WEBHOOK_SECRET;

  if (!webhookUrl) {
    // Dev / unconfigured-tenant path — log the payload so
    // engineers can see what would have shipped, but don't
    // 503 the request (the SEAL transition already
    // completed; the surveyor doesn't care about the
    // outbound webhook here).
    console.log(
      '[admin/cad/compass-sync] webhook not configured — skipped',
      {
        job_id: body.jobId,
        status: body.status,
        at: body.at,
        actor_email: session.user.email,
      }
    );
    return NextResponse.json({
      ok: true,
      forwardedTo: null,
      message:
        'COMPASS_WEBHOOK_URL not set — payload logged but not forwarded.',
    });
  }

  try {
    const upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(webhookSecret
          ? { 'X-Starr-Compass-Secret': webhookSecret }
          : {}),
      },
      body: JSON.stringify(body),
    });
    console.log('[admin/cad/compass-sync] forwarded', {
      job_id: body.jobId,
      status: body.status,
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
            `Compass webhook returned ${upstream.status}; ` +
            'payload was logged for retry.',
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
    console.warn('[admin/cad/compass-sync] forward failed', err);
    return NextResponse.json(
      {
        ok: false,
        forwardedTo: webhookUrl,
        message:
          err instanceof Error
            ? err.message
            : 'Compass webhook fetch failed.',
      },
      { status: 502 }
    );
  }
}, { routeName: 'admin/cad/compass-sync#post' });
