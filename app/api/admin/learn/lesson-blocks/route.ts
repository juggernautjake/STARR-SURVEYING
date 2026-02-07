// app/api/admin/learn/lesson-blocks/route.ts
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// GET - Fetch blocks for a lesson
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const lessonId = searchParams.get('lesson_id');

  if (!lessonId) return NextResponse.json({ error: 'lesson_id required' }, { status: 400 });

  const { data, error } = await supabaseAdmin.from('lesson_blocks')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('order_index');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ blocks: data || [] });
}, { routeName: 'learn/lesson-blocks' });

// POST - Create a new block
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const { lesson_id, block_type, content, order_index } = body;

  if (!lesson_id || !block_type) {
    return NextResponse.json({ error: 'lesson_id and block_type required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from('lesson_blocks')
    .insert({
      lesson_id,
      block_type,
      content: content || {},
      order_index: order_index || 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ block: data });
}, { routeName: 'learn/lesson-blocks' });

// PUT - Bulk update blocks for a lesson (save all blocks at once)
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const { lesson_id, blocks } = body;

  if (!lesson_id || !Array.isArray(blocks)) {
    return NextResponse.json({ error: 'lesson_id and blocks array required' }, { status: 400 });
  }

  // Delete existing blocks for this lesson
  await supabaseAdmin.from('lesson_blocks')
    .delete()
    .eq('lesson_id', lesson_id);

  // Insert all blocks
  if (blocks.length > 0) {
    const toInsert = blocks.map((b: any, i: number) => ({
      lesson_id,
      block_type: b.block_type,
      content: b.content || {},
      order_index: b.order_index ?? i,
    }));

    const { error } = await supabaseAdmin.from('lesson_blocks')
      .insert(toInsert);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Save version snapshot
  const { data: versionCount } = await supabaseAdmin.from('lesson_versions')
    .select('id', { count: 'exact' })
    .eq('lesson_id', lesson_id);

  await supabaseAdmin.from('lesson_versions').insert({
    lesson_id,
    version_number: (versionCount?.length || 0) + 1,
    blocks_snapshot: blocks,
    saved_by: session.user.email,
  });

  return NextResponse.json({ success: true, block_count: blocks.length });
}, { routeName: 'learn/lesson-blocks' });

// DELETE - Delete a single block
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'Block ID required' }, { status: 400 });

  const { error } = await supabaseAdmin.from('lesson_blocks')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}, { routeName: 'learn/lesson-blocks' });
