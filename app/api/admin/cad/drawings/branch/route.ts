// app/api/admin/cad/drawings/branch/route.ts
//
// cad-branching — GitHub-style branch + review for CAD drawings.
//
//   POST  /api/admin/cad/drawings/branch        — fork a drawing into a branch
//   PATCH /api/admin/cad/drawings/branch         — submit / withdraw / accept / reject
//
// A branch is a cad_drawings row whose parent_id points at the drawing it was
// forked from, so it reuses the whole existing open / save / autosave editor
// pipeline. The parent drawing's owner (created_by) accepts a branch by
// promoting its document onto the parent, or rejects it (parent unchanged).

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notify } from '@/lib/notifications';
import { nextBranchStatus, BRANCH_ACTION_ROLE, type BranchAction, type BranchStatus } from '@/lib/cad/branch/types';
import {
  buildBranchSubmittedNotification,
  buildBranchAcceptedNotification,
  buildBranchRejectedNotification,
} from '@/lib/notifications/branch';

// The persisted `document` column is an envelope: { version, application,
// document: <DrawingDocument> }. These helpers read/rewrite the inner
// DrawingDocument identity without assuming a particular nesting depth.
type Envelope = { document?: { id?: string; name?: string } } & Record<string, unknown>;

function innerIdentity(env: unknown): { id?: string; name?: string } {
  const inner = (env as Envelope | null)?.document;
  if (inner && typeof inner === 'object') return { id: inner.id, name: inner.name };
  return {};
}

/** Deep-clone an envelope and overwrite the inner DrawingDocument id/name. */
function withInnerIdentity(env: unknown, id: string, name: string): unknown {
  const clone = JSON.parse(JSON.stringify(env ?? {})) as Envelope;
  if (clone && typeof clone === 'object' && clone.document && typeof clone.document === 'object') {
    clone.document.id = id;
    clone.document.name = name;
  }
  return clone;
}

// ─── POST — fork a drawing into a new branch ─────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const me = session.user.email;

  const body = (await req.json()) as { source_id?: string; label?: string; note?: string };
  if (!body.source_id) {
    return NextResponse.json({ error: 'Missing required field: source_id' }, { status: 400 });
  }

  const { data: source, error: srcErr } = await supabaseAdmin
    .from('cad_drawings')
    .select('id, name, description, document, version, feature_count, layer_count, job_id, updated_at, parent_id')
    .eq('id', body.source_id)
    .single();
  if (srcErr || !source) {
    return NextResponse.json({ error: 'Source drawing not found' }, { status: 404 });
  }
  // Branch off the main drawing even when the user forked from another branch —
  // reviews always resolve against a top-level main.
  const parentId = (source.parent_id as string | null) ?? (source.id as string);

  const shortAuthor = me.split('@')[0];
  const branchName = body.label?.trim() || `${source.name} — ${shortAuthor}'s branch`;
  // Give the copied document a fresh inner id so autosave + the save-target
  // store key it independently from the source (otherwise Ctrl+S on the branch
  // could write back to the source's cloud row).
  const branchDoc = withInnerIdentity(source.document, randomUUID(), branchName);

  const { data: branch, error: insErr } = await supabaseAdmin
    .from('cad_drawings')
    .insert({
      name: branchName,
      description: source.description ?? null,
      document: branchDoc,
      version: source.version ?? '1.0',
      application: 'starr-cad',
      feature_count: source.feature_count ?? 0,
      layer_count: source.layer_count ?? 0,
      job_id: source.job_id ?? null,
      created_by: me,
      parent_id: parentId,
      branch_status: 'draft' as BranchStatus,
      branch_note: body.note?.trim() || null,
      forked_at: new Date().toISOString(),
      forked_from_updated_at: source.updated_at ?? null,
    })
    .select('id, parent_id, name, description, created_by, branch_status, branch_note, forked_at, forked_from_updated_at, feature_count, layer_count, created_at, updated_at')
    .single();

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  return NextResponse.json({ drawing: branch }, { status: 201 });
});

// ─── PATCH — branch lifecycle (submit / withdraw / accept / reject) ──────────

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const me = session.user.email;

  const body = (await req.json()) as { id?: string; action?: BranchAction; note?: string };
  if (!body.id || !body.action) {
    return NextResponse.json({ error: 'Missing required fields: id, action' }, { status: 400 });
  }
  const action = body.action;
  if (!(action in BRANCH_ACTION_ROLE)) {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  const { data: branch, error: brErr } = await supabaseAdmin
    .from('cad_drawings')
    .select('id, parent_id, name, created_by, branch_status, branch_note, document, feature_count, layer_count')
    .eq('id', body.id)
    .single();
  if (brErr || !branch) {
    return NextResponse.json({ error: 'Branch not found' }, { status: 404 });
  }
  if (!branch.parent_id) {
    return NextResponse.json({ error: 'That drawing is not a branch' }, { status: 400 });
  }

  const current = (branch.branch_status as BranchStatus | null) ?? 'draft';
  const next = nextBranchStatus(current, action);
  if (!next) {
    return NextResponse.json(
      { error: `Cannot ${action} a branch that is ${current.replace('_', ' ')}` },
      { status: 409 },
    );
  }

  // Load the parent for ownership checks + accept-time promotion.
  const { data: parent } = await supabaseAdmin
    .from('cad_drawings')
    .select('id, name, created_by, job_id, document, updated_at')
    .eq('id', branch.parent_id)
    .single();

  // Permission: authors submit/withdraw their own branch; owners accept/reject
  // on drawings they created.
  const role = BRANCH_ACTION_ROLE[action];
  if (role === 'author' && branch.created_by !== me) {
    return NextResponse.json({ error: 'Only the branch author can do that' }, { status: 403 });
  }
  if (role === 'owner' && parent?.created_by !== me) {
    return NextResponse.json({ error: 'Only the owner of the main drawing can review it' }, { status: 403 });
  }

  const now = new Date().toISOString();
  const note = body.note?.trim() || null;

  // Promote the branch's document onto the parent on accept, preserving the
  // parent's inner document identity so the owner's save-target keeps working.
  if (action === 'accept' && parent) {
    const parentInner = innerIdentity(parent.document);
    const mergedDoc = withInnerIdentity(
      branch.document,
      parentInner.id ?? randomUUID(),
      parentInner.name ?? (parent.name as string) ?? 'Drawing',
    );
    const { error: mergeErr } = await supabaseAdmin
      .from('cad_drawings')
      .update({
        document: mergedDoc,
        feature_count: branch.feature_count ?? 0,
        layer_count: branch.layer_count ?? 0,
        updated_at: now,
      })
      .eq('id', parent.id);
    if (mergeErr) {
      return NextResponse.json({ error: mergeErr.message }, { status: 500 });
    }
  }

  // Update the branch row's lifecycle fields.
  const branchPatch: Record<string, unknown> = { branch_status: next };
  if (action === 'submit') {
    branchPatch.review_requested_at = now;
    if (note) branchPatch.branch_note = note;
  } else if (action === 'withdraw') {
    branchPatch.review_requested_at = null;
  } else if (action === 'accept' || action === 'reject') {
    branchPatch.reviewed_at = now;
    branchPatch.reviewed_by = me;
    if (note) branchPatch.branch_note = note;
  }

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('cad_drawings')
    .update(branchPatch)
    .eq('id', branch.id)
    .select('id, parent_id, name, description, created_by, branch_status, branch_note, forked_at, forked_from_updated_at, review_requested_at, reviewed_at, reviewed_by, feature_count, layer_count, created_at, updated_at')
    .single();
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Best-effort notifications — never block the response.
  try {
    if (action === 'submit' && parent?.created_by && parent.created_by !== me) {
      const n = buildBranchSubmittedNotification({
        owner_email: parent.created_by as string,
        author_email: me,
        parent_id: parent.id as string,
        branch_id: branch.id as string,
        drawing_name: (parent.name as string) ?? (branch.name as string),
        note,
      });
      if (n) await notify(n);
    } else if (action === 'accept' && branch.created_by !== me) {
      const n = buildBranchAcceptedNotification({
        author_email: branch.created_by as string,
        reviewer_email: me,
        parent_id: (parent?.id as string) ?? (branch.parent_id as string),
        branch_id: branch.id as string,
        drawing_name: (parent?.name as string) ?? (branch.name as string),
      });
      if (n) await notify(n);
    } else if (action === 'reject' && branch.created_by !== me) {
      const n = buildBranchRejectedNotification({
        author_email: branch.created_by as string,
        reviewer_email: me,
        parent_id: (parent?.id as string) ?? (branch.parent_id as string),
        branch_id: branch.id as string,
        drawing_name: (parent?.name as string) ?? (branch.name as string),
        note,
      });
      if (n) await notify(n);
    }
  } catch {
    /* ignore notification failures */
  }

  return NextResponse.json({ drawing: updated });
});
