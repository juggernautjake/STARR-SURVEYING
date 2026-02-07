// app/api/admin/jobs/checklists/route.ts — Stage checklists
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// Default checklist templates per stage
const STAGE_CHECKLISTS: Record<string, string[]> = {
  quote: [
    'Client contacted and requirements documented',
    'Property information gathered',
    'Previous survey records checked',
    'Quote prepared and sent to client',
    'Quote accepted by client',
  ],
  research: [
    'Title search completed',
    'Deed information reviewed',
    'Previous surveys located and reviewed',
    'Plat records checked',
    'Corner records searched',
    'Adjoining property deeds reviewed',
    'Easements and ROW identified',
    'Field plan created',
    'Equipment needs determined',
    'Crew assigned',
  ],
  fieldwork: [
    'Equipment checked out and calibrated',
    'Control points established',
    'Boundary corners located/set',
    'All measurements collected',
    'Photos taken of key features',
    'Field notes completed',
    'Data backed up',
    'Equipment returned',
  ],
  drawing: [
    'Field data imported into CAD',
    'Boundary calculated and closed',
    'All features plotted',
    'Legal description drafted',
    'Drawing reviewed by RPLS',
    'Revisions completed',
    'Final drawing approved',
  ],
  legal: [
    'Legal description finalized',
    'Deed references verified',
    'Monument records prepared',
    'Plat prepared for recording',
    'RPLS signature and seal applied',
    'Documents filed with county',
  ],
  delivery: [
    'Final package prepared',
    'Client notified of completion',
    'Final delivery sent to client',
    'Final payment received',
    'Job files archived',
  ],
};

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('job_id');
  const stage = searchParams.get('stage');
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 });

  let query = supabaseAdmin
    .from('job_checklists')
    .select('*')
    .eq('job_id', jobId)
    .order('sort_order', { ascending: true });

  if (stage) query = query.eq('stage', stage);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    checklists: data || [],
    templates: STAGE_CHECKLISTS,
  });
}, { routeName: 'jobs/checklists' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { job_id, stage, item, use_template } = await req.json();
  if (!job_id || !stage) return NextResponse.json({ error: 'job_id and stage required' }, { status: 400 });

  // Create from template
  if (use_template) {
    const template = STAGE_CHECKLISTS[stage] || [];
    if (template.length === 0) return NextResponse.json({ error: 'No template for this stage' }, { status: 400 });

    const records = template.map((item, i) => ({
      job_id, stage, item, sort_order: i,
    }));

    const { data, error } = await supabaseAdmin.from('job_checklists').insert(records).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ checklists: data }, { status: 201 });
  }

  // Add single item
  if (!item) return NextResponse.json({ error: 'item text required' }, { status: 400 });
  const { data, error } = await supabaseAdmin
    .from('job_checklists')
    .insert({ job_id, stage, item })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ checklist: data }, { status: 201 });
}, { routeName: 'jobs/checklists' });

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, is_completed } = await req.json();
  if (!id) return NextResponse.json({ error: 'Checklist item ID required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('job_checklists')
    .update({
      is_completed,
      completed_by: is_completed ? session.user.email : null,
      completed_at: is_completed ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ checklist: data });
}, { routeName: 'jobs/checklists' });
