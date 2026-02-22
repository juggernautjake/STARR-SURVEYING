// app/api/admin/research/templates/[type]/[id]/route.ts
// PATCH — Update template, DELETE — Remove template
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

function extractParams(req: NextRequest): { templateType: string | null; templateId: string | null } {
  const afterTemplates = req.nextUrl.pathname.split('/templates/')[1];
  if (!afterTemplates) return { templateType: null, templateId: null };
  const parts = afterTemplates.split('/');
  return {
    templateType: parts[0] || null,
    templateId: parts[1] || null,
  };
}

function getTable(templateType: string): string | null {
  if (templateType === 'analysis') return 'analysis_templates';
  if (templateType === 'drawing') return 'drawing_templates';
  return null;
}

/* PATCH — Update a template */
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { templateType, templateId } = extractParams(req);
  if (!templateType || !templateId) {
    return NextResponse.json({ error: 'Template type and ID required' }, { status: 400 });
  }

  const table = getTable(templateType);
  if (!table) {
    return NextResponse.json({ error: 'Invalid template type. Use "analysis" or "drawing".' }, { status: 400 });
  }

  // Check the template exists and is not a system template
  const { data: existing } = await supabaseAdmin
    .from(table)
    .select('id, is_system')
    .eq('id', templateId)
    .single();

  if (!existing) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  if (existing.is_system) {
    return NextResponse.json({ error: 'System templates cannot be modified' }, { status: 403 });
  }

  const body = await req.json();
  const allowed: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.name !== undefined) allowed.name = body.name.trim();
  if (body.description !== undefined) allowed.description = body.description?.trim() || null;

  // If marking as default, unset other defaults first
  if (body.is_default === true) {
    await supabaseAdmin
      .from(table)
      .update({ is_default: false })
      .eq('is_default', true)
      .eq('is_system', false);
    allowed.is_default = true;
  } else if (body.is_default === false) {
    allowed.is_default = false;
  }

  // Type-specific fields
  if (templateType === 'analysis') {
    if (body.extract_config) allowed.extract_config = body.extract_config;
    if (body.display_config) allowed.display_config = body.display_config;
  } else {
    if (body.paper_config) allowed.paper_config = body.paper_config;
    if (body.feature_styles) allowed.feature_styles = body.feature_styles;
    if (body.label_config) allowed.label_config = body.label_config;
    if (body.title_block !== undefined) allowed.title_block = body.title_block;
  }

  const { data, error } = await supabaseAdmin
    .from(table)
    .update(allowed)
    .eq('id', templateId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ template: data });
}, { routeName: 'research/templates/update' });

/* DELETE — Delete a template */
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { templateType, templateId } = extractParams(req);
  if (!templateType || !templateId) {
    return NextResponse.json({ error: 'Template type and ID required' }, { status: 400 });
  }

  const table = getTable(templateType);
  if (!table) {
    return NextResponse.json({ error: 'Invalid template type. Use "analysis" or "drawing".' }, { status: 400 });
  }

  // Check the template exists and is not a system template
  const { data: existing } = await supabaseAdmin
    .from(table)
    .select('id, is_system')
    .eq('id', templateId)
    .single();

  if (!existing) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  if (existing.is_system) {
    return NextResponse.json({ error: 'System templates cannot be deleted' }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from(table)
    .delete()
    .eq('id', templateId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}, { routeName: 'research/templates/delete' });
