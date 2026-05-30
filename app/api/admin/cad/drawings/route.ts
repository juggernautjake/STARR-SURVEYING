// app/api/admin/cad/drawings/route.ts
// CRUD endpoints for persisting STARR CAD drawings in the database.
//
// GET    /api/admin/cad/drawings          — list all drawings owned by the user
// GET    /api/admin/cad/drawings?id=<id>  — fetch a single drawing by id
// POST   /api/admin/cad/drawings          — create / upsert a drawing
// DELETE /api/admin/cad/drawings?id=<id>  — delete a drawing

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler, fireAndForget } from '@/lib/apiErrorHandler';
import { notify } from '@/lib/notifications';
import { buildDrawingAssignedNotification } from '@/lib/notifications/drawing';
import { usersForJobScope } from '@/lib/jobs/scope';

// ─── GET ────────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    // Return a single drawing (full document payload). Drawings are a shared
    // workspace — any authenticated CAD user can open any drawing.
    const { data, error } = await supabaseAdmin
      .from('cad_drawings')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ drawing: data });
  }

  // Return list — only metadata columns, not the full document JSONB.
  // Shared across all CAD users (no owner filter). Optionally scope to a
  // single job (the job-detail CAD tab passes ?job_id= to show only that
  // job's drawings).
  const jobId = searchParams.get('job_id');
  // hub-widget-excellence-12 — join the job name so the recent-drawings
  // hub widget can show the job, and honor `?mine=true` so its "Mine"
  // scope filters to the caller's drawings.
  const mine = searchParams.get('mine') === 'true';
  let query = supabaseAdmin
    .from('cad_drawings')
    .select('id, name, description, feature_count, layer_count, job_id, folder_id, created_by, created_at, updated_at, jobs(name, job_number)')
    .order('updated_at', { ascending: false });
  if (jobId) query = query.eq('job_id', jobId);
  if (mine) query = query.eq('created_by', session.user.email);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type DrawingRow = Record<string, unknown> & { jobs?: { name?: string | null; job_number?: string | null } | null };
  const drawings = ((data ?? []) as DrawingRow[]).map((row) => {
    const { jobs, ...rest } = row;
    return { ...rest, job_name: jobs?.name ?? null, job_number: jobs?.job_number ?? null };
  });

  return NextResponse.json({ drawings });
});

// ─── POST ────────────────────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as {
    id?: string;
    name: string;
    description?: string;
    document: unknown;
    job_id?: string | null;
    folder_id?: string | null;
    version?: string;
    feature_count?: number;
    layer_count?: number;
  };

  if (!body.name || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 });
  }
  if (!body.document || typeof body.document !== 'object') {
    return NextResponse.json({ error: 'Missing required field: document' }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    name: body.name.trim(),
    description: body.description?.trim() ?? null,
    document: body.document,
    version: body.version ?? '1.0',
    application: 'starr-cad',
    feature_count: body.feature_count ?? 0,
    layer_count: body.layer_count ?? 0,
  };
  // Only touch job_id when the caller explicitly sends it. Sending
  // `null` clears the link; omitting it (undefined) preserves whatever
  // is already stored — so re-saving a job-linked drawing from the
  // generic CAD open dialog (which doesn't know the job) won't wipe
  // the link.
  if (body.job_id !== undefined) {
    payload.job_id = body.job_id;
  }
  // Folder placement: set only when explicitly provided (omitting preserves
  // the existing folder on re-save; null = root).
  if (body.folder_id !== undefined) {
    payload.folder_id = body.folder_id;
  }

  if (body.id) {
    // Update existing. Drawings are a shared workspace — any authenticated
    // CAD user can save changes to any drawing. `created_by` is intentionally
    // omitted from the update so the original author is preserved; bump
    // updated_at so the shared list reflects the latest save.
    const { data, error } = await supabaseAdmin
      .from('cad_drawings')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', body.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ drawing: data });
  }

  // Insert new — record the creator (preserved across later shared edits).
  const { data, error } = await supabaseAdmin
    .from('cad_drawings')
    .insert({ ...payload, created_by: session.user.email })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log to the job's activity feed when the drawing is job-linked.
  if (data?.job_id) {
    await fireAndForget(supabaseAdmin.from('activity_log').insert({
      user_email: session.user.email,
      action: 'cad_drawing_saved',
      entity_type: 'job',
      entity_id: data.job_id,
      details: { name: data.name, drawing_id: data.id },
    }));
  }

  return NextResponse.json({ drawing: data }, { status: 201 });
});

// ─── PATCH — metadata-only update (rename / re-describe) ──────────────────────
// Lets the file manager rename a drawing without re-uploading the whole
// document JSONB.

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as {
    id?: string;
    name?: string;
    description?: string;
    folder_id?: string | null;
    // drawings-collaboration Slice 2 — assignment + due-date editable
    // via PATCH. Either nullable to support unassign / clear-due.
    assigned_to?: string | null;
    due_date?: string | null;
  };
  if (!body.id) {
    return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string') {
    if (!body.name.trim()) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    }
    patch.name = body.name.trim();
  }
  if (typeof body.description === 'string') patch.description = body.description.trim() || null;
  // Move into a folder (null = root).
  if ('folder_id' in body) patch.folder_id = body.folder_id ?? null;
  if ('assigned_to' in body) patch.assigned_to = body.assigned_to?.trim().toLowerCase() || null;
  if ('due_date' in body) patch.due_date = body.due_date || null;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  // Read the prior row so we can detect a real assigned_to transition
  // (an admin re-saving an unchanged assignment shouldn't double-ping).
  const { data: prior } = await supabaseAdmin
    .from('cad_drawings')
    .select('assigned_to')
    .eq('id', body.id)
    .maybeSingle();

  // Shared workspace — any authenticated CAD user can rename / move / re-describe.
  const { data, error } = await supabaseAdmin
    .from('cad_drawings')
    .update(patch)
    .eq('id', body.id)
    .select('id, name, description, feature_count, layer_count, job_id, folder_id, assigned_to, due_date, created_by, created_at, updated_at')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Drawing not found' }, { status: 404 });

  // drawings-collaboration Slice 2 — notify the new assignee when
  // assigned_to lands on a real (different) email. Best-effort.
  //
  // Slice 5 — also fan out to the job-scope cohort (the job_team
  // minus the actor + the assignee themselves, since they get the
  // dedicated payload above) so overseers know who's drawing the
  // sheet. Matches the user's "whoever is on or overseeing a job
  // needs to get drawing notifications" guardrail.
  const newAssignee = (data.assigned_to as string | null)?.trim().toLowerCase();
  const priorAssignee = (prior?.assigned_to as string | null | undefined)?.trim().toLowerCase();
  const actor = session.user.email.toLowerCase();
  if (newAssignee && newAssignee !== priorAssignee && newAssignee !== actor) {
    try {
      const notice = buildDrawingAssignedNotification({
        user_email: newAssignee,
        drawing_id: data.id as string,
        drawing_name: data.name as string,
        job_id: (data.job_id as string | null) ?? null,
        assigned_by: session.user.email,
      });
      if (notice) await notify(notice);

      // Job-scope fan-out — peers on the job_team (minus assignee +
      // actor) get a "FYI: X assigned to {drawer}" so they know who
      // owns the deliverable.
      const jobId = (data.job_id as string | null) ?? null;
      if (jobId) {
        const scope = await usersForJobScope(jobId, supabaseAdmin, actor);
        for (const peer of scope) {
          if (peer === newAssignee) continue;
          try {
            const peerNotice = buildDrawingAssignedNotification({
              user_email: peer,
              drawing_id: data.id as string,
              drawing_name: data.name as string,
              job_id: jobId,
              assigned_by: session.user.email,
            });
            if (peerNotice) {
              // Reframe the body so overseers see who got the
              // drawing, not "you've been assigned".
              peerNotice.title = `🎯 ${newAssignee} assigned ${(data.name as string) || 'a drawing'}`;
              peerNotice.body = `${session.user.email} assigned the drawing to ${newAssignee}. Open it in the CAD editor.`;
              await notify(peerNotice);
            }
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore notification failures */ }
  }

  return NextResponse.json({ drawing: data });
});

// ─── DELETE ──────────────────────────────────────────────────────────────────

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing required query param: id' }, { status: 400 });
  }

  // Shared workspace — any authenticated CAD user can delete any drawing.
  const { error } = await supabaseAdmin
    .from('cad_drawings')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});
