// app/api/admin/jobs/field-data/route.ts — Live field data collection
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('job_id');
  const dataType = searchParams.get('data_type');
  const since = searchParams.get('since'); // For live polling
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 });

  let query = supabaseAdmin
    .from('job_field_data')
    .select('*')
    .eq('job_id', jobId)
    .order('collected_at', { ascending: true });

  if (dataType) query = query.eq('data_type', dataType);
  if (since) query = query.gt('collected_at', since);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ field_data: data || [], count: (data || []).length });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  // Support batch upload (array of points)
  const entries = Array.isArray(body) ? body : [body];

  const records = entries.map((entry: {
    job_id: string; data_type: string; point_name?: string;
    northing?: number; easting?: number; elevation?: number;
    description?: string; raw_data?: unknown; instrument?: string;
    collected_at?: string;
  }) => ({
    job_id: entry.job_id,
    data_type: entry.data_type || 'point',
    point_name: entry.point_name,
    northing: entry.northing,
    easting: entry.easting,
    elevation: entry.elevation,
    description: entry.description,
    raw_data: entry.raw_data,
    instrument: entry.instrument,
    collected_by: session.user!.email!,
    collected_at: entry.collected_at || new Date().toISOString(),
  }));

  const { data, error } = await supabaseAdmin
    .from('job_field_data')
    .insert(records)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ field_data: data, count: (data || []).length }, { status: 201 });
}
