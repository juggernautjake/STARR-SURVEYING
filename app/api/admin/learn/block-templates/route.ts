// app/api/admin/learn/block-templates/route.ts
// CRUD API for reusable lesson builder block templates
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

/* ============= GET — List block templates ============= */

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const limit = parseInt(searchParams.get('limit') || '100', 10);

  let query = supabaseAdmin.from('block_templates')
    .select('*')
    .order('is_builtin', { ascending: false })
    .order('name', { ascending: true })
    .limit(limit);

  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ templates: data || [] });
}, { routeName: 'learn/block-templates' });

/* ============= POST — Create a new block template ============= */

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, category, blocks } = body;

  if (!name || !blocks || !Array.isArray(blocks) || blocks.length === 0) {
    return NextResponse.json({ error: 'name and blocks (non-empty array) are required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from('block_templates').insert({
    name,
    description: description || '',
    category: category || 'custom',
    blocks,
    is_builtin: false,
    created_by: session.user.email,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}, { routeName: 'learn/block-templates' });

/* ============= PUT — Update a block template ============= */

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'Missing template id' }, { status: 400 });

  const allowedFields = ['name', 'description', 'category', 'blocks'];
  const cleanUpdates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (updates[field] !== undefined) cleanUpdates[field] = updates[field];
  }

  const { data, error } = await supabaseAdmin
    .from('block_templates')
    .update(cleanUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}, { routeName: 'learn/block-templates' });

/* ============= DELETE — Remove a block template ============= */

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing template id' }, { status: 400 });

  // Don't allow deleting built-in templates
  const { data: existing } = await supabaseAdmin.from('block_templates')
    .select('is_builtin').eq('id', id).single();
  if (existing?.is_builtin) {
    return NextResponse.json({ error: 'Cannot delete built-in templates' }, { status: 403 });
  }

  const { error } = await supabaseAdmin.from('block_templates').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}, { routeName: 'learn/block-templates' });
