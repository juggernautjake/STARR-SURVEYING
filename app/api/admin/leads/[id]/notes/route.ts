// app/api/admin/leads/[id]/notes/route.ts
//
// LR3 of lead-reply-expansion-2026-06-18.md — office-side notes on a
// lead. Distinct from `leads.notes` (customer-supplied) and from
// `lead_replies` (outbound email). This is the staff's running log of
// internal context: who called whom, what was said off-channel, what
// to chase next.
//
// Routes:
//   GET    → list { notes: LeadNote[] }   pinned-first, newest-second
//   POST   → create { body, pinned? }
//   PATCH  → update { id, body?, pinned? }
//   DELETE → ?id=<noteId>

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface LeadNote {
  id: string;
  lead_id: string;
  author_email: string;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

function leadIdFromPath(req: NextRequest): string | null {
  // Path is /api/admin/leads/{id}/notes; the segment before `notes`
  // is the id (withErrorHandler skips ctx.params).
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const idIdx = segments.indexOf('notes') - 1;
  return idIdx >= 0 ? segments[idIdx] : null;
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!isAdmin(session.user.roles)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { error: null as null, session };
}

// ── GET ──────────────────────────────────────────────────────────────────────
export const GET = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const leadId = leadIdFromPath(req);
  if (!leadId) return NextResponse.json({ error: 'Missing lead id' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('lead_notes')
    .select('id, lead_id, author_email, body, pinned, created_at, updated_at')
    .eq('lead_id', leadId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notes: (data ?? []) as LeadNote[] });
}, { routeName: 'admin/leads/[id]/notes' });

// ── POST ─────────────────────────────────────────────────────────────────────
export const POST = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const author = gate.session!.user!.email!;

  const leadId = leadIdFromPath(req);
  if (!leadId) return NextResponse.json({ error: 'Missing lead id' }, { status: 400 });

  const json = (await req.json()) as { body?: unknown; pinned?: unknown };
  const body = typeof json.body === 'string' ? json.body.trim() : '';
  if (!body) return NextResponse.json({ error: 'Note body is required' }, { status: 400 });
  const pinned = json.pinned === true;

  // Verify the lead exists (FK does the heavy lifting, but a friendly
  // 404 beats a Postgres FK violation in the UI).
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .maybeSingle();
  if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from('lead_notes')
    .insert({ lead_id: leadId, author_email: author, body, pinned })
    .select('id, lead_id, author_email, body, pinned, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data as LeadNote });
}, { routeName: 'admin/leads/[id]/notes' });

// ── PATCH ────────────────────────────────────────────────────────────────────
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const leadId = leadIdFromPath(req);
  if (!leadId) return NextResponse.json({ error: 'Missing lead id' }, { status: 400 });

  const json = (await req.json()) as { id?: unknown; body?: unknown; pinned?: unknown };
  const noteId = typeof json.id === 'string' && json.id.length > 0 ? json.id : null;
  if (!noteId) return NextResponse.json({ error: 'Missing note id' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof json.body === 'string') {
    const trimmed = json.body.trim();
    if (!trimmed) return NextResponse.json({ error: 'Note body cannot be empty' }, { status: 400 });
    patch.body = trimmed;
  }
  if (typeof json.pinned === 'boolean') patch.pinned = json.pinned;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('lead_notes')
    .update(patch)
    .eq('id', noteId)
    .eq('lead_id', leadId)
    .select('id, lead_id, author_email, body, pinned, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  return NextResponse.json({ note: data as LeadNote });
}, { routeName: 'admin/leads/[id]/notes' });

// ── DELETE ───────────────────────────────────────────────────────────────────
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const leadId = leadIdFromPath(req);
  if (!leadId) return NextResponse.json({ error: 'Missing lead id' }, { status: 400 });

  const noteId = new URL(req.url).searchParams.get('id');
  if (!noteId) return NextResponse.json({ error: 'Missing note id' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('lead_notes')
    .delete()
    .eq('id', noteId)
    .eq('lead_id', leadId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}, { routeName: 'admin/leads/[id]/notes' });
