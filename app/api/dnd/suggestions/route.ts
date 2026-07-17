// app/api/dnd/suggestions/route.ts — the /dnd suggestion box (Phase T).
//   GET  → every suggestion, newest first (the review page is open to anyone).
//   POST → drop a new suggestion. Signed-in users are auto-attributed; the field is on
//          every /dnd page (including the login screen) so anonymous submits are allowed.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, isDndOwner } from '@/lib/dnd/auth';

const MAX_BODY = 4000;
const MAX_NAME = 120;

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('dnd_suggestions')
      .select('id, body, author_name, page_path, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({
      // Whether the current viewer may manage the board (delete/status) — drives the owner-only
      // controls on the review page so a non-owner never sees a Delete button that would 403.
      owner: isDndOwner(getDndSession()),
      suggestions: ((data ?? []) as { id: string; body: string; author_name: string | null; page_path: string | null; created_at: string }[]).map((s) => ({
        id: s.id,
        body: s.body,
        authorName: s.author_name,
        pagePath: s.page_path,
        createdAt: s.created_at,
      })),
    });
  } catch {
    // Table not migrated yet → empty list rather than a 500 (graceful degradation).
    return NextResponse.json({ owner: isDndOwner(getDndSession()), suggestions: [] });
  }
}

export async function POST(req: NextRequest) {
  let body: { body?: string; authorName?: string; pagePath?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const text = String(body.body ?? '').trim();
  if (!text) return NextResponse.json({ error: 'Type a suggestion first.' }, { status: 400 });

  const session = getDndSession();
  // Prefer the signed-in name; fall back to a typed name (footer field on the login page).
  const authorName = (session?.displayName || String(body.authorName ?? '').trim() || null)?.slice(0, MAX_NAME) ?? null;
  const pagePath = body.pagePath ? String(body.pagePath).slice(0, 300) : null;

  try {
    const { data, error } = await supabaseAdmin
      .from('dnd_suggestions')
      .insert({ body: text.slice(0, MAX_BODY), author_name: authorName, page_path: pagePath, user_id: session?.userId ?? null })
      .select('id, created_at')
      .single();
    if (error || !data) throw error ?? new Error('insert failed');
    return NextResponse.json({ ok: true, id: (data as { id: string }).id });
  } catch {
    return NextResponse.json({ error: 'Could not save your suggestion. The suggestions table may not be set up yet.' }, { status: 503 });
  }
}
