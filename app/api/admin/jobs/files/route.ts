// app/api/admin/jobs/files/route.ts — File management with backups
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler, fireAndForget } from '@/lib/apiErrorHandler';
import { accessForNode } from '@/lib/files/server';
import { canDownload, type FileUser } from '@/lib/files/permissions';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('job_id');
  const section = searchParams.get('section');
  const fileType = searchParams.get('file_type');
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 });

  let query = supabaseAdmin
    .from('job_files')
    .select('*')
    .eq('job_id', jobId)
    .eq('is_deleted', false)
    .eq('is_backup', false)
    .order('uploaded_at', { ascending: false });

  if (section) query = query.eq('section', section);
  if (fileType) query = query.eq('file_type', fileType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // F5 — annotate rows that REFERENCE a File Explorer document rather than carrying their own bytes.
  //
  // One batched `.in()` for the page, same shape as the receipts queue's line-item lookup, so a job
  // with twenty attachments still costs one extra query rather than twenty. Best-effort on purpose: if
  // this lookup fails the job's file list still renders, because the attachment rows are real either
  // way and losing the pretty name is better than losing the page.
  //
  // A missing node is NOT filtered out. `file_node_id` is `ON DELETE SET NULL`, so a deleted document
  // leaves the row with a null id, and a row whose id still points at something the caller cannot see
  // simply resolves to nothing here — in both cases the UI labels it rather than pretending the
  // attachment was never made.
  // The route selects `*`, so there is no generated row type to lean on here. Naming just the two
  // fields this block touches keeps it honest about what it depends on.
  type JobFileRow = Record<string, unknown> & { file_node_id?: string | null; file_name?: string | null };
  const files = (data ?? []) as JobFileRow[];
  const nodeIds = [...new Set(files.map((f) => f.file_node_id).filter(Boolean))] as string[];
  let nodes: Record<string, { id: string; name: string; mime_type: string | null; size_bytes: number | null }> = {};
  if (nodeIds.length > 0) {
    const { data: nodeRows } = await supabaseAdmin
      .from('file_nodes')
      .select('id, name, mime_type, size_bytes')
      .in('id', nodeIds)
      // `file_nodes` soft-deletes with a `deleted_at` timestamp, not an `is_deleted` boolean — the
      // convention differs from `job_files` next door, which is exactly the kind of thing to check
      // rather than assume (an `is_deleted` filter here fails the whole query, not just the filter).
      .is('deleted_at', null);
    nodes = Object.fromEntries((nodeRows ?? []).map((n: { id: string; name: string; mime_type: string | null; size_bytes: number | null }) => [n.id, n]));
  }

  return NextResponse.json({
    files: files.map((f) => {
      if (!f.file_node_id) return f;
      const node = nodes[f.file_node_id];
      return {
        ...f,
        // `linked_file` is additive — nothing that reads `file_url` today changes behaviour.
        linked_file: node
          ? { id: node.id, name: node.name, mime_type: node.mime_type, size_bytes: node.size_bytes, available: true }
          : { id: f.file_node_id, name: f.file_name, mime_type: null, size_bytes: null, available: false },
      };
    }),
  });
}, { routeName: 'jobs/files' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { job_id, file_name, file_type, file_url, file_size, mime_type, section, description, create_backup, file_node_id } = await req.json();
  if (!job_id || !file_name) return NextResponse.json({ error: 'job_id and file_name required' }, { status: 400 });

  // F5 — attaching an existing File Explorer document. The permission check is the point of doing it
  // here rather than trusting the client: without it, anyone who can post to this route could attach
  // (and then read the name of) a document they have no access to, using a job as the side door.
  //
  // Reuses the explorer's own effective-access resolver rather than re-deriving the rules, so an
  // attach can never disagree with what /admin/files would allow.
  if (file_node_id) {
    // Same two lines as `files/[id]/download` — deliberately identical, so "can I attach it?" and
    // "can I download it?" cannot drift apart.
    const user: FileUser = { email: session.user.email, roles: session.user.roles ?? [] };
    const { chain, access } = await accessForNode(file_node_id, user, isAdmin(session.user.roles));
    if (chain.length === 0) {
      return NextResponse.json({ error: 'That file no longer exists.', code: 'file_node_missing' }, { status: 404 });
    }
    // `download`, not `view`: attaching a document to a job puts it in front of everyone who can see
    // the job, so the person doing the attaching must themselves be allowed to hand the bytes over.
    if (!canDownload(access)) {
      return NextResponse.json(
        { error: 'You do not have access to that file.', code: 'file_node_forbidden' },
        { status: 403 },
      );
    }
  }

  // Create main file record
  const { data: file, error } = await supabaseAdmin
    .from('job_files')
    .insert({
      job_id, file_name, file_type: file_type || 'other', file_url, file_size,
      mime_type, section: section || 'general', description,
      uploaded_by: session.user.email,
      file_node_id: file_node_id ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-create backup if requested.
  //
  // F5 — never for a linked file. The backup exists because `file_url` holds the only copy of an
  // uploaded file's bytes, so a second row is genuinely a second copy. A link has no bytes of its own:
  // duplicating it would create a row pointing at the SAME document, which backs up nothing, and would
  // show the job two attachments where the user made one. The File Explorer is where that document's
  // history lives.
  if (create_backup !== false && !file_node_id) {
    await supabaseAdmin.from('job_files').insert({
      job_id, file_name: `[BACKUP] ${file_name}`, file_type, file_url, file_size,
      mime_type, section, description: `Backup of ${file_name}`,
      is_backup: true, backup_of: file.id,
      uploaded_by: session.user.email,
    });
  }

  await fireAndForget(supabaseAdmin.from('activity_log').insert({
    user_email: session.user.email,
    action: 'job_file_uploaded',
    entity_type: 'job',
    entity_id: job_id,
    details: { file_name, file_type },
  }));

  return NextResponse.json({ file }, { status: 201 });
}, { routeName: 'jobs/files' });

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'File ID required' }, { status: 400 });

  // Soft delete file and its backup
  await supabaseAdmin.from('job_files').update({ is_deleted: true }).eq('id', id);
  await supabaseAdmin.from('job_files').update({ is_deleted: true }).eq('backup_of', id);

  return NextResponse.json({ success: true });
}, { routeName: 'jobs/files' });
