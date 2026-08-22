// app/api/admin/files/comments/route.ts — the notes on a file, listed and added.
//
// Owner, 2026-08-22: *"I need to be able to name them and write notes for them too that people can
// review at a later time."*
//
// Polymorphic over `job_files` and `field_media` (see `lib/files/comments.ts` for why). One route
// rather than one per table, because the thread's rules — who may write, how a body is tidied, what
// an author is called after they leave — are exactly the part that would drift between two copies.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler, fireAndForget } from '@/lib/apiErrorHandler';
import {
  checkCommentBody,
  isCommentSubjectType,
  type CommentSubjectType,
} from '@/lib/files/comments';

/** The table each subject type lives in, and the column that carries its tenant. */
const SUBJECT_TABLES: Record<CommentSubjectType, { table: string; jobColumn: string }> = {
  job_file: { table: 'job_files', jobColumn: 'job_id' },
  field_media: { table: 'field_media', jobColumn: 'job_id' },
};

/**
 * Confirm the file exists and hand back its tenant.
 *
 * The org comes from the SUBJECT, never from the request. A client that could name its own `org_id`
 * could file a note against a tenant it cannot see — and `org_id` drift on this platform has
 * already made webhook rows vanish once. Deriving it removes the parameter entirely.
 */
async function resolveSubject(subjectType: CommentSubjectType, subjectId: string) {
  const { table, jobColumn } = SUBJECT_TABLES[subjectType];
  const { data } = await supabaseAdmin
    .from(table)
    .select(`id, org_id, ${jobColumn}`)
    .eq('id', subjectId)
    .maybeSingle();
  return data as { id: string; org_id: string | null; job_id: string | null } | null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const subjectType = searchParams.get('subject_type') ?? 'job_file';
  const subjectId = searchParams.get('subject_id');
  // The list view asks "how many notes on each of these twenty files?" in one call rather than
  // twenty. Without this the badge on a file list is a request per row.
  const subjectIds = searchParams.get('subject_ids');

  if (!isCommentSubjectType(subjectType)) {
    return NextResponse.json({ error: 'Unknown subject_type.' }, { status: 400 });
  }

  if (subjectIds) {
    const ids = subjectIds.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 200);
    if (ids.length === 0) return NextResponse.json({ counts: {} });

    const { data, error } = await supabaseAdmin
      .from('file_comments')
      .select('subject_id')
      .eq('subject_type', subjectType)
      .in('subject_id', ids)
      .is('deleted_at', null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const counts: Record<string, number> = {};
    for (const row of (data ?? []) as { subject_id: string }[]) {
      counts[row.subject_id] = (counts[row.subject_id] ?? 0) + 1;
    }
    return NextResponse.json({ counts });
  }

  if (!subjectId) {
    return NextResponse.json({ error: 'subject_id or subject_ids is required.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('file_comments')
    .select('*')
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId)
    .is('deleted_at', null)
    // Oldest first: this is a conversation, and a conversation read newest-first is a conversation
    // read backwards. The list view's newest-first ordering is a different question.
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ comments: data ?? [] });
}, { routeName: 'files/comments' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    subject_type?: string;
    subject_id?: string;
    body?: string;
  };

  const subjectType = body.subject_type ?? 'job_file';
  if (!isCommentSubjectType(subjectType)) {
    return NextResponse.json({ error: 'Unknown subject_type.' }, { status: 400 });
  }
  if (!body.subject_id) {
    return NextResponse.json({ error: 'subject_id is required.' }, { status: 400 });
  }

  const check = checkCommentBody(body.body);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  // The file has to exist. Without this a typo writes a note nothing will ever display, which is
  // indistinguishable to the person who wrote it from the note being lost.
  const subject = await resolveSubject(subjectType, body.subject_id);
  if (!subject) return NextResponse.json({ error: 'That file is not here.' }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from('file_comments')
    .insert({
      subject_type: subjectType,
      subject_id: body.subject_id,
      body: check.value,
      author_email: session.user.email,
      // Denormalised on purpose: the thread must still say who wrote this after the account is
      // deactivated, and two of this platform's accounts already have been.
      author_name: session.user.name ?? null,
      org_id: subject.org_id ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await fireAndForget(supabaseAdmin.from('activity_log').insert({
    user_email: session.user.email,
    action_type: 'file_comment_added',
    entity_type: subjectType === 'job_file' ? 'job' : 'field_media',
    entity_id: subject.job_id ?? body.subject_id,
    metadata: { subject_type: subjectType, subject_id: body.subject_id },
  }));

  return NextResponse.json({ comment: data }, { status: 201 });
}, { routeName: 'files/comments' });
