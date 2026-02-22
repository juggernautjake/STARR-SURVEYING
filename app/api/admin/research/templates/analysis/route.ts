// app/api/admin/research/templates/analysis/route.ts
// GET — List analysis templates, POST — Create analysis template
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

/* GET — List all analysis templates */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const includeSystem = req.nextUrl.searchParams.get('system') !== 'false';

  let query = supabaseAdmin
    .from('analysis_templates')
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
}, { routeName: 'research/templates/analysis' });

/* POST — Create a new analysis template */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, description, extract_config, display_config, is_default } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Template name is required' }, { status: 400 });
  }

  // If marking as default, unset other defaults first
  if (is_default) {
    await supabaseAdmin
      .from('analysis_templates')
      .update({ is_default: false })
      .eq('is_default', true)
      .eq('is_system', false);
  }

  const { data, error } = await supabaseAdmin
    .from('analysis_templates')
    .insert({
      created_by: session.user.email,
      name: name.trim(),
      description: description?.trim() || null,
      is_default: is_default || false,
      is_system: false,
      extract_config: extract_config || {},
      display_config: display_config || {},
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ template: data }, { status: 201 });
}, { routeName: 'research/templates/analysis' });
