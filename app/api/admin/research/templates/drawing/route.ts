// app/api/admin/research/templates/drawing/route.ts
// GET — List drawing templates, POST — Create drawing template
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

/* GET — List all drawing templates */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const includeSystem = req.nextUrl.searchParams.get('system') !== 'false';

  let query = supabaseAdmin
    .from('drawing_templates')
    .select('*')
    .order('is_default', { ascending: false })
    .order('is_system', { ascending: false })
    .order('name', { ascending: true });

  if (!includeSystem) {
    query = query.eq('is_system', false);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ templates: data || [] });
}, { routeName: 'research/templates/drawing' });

/* POST — Create a new drawing template */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, description, paper_config, feature_styles, label_config, title_block, is_default } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Template name is required' }, { status: 400 });
  }

  // If marking as default, unset other defaults first
  if (is_default) {
    await supabaseAdmin
      .from('drawing_templates')
      .update({ is_default: false })
      .eq('is_default', true)
      .eq('is_system', false);
  }

  const { data, error } = await supabaseAdmin
    .from('drawing_templates')
    .insert({
      created_by: session.user.email,
      name: name.trim(),
      description: description?.trim() || null,
      is_default: is_default || false,
      is_system: false,
      paper_config: paper_config || { size: 'ANSI_D', orientation: 'landscape', width: 34, height: 22, units: 'inches' },
      feature_styles: feature_styles || {},
      label_config: label_config || {},
      title_block: title_block || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ template: data }, { status: 201 });
}, { routeName: 'research/templates/drawing' });
