// app/api/admin/cad/forge-sync/route.ts
//
// POST /api/admin/cad/forge-sync
//
// Phase 7 §17.3 — CAD → Forge sync. The browser-side helper
// (`buildForgePayload` + `sendForgeSync`) posts a structured
// payload to this route; we forward to Forge using the
// per-tenant secret kept on the server. When the env vars
// are unset (dev / unconfigured tenant) we log the payload
// and ack with `forwardedTo: null` instead of erroring out.
//
// Auth: admin / equipment_manager. The payload carries
// project geometry; routes that touch it stay behind the
// same gate as the rest of /admin/cad/*.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface ForgeSyncBody {
  jobId?:          string;
  forgeProjectId?: string;
  at?:             string;
  signatureHash?:  string | null;
  dxfHash?:        string | null;
  slices?:         unknown;
  fullDxf?:        string;
  projectName?:    string;
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
    | ForgeSyncBody
    | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Body must be a JSON ForgeSyncPayload.' },
      { status: 400 }
    );
  }
  if (typeof body.jobId !== 'string' || body.jobId.length === 0) {
    return NextResponse.json(
      { error: 'ForgeSyncPayload requires a non-empty jobId.' },
      { status: 400 }
    );
  }
  if (typeof body.fullDxf !== 'string' || body.fullDxf.length === 0) {
    return NextResponse.json(
      { error: 'ForgeSyncPayload requires `fullDxf` text.' },
      { status: 400 }
    );
  }

  const webhookUrl = process.env.FORGE_WEBHOOK_URL;
  const webhookSecret = process.env.FORGE_WEBHOOK_SECRET;

  if (!webhookUrl) {
    console.log(
      '[admin/cad/forge-sync] webhook not configured — skipped',
      {
        job_id: body.jobId,
        forge_project_id: body.forgeProjectId,
        slices: Array.isArray(body.slices) ? body.slices.length : 0,
        actor_email: session.user.email,
      }
    );
    return NextResponse.json({
      ok: true,
      forwardedTo: null,
      message:
        'FORGE_WEBHOOK_URL not set — payload logged but not forwarded.',
    });
  }

  try {
    const upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(webhookSecret
          ? { 'X-Starr-Forge-Secret': webhookSecret }
          : {}),
      },
      body: JSON.stringify(body),
    });
    console.log('[admin/cad/forge-sync] forwarded', {
      job_id: body.jobId,
      forge_project_id: body.forgeProjectId,
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
            `Forge webhook returned ${upstream.status}; payload was ` +
            'logged for retry.',
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
    console.warn('[admin/cad/forge-sync] forward failed', err);
    return NextResponse.json(
      {
        ok: false,
        forwardedTo: webhookUrl,
        message:
          err instanceof Error
            ? err.message
            : 'Forge webhook fetch failed.',
      },
      { status: 502 }
    );
  }
}, { routeName: 'admin/cad/forge-sync#post' });
