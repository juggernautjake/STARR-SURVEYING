// app/api/admin/files/comments/[id]/route.ts — edit or remove one note.
//
// The two permissions differ, and the difference is the point:
//
//   PATCH   the author only. NOT an admin. Editing somebody else's words while their name stays on
//           them is misattribution — the thread would claim a crew member wrote something they did
//           not. An admin who disagrees has the same remedy as everybody else: add a comment.
//   DELETE  the author or an admin. Taking a remark down puts no words in anyone's mouth, and
//           somebody has to be able to remove a note with a client's phone number in it.
//
// Both rules live in `lib/files/comments.ts` so they are stated once and tested without a database.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  checkCommentBody,
  canEditComment,
  canDeleteComment,
  type CommentRow,
} from '@/lib/files/comments';

async function load(id: string) {
  const { data } = await supabaseAdmin
    .from('file_comments')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return data as (CommentRow & { body: string; subject_id: string }) | null;
}

export const PATCH = withErrorHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const comment = await load(ctx.params.id);
  if (!comment || comment.deleted_at) {
    return NextResponse.json({ error: 'That note is not here.' }, { status: 404 });
  }

  const user = { email: session.user.email, isAdmin: isAdmin(session.user.roles) };
  if (!canEditComment(comment, user)) {
    return NextResponse.json({ error: 'You can only edit your own notes.' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { body?: string };
  const check = checkCommentBody(body.body);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  // No-op edits do not get stamped. Otherwise opening a note, changing nothing and saving would
  // mark it "edited" — which is a claim about the record that is not true.
  if (check.value === comment.body) {
    return NextResponse.json({ comment });
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('file_comments')
    // `edited_at` as well as `updated_at`: any write touches `updated_at`, but a reader of a thread
    // is entitled to know specifically that the WORDS changed after they were posted.
    .update({ body: check.value, updated_at: now, edited_at: now })
    .eq('id', ctx.params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comment: data });
}, { routeName: 'files/comments/[id]' });

export const DELETE = withErrorHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const comment = await load(ctx.params.id);
  if (!comment || comment.deleted_at) {
    return NextResponse.json({ error: 'That note is not here.' }, { status: 404 });
  }

  const user = { email: session.user.email, isAdmin: isAdmin(session.user.roles) };
  if (!canDeleteComment(comment, user)) {
    return NextResponse.json({ error: 'You can only remove your own notes.' }, { status: 403 });
  }

  // Soft delete. A removed remark leaves a gap in a conversation, and a thread that silently
  // re-numbers itself is how "but it said X" becomes unresolvable a year later.
  const { error } = await supabaseAdmin
    .from('file_comments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', ctx.params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}, { routeName: 'files/comments/[id]' });
