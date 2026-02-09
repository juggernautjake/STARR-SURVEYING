// app/api/admin/learn/fieldbook/route.ts — Enhanced Fieldbook API
// Supports CRUD for entries, categories/lists, media, search,
// public/private visibility, and job-linked notes.
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// GET — Fetch entries, categories, or search
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const email = session.user.email;

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  // --- Fetch categories ---
  if (action === 'categories') {
    // Ensure defaults exist (best-effort)
    await supabaseAdmin.rpc('ensure_default_fieldbook_categories', { p_email: email }).catch(() => {});

    const { data, error } = await supabaseAdmin
      .from('fieldbook_categories')
      .select('*')
      .eq('user_email', email)
      .order('sort_order', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ categories: data || [] });
  }

  // --- Fetch single entry by ID ---
  if (action === 'entry') {
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Entry ID required' }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('fieldbook_notes')
      .select('*')
      .eq('id', id)
      .eq('user_email', email)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Fetch categories for this entry
    const { data: cats } = await supabaseAdmin
      .from('fieldbook_entry_categories')
      .select('category_id')
      .eq('entry_id', id);

    return NextResponse.json({
      entry: data,
      category_ids: (cats || []).map((c: { category_id: string }) => c.category_id),
    });
  }

  // --- Get current active entry ---
  if (action === 'current') {
    const { data } = await supabaseAdmin
      .from('fieldbook_notes')
      .select('*')
      .eq('user_email', email)
      .eq('is_current', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ entry: data || null });
  }

  // --- Fetch public job notes (viewable by all team members) ---
  if (action === 'job_notes') {
    const jobId = searchParams.get('job_id');
    let query = supabaseAdmin
      .from('fieldbook_notes')
      .select('id, user_email, title, content, job_id, job_name, job_number, created_at, updated_at, tags, media, is_public')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(100);

    if (jobId) {
      query = query.eq('job_id', jobId);
    } else {
      query = query.not('job_id', 'is', null);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entries: data || [] });
  }

  // --- Search entries ---
  if (action === 'search') {
    const q = searchParams.get('q') || '';
    const dateFrom = searchParams.get('from');
    const dateTo = searchParams.get('to');
    const categoryId = searchParams.get('category_id');
    const visibility = searchParams.get('visibility'); // 'public', 'private', or null for all
    const jobOnly = searchParams.get('job_only');

    let query = supabaseAdmin
      .from('fieldbook_notes')
      .select('id, title, content, created_at, updated_at, tags, media, is_public, job_id, job_name, job_number')
      .eq('user_email', email)
      .order('created_at', { ascending: false })
      .limit(100);

    if (q) query = query.or(`title.ilike.%${q}%,content.ilike.%${q}%`);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo);
    if (visibility === 'public') query = query.eq('is_public', true);
    if (visibility === 'private') query = query.eq('is_public', false);
    if (jobOnly === 'true') query = query.not('job_id', 'is', null);
    if (jobOnly === 'false') query = query.is('job_id', null);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let entries = data || [];

    // Filter by category if specified
    if (categoryId) {
      const { data: linked } = await supabaseAdmin
        .from('fieldbook_entry_categories')
        .select('entry_id')
        .eq('category_id', categoryId);
      const linkedIds = new Set((linked || []).map((l: { entry_id: string }) => l.entry_id));
      entries = entries.filter((e: { id: string }) => linkedIds.has(e.id));
    }

    return NextResponse.json({ entries });
  }

  // --- Default: list recent entries ---
  const limit = parseInt(searchParams.get('limit') || '30', 10);

  const { data, error } = await supabaseAdmin
    .from('fieldbook_notes')
    .select('id, title, content, context_label, page_url, created_at, updated_at, media, tags, is_public, job_id, job_name, job_number')
    .eq('user_email', email)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const entries = (data || []).map((n: {
    id: string; title: string | null; content: string;
    context_label: string | null; page_url: string | null;
    created_at: string; updated_at: string;
    media: unknown[] | null; tags: string[] | null;
    is_public?: boolean; job_id?: string | null; job_name?: string | null; job_number?: string | null;
  }) => ({
    id: n.id,
    title: n.title || 'Untitled Note',
    content: n.content,
    context_label: n.context_label || 'General',
    context_path: n.page_url || '',
    created_at: n.created_at,
    updated_at: n.updated_at,
    media: n.media || [],
    tags: n.tags || [],
    is_public: n.is_public ?? false,
    job_id: n.job_id || null,
    job_name: n.job_name || null,
    job_number: n.job_number || null,
  }));

  return NextResponse.json({ entries });
}, { routeName: 'learn/fieldbook' });

// POST — Create a new entry, category, or manage category links
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const email = session.user.email;

  const body = await req.json();
  const { action } = body;

  // --- Create a new category ---
  if (action === 'create_category') {
    const { name, icon, color } = body;
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('fieldbook_categories')
      .insert({ user_email: email, name: name.trim(), icon: icon || '📁', color: color || '#1D3095' })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ category: data });
  }

  // --- Add entry to category ---
  if (action === 'add_to_category') {
    const { entry_id, category_id } = body;
    if (!entry_id || !category_id) return NextResponse.json({ error: 'entry_id and category_id required' }, { status: 400 });

    await supabaseAdmin
      .from('fieldbook_entry_categories')
      .upsert({ entry_id, category_id }, { onConflict: 'entry_id,category_id' });

    return NextResponse.json({ success: true });
  }

  // --- Remove entry from category ---
  if (action === 'remove_from_category') {
    const { entry_id, category_id } = body;
    await supabaseAdmin
      .from('fieldbook_entry_categories')
      .delete()
      .eq('entry_id', entry_id)
      .eq('category_id', category_id);
    return NextResponse.json({ success: true });
  }

  // --- Create new entry ---
  const { title, content, media, tags, category_ids, is_public, job_id, job_name, job_number } = body;

  // Unmark any current entry for this user
  await supabaseAdmin
    .from('fieldbook_notes')
    .update({ is_current: false })
    .eq('user_email', email)
    .eq('is_current', true);

  const insertData: Record<string, unknown> = {
    user_email: email,
    title: title?.trim() || 'Untitled Note',
    content: (content || '').trim(),
    media: media || [],
    tags: tags || [],
    is_current: true,
    content_format: 'rich_text',
  };

  // Public/private (job notes are always public)
  if (job_id) {
    insertData.is_public = true;
    insertData.job_id = job_id;
    insertData.job_name = job_name || null;
    insertData.job_number = job_number || null;
  } else {
    insertData.is_public = is_public ?? false;
  }

  const { data, error } = await supabaseAdmin.from('fieldbook_notes')
    .insert(insertData)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Link to categories
  if (category_ids && Array.isArray(category_ids) && category_ids.length > 0) {
    const links = category_ids.map((cid: string) => ({ entry_id: data.id, category_id: cid }));
    await supabaseAdmin.from('fieldbook_entry_categories').insert(links);
  }

  return NextResponse.json({ entry: data });
}, { routeName: 'learn/fieldbook' });

// PUT — Update an entry or category
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const email = session.user.email;

  const body = await req.json();
  const { action } = body;

  // --- Update a category ---
  if (action === 'update_category') {
    const { id, name, icon, color } = body;
    if (!id) return NextResponse.json({ error: 'Category ID required' }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (icon !== undefined) updates.icon = icon;
    if (color !== undefined) updates.color = color;

    const { data, error } = await supabaseAdmin
      .from('fieldbook_categories')
      .update(updates)
      .eq('id', id)
      .eq('user_email', email)
      .eq('is_default', false)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ category: data });
  }

  // --- Auto-save / update entry ---
  const { id, title, content, media, tags, category_ids, is_public } = body;
  if (!id) return NextResponse.json({ error: 'Entry ID required' }, { status: 400 });

  // Fetch the existing entry to check if it's a job note
  const { data: existing } = await supabaseAdmin
    .from('fieldbook_notes')
    .select('job_id')
    .eq('id', id)
    .eq('user_email', email)
    .single();

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title.trim() || 'Untitled Note';
  if (content !== undefined) updates.content = content;
  if (media !== undefined) updates.media = media;
  if (tags !== undefined) updates.tags = tags;

  // Public/private — job notes are always public, can't be changed
  if (is_public !== undefined && !existing?.job_id) {
    updates.is_public = is_public;
  }

  const { data, error } = await supabaseAdmin
    .from('fieldbook_notes')
    .update(updates)
    .eq('id', id)
    .eq('user_email', email)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update category links if provided
  if (category_ids !== undefined && Array.isArray(category_ids)) {
    await supabaseAdmin.from('fieldbook_entry_categories').delete().eq('entry_id', id);
    if (category_ids.length > 0) {
      const links = category_ids.map((cid: string) => ({ entry_id: id, category_id: cid }));
      await supabaseAdmin.from('fieldbook_entry_categories').insert(links);
    }
  }

  return NextResponse.json({ entry: data });
}, { routeName: 'learn/fieldbook' });

// DELETE — Delete entry or category
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const email = session.user.email;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  if (type === 'category') {
    // Don't allow deleting default categories
    const { error } = await supabaseAdmin
      .from('fieldbook_categories')
      .delete()
      .eq('id', id)
      .eq('user_email', email)
      .eq('is_default', false);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // Delete entry
  const { error } = await supabaseAdmin
    .from('fieldbook_notes')
    .delete()
    .eq('id', id)
    .eq('user_email', email);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}, { routeName: 'learn/fieldbook' });
