// app/api/admin/jobs/equipment/route.ts — Equipment tracking
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('job_id');
  const inventory = searchParams.get('inventory') === 'true';

  // Return full equipment inventory
  if (inventory) {
    const { data, error } = await supabaseAdmin
      .from('equipment_inventory')
      .select('*')
      .order('name', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ equipment: data || [] });
  }

  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('job_equipment')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ equipment: data || [] });
}, { routeName: 'jobs/equipment' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { job_id, equipment_name, equipment_type, serial_number, notes,
    // For inventory management
    inventory_item, brand, model } = await req.json();

  // Add to inventory
  if (inventory_item) {
    const { data, error } = await supabaseAdmin
      .from('equipment_inventory')
      .insert({ name: equipment_name, equipment_type, brand, model, serial_number, notes })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ equipment: data }, { status: 201 });
  }

  // Assign to job
  if (!job_id || !equipment_name) return NextResponse.json({ error: 'job_id and equipment_name required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('job_equipment')
    .insert({
      job_id, equipment_name, equipment_type, serial_number,
      checked_out_by: session.user.email,
      checked_out_at: new Date().toISOString(),
      notes,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ equipment: data }, { status: 201 });
}, { routeName: 'jobs/equipment' });

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, returned, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: 'Equipment ID required' }, { status: 400 });

  if (returned) {
    updates.returned_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from('job_equipment')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ equipment: data });
}, { routeName: 'jobs/equipment' });
