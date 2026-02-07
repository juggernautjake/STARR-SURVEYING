// app/api/admin/jobs/files/route.ts — File management with backups
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

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
  return NextResponse.json({ files: data || [] });
}, { routeName: 'jobs/files' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { job_id, file_name, file_type, file_url, file_size, mime_type, section, description, create_backup } = await req.json();
  if (!job_id || !file_name) return NextResponse.json({ error: 'job_id and file_name required' }, { status: 400 });

  // Create main file record
  const { data: file, error } = await supabaseAdmin
    .from('job_files')
    .insert({
      job_id, file_name, file_type: file_type || 'other', file_url, file_size,
      mime_type, section: section || 'general', description,
      uploaded_by: session.user.email,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-create backup if requested
  if (create_backup !== false) {
    await supabaseAdmin.from('job_files').insert({
      job_id, file_name: `[BACKUP] ${file_name}`, file_type, file_url, file_size,
      mime_type, section, description: `Backup of ${file_name}`,
      is_backup: true, backup_of: file.id,
      uploaded_by: session.user.email,
    });
  }

  await supabaseAdmin.from('activity_log').insert({
    user_email: session.user.email,
    action: 'job_file_uploaded',
    entity_type: 'job',
    entity_id: job_id,
    details: { file_name, file_type },
  }).catch(() => {});

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
