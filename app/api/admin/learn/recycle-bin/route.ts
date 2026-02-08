// app/api/admin/learn/recycle-bin/route.ts
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

const TABLE_MAP: Record<string, string> = {
  module: 'learning_modules',
  lesson: 'learning_lessons',
  article: 'kb_articles',
  question: 'question_bank',
  flashcard: 'flashcards',
};

// GET - List items in recycle bin
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const { data, error } = await supabaseAdmin
      .from('recycle_bin')
      .select('*')
      .order('deleted_at', { ascending: false });

    if (error) {
      console.error('recycle-bin GET error:', error);
      return NextResponse.json({ items: [] });
    }

    return NextResponse.json({ items: data || [] });
  } catch (err) {
    console.error('recycle-bin GET exception:', err);
    return NextResponse.json({ items: [] });
  }
}

// POST - Soft delete: move item to recycle bin
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const body = await req.json();
    const { item_type, item_id } = body;

    if (!item_type || !item_id) {
      return NextResponse.json({ error: 'item_type and item_id required' }, { status: 400 });
    }

    const tableName = TABLE_MAP[item_type];
    if (!tableName) {
      return NextResponse.json({ error: `Invalid item_type: ${item_type}` }, { status: 400 });
    }

    // Fetch the item data before deleting
    const { data: item, error: fetchErr } = await supabaseAdmin
      .from(tableName)
      .select('*')
      .eq('id', item_id)
      .single();

    if (fetchErr || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Determine title for display
    const itemTitle = item.title || item.term || item.question_text?.substring(0, 80) || 'Untitled';

    // Insert into recycle bin
    const { error: insertErr } = await supabaseAdmin.from('recycle_bin').insert({
      original_table: tableName,
      original_id: item_id,
      item_type,
      item_title: itemTitle,
      item_data: item,
      deleted_by: session.user.email || 'unknown',
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
    });

    if (insertErr) {
      console.error('recycle-bin insert error:', insertErr);
      return NextResponse.json({ error: 'Failed to move to recycle bin' }, { status: 500 });
    }

    // Soft delete: set deleted_at if the table has that column, otherwise hard delete
    const { error: deleteErr } = await supabaseAdmin
      .from(tableName)
      .delete()
      .eq('id', item_id);

    if (deleteErr) {
      console.error('recycle-bin delete error:', deleteErr);
      // Try to clean up the recycle bin entry
      await supabaseAdmin.from('recycle_bin').delete().eq('original_id', item_id);
      return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('recycle-bin POST exception:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PUT - Restore item from recycle bin
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const body = await req.json();
    const { id, action } = body;

    if (action !== 'restore' || !id) {
      return NextResponse.json({ error: 'id and action=restore required' }, { status: 400 });
    }

    // Get recycle bin entry
    const { data: entry, error: fetchErr } = await supabaseAdmin
      .from('recycle_bin')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !entry) {
      return NextResponse.json({ error: 'Recycle bin entry not found' }, { status: 404 });
    }

    // Re-insert the original data
    const itemData = entry.item_data;
    // Remove any deleted_at that might have been set
    delete itemData.deleted_at;

    const { error: insertErr } = await supabaseAdmin
      .from(entry.original_table)
      .insert(itemData);

    if (insertErr) {
      console.error('recycle-bin restore insert error:', insertErr);
      return NextResponse.json({ error: `Failed to restore: ${insertErr.message}` }, { status: 500 });
    }

    // Remove from recycle bin
    await supabaseAdmin.from('recycle_bin').delete().eq('id', id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('recycle-bin PUT exception:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// DELETE - Permanently delete from recycle bin
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('recycle_bin')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('recycle-bin permanent delete error:', error);
      return NextResponse.json({ error: 'Failed to permanently delete' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('recycle-bin DELETE exception:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
