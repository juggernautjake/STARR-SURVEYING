// app/api/admin/media/route.ts — Media library management API
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

/* GET — List all media items with filtering */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const mediaType = searchParams.get('type'); // image, video, audio, document, url
  const search = searchParams.get('search');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');

  let query = supabaseAdmin.from('media_library')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (mediaType) query = query.eq('media_type', mediaType);
  if (search) query = query.or(`title.ilike.%${search}%,tags.cs.{${search}},caption.ilike.%${search}%`);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ media: data || [], total: count || 0, page, limit });
}, { routeName: 'media' });

/* POST — Create/upload a media item */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const { title, caption, media_type, url, data_url, tags, alt_text, link_url, is_clickable, resolution, source_context, source_id } = body;

  if (!media_type) return NextResponse.json({ error: 'media_type required' }, { status: 400 });
  if (!url && !data_url) return NextResponse.json({ error: 'url or data_url required' }, { status: 400 });

  const { data, error } = await supabaseAdmin.from('media_library').insert({
    title: title || 'Untitled',
    caption: caption || null,
    media_type,
    url: url || data_url,
    alt_text: alt_text || null,
    link_url: link_url || null,
    is_clickable: is_clickable || false,
    resolution: resolution || null,
    tags: tags || [],
    uploaded_by: session.user.email,
    source_context: source_context || null,
    source_id: source_id || null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ media: data });
}, { routeName: 'media' });

/* PUT — Update media metadata */
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const { id, title, caption, alt_text, tags, link_url, is_clickable, resolution } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (caption !== undefined) updates.caption = caption;
  if (alt_text !== undefined) updates.alt_text = alt_text;
  if (tags !== undefined) updates.tags = tags;
  if (link_url !== undefined) updates.link_url = link_url;
  if (is_clickable !== undefined) updates.is_clickable = is_clickable;
  if (resolution !== undefined) updates.resolution = resolution;

  const { data, error } = await supabaseAdmin.from('media_library')
    .update(updates).eq('id', id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ media: data });
}, { routeName: 'media' });

/* DELETE — Soft delete (move to recycle bin) */
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const permanent = searchParams.get('permanent') === 'true';
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  if (permanent) {
    const { error } = await supabaseAdmin.from('media_library').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabaseAdmin.from('media_library')
      .update({ deleted_at: new Date().toISOString(), deleted_by: session.user.email })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}, { routeName: 'media' });
