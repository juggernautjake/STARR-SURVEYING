// app/api/admin/cad/drawings/[id]/notes/route.ts
//
// drawings-collaboration Slice 3 — drawing notes thread (the RPLS ↔
// drawer ↔ job-overseer dialog). Two handlers:
//
//   GET  /api/admin/cad/drawings/{id}/notes
//        → { notes: DrawingNote[] }  (oldest → newest)
//
//   POST /api/admin/cad/drawings/{id}/notes
//        body: { body: string; recipient_emails?: string[] }
//        Inserts a note + fires `notifyDrawingNote` to each recipient
//        (best-effort fan-out, one-per-row). When `recipient_emails`
//        is omitted, the route defaults to the drawing's assignee +
//        the job-scope cohort (minus the author).

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { notify } from '@/lib/notifications';
import { buildDrawingNoteNotification } from '@/lib/notifications/drawing';
import { usersForJobScope } from '@/lib/jobs/scope';
import { resolveNoteRecipients } from '@/lib/notifications/drawing-note-recipients';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ─── GET — read the thread ────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing drawing id' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('drawing_notes')
    .select('id, drawing_id, author_email, body, recipient_emails, created_at')
    .eq('drawing_id', id)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notes: data ?? [] });
}

// ─── POST — leave a note + fan out the bell notifications ─────────────────

export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing drawing id' }, { status: 400 });

  const body = await req.json() as { body?: string; recipient_emails?: string[] };
  const note = body.body?.trim();
  if (!note) return NextResponse.json({ error: 'body is required' }, { status: 400 });

  // Read the drawing for context (name, job_id, assignee) — feeds the
  // notification payload + the default recipient cohort.
  const { data: drawing, error: drawErr } = await supabaseAdmin
    .from('cad_drawings')
    .select('id, name, job_id, assigned_to')
    .eq('id', id)
    .maybeSingle();
  if (drawErr) return NextResponse.json({ error: drawErr.message }, { status: 500 });
  if (!drawing) return NextResponse.json({ error: 'Drawing not found' }, { status: 404 });

  // Default the recipient cohort to the assignee + the job-scope team
  // (minus the author), so an RPLS can leave a note for the drawer +
  // overseers without typing a recipient list. Explicit recipient_emails
  // override the default.
  const author = session.user.email.toLowerCase();
  const scope = drawing.job_id
    ? await usersForJobScope(drawing.job_id as string, supabaseAdmin, author)
    : [];
  const recipients = resolveNoteRecipients({
    explicit: body.recipient_emails,
    assignee: drawing.assigned_to as string | null,
    scope,
    author,
  });

  // Insert the note row.
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('drawing_notes')
    .insert({
      drawing_id: id,
      author_email: author,
      body: note,
      recipient_emails: recipients,
    })
    .select('id, drawing_id, author_email, body, recipient_emails, created_at')
    .single();
  if (insertErr || !inserted) {
    return NextResponse.json({ error: insertErr?.message ?? 'Failed to insert note' }, { status: 500 });
  }

  // Fan out the bell — best-effort per recipient.
  for (const recipient of recipients) {
    try {
      const notice = buildDrawingNoteNotification({
        user_email: recipient,
        drawing_id: drawing.id as string,
        drawing_name: drawing.name as string,
        job_id: (drawing.job_id as string | null) ?? null,
        author_email: author,
        body: note,
      });
      if (notice) await notify(notice);
    } catch {
      /* ignore individual failures */
    }
  }

  return NextResponse.json({ note: inserted, notified: recipients.length }, { status: 201 });
}
