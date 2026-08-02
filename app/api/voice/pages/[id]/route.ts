// app/api/voice/pages/[id]/route.ts — save, publish, revert and delete one page.
//
// ── SAVE AND PUBLISH ARE DIFFERENT VERBS ────────────────────────────────────────────────────────
//
// `PATCH { blocks }`         → writes `draft_blocks`. Nothing changes for a visitor.
// `PATCH { publish: true }`  → copies `draft_blocks` into `blocks`, snapshots, clears the draft.
// `PATCH { revert: true }`   → drops `draft_blocks`. The published page is untouched throughout.
//
// Keeping them apart is what lets Andrew experiment on a live page without a client ever seeing a
// half-finished thought. It is also why the editor can autosave aggressively: an autosave writes a
// draft, and a draft is invisible.
//
// ── EVERY WRITE IS SANITISED AND NORMALISED ─────────────────────────────────────────────────────
//
// `blocks` is JSONB, so the database will accept literally anything. The two guards that make that
// safe live here, at the only door that writes to it: `normalizeWidgets` throws away anything that is
// not a valid widget, and `sanitizeWidgetProps` cleans the HTML the rich-text editor produces. A
// write path that skipped either would put unrenderable — or executable — content into a column the
// public page sets with `dangerouslySetInnerHTML`.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVoiceSession } from '@/lib/voice/auth';
import { normalizeWidgets } from '@/lib/voice/widgets';
import { sanitizeWidgetProps, stripHtml } from '@/lib/voice/sanitize';
import { slugify } from '../route';

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
}

/** The single place raw block JSON becomes storable block JSON. */
function cleanBlocks(raw: unknown) {
  return normalizeWidgets(raw).map((w) => ({
    ...w,
    props: sanitizeWidgetProps(w.type, w.props),
  }));
}

export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  const { data, error } = await supabaseAdmin.from('va_pages').select('*').eq('id', params.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  return NextResponse.json({ page: data });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const { data: page, error: readErr } = await supabaseAdmin
    .from('va_pages')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!page) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // ── PUBLISH ──
  if (body.publish === true) {
    const toPublish = Array.isArray(page.draft_blocks) && page.draft_blocks.length ? page.draft_blocks : page.blocks;

    // Snapshot the OUTGOING version before overwriting it. Taken here rather than on save because a
    // save happens every few seconds while typing; a revision per keystroke is not a history, it is
    // noise that buries the version Andrew actually wants back.
    if (Array.isArray(page.blocks) && page.blocks.length) {
      await supabaseAdmin.from('va_page_revisions').insert({
        page_id: page.id,
        blocks: page.blocks,
        title: page.title,
        note: 'Before publish',
      });
    }

    patch.blocks = toPublish;
    patch.draft_blocks = null;
    patch.status = page.status === 'draft' ? 'live' : page.status;
    patch.published_at = new Date().toISOString();
  } else if (body.revert === true) {
    patch.draft_blocks = null;
  } else if (body.blocks !== undefined) {
    patch.draft_blocks = cleanBlocks(body.blocks);
  }

  // ── METADATA ──
  if (typeof body.title === 'string') patch.title = body.title.trim().slice(0, 200) || 'Untitled';
  if (typeof body.subtitle === 'string') patch.subtitle = body.subtitle.trim().slice(0, 300) || null;
  if (typeof body.summary === 'string') patch.summary = stripHtml(body.summary).slice(0, 600) || null;
  if (typeof body.slug === 'string' && body.slug.trim()) patch.slug = slugify(body.slug);
  if (typeof body.clientName === 'string') patch.client_name = body.clientName.trim().slice(0, 200) || null;
  if (typeof body.roleLabel === 'string') patch.role_label = body.roleLabel.trim().slice(0, 120) || null;
  if (typeof body.projectType === 'string') patch.project_type = body.projectType.slice(0, 40) || null;
  if (typeof body.coverPhotoId === 'string') patch.cover_photo_id = body.coverPhotoId || null;
  if (typeof body.seoTitle === 'string') patch.seo_title = body.seoTitle.trim().slice(0, 200) || null;
  if (typeof body.seoDescription === 'string') patch.seo_description = body.seoDescription.trim().slice(0, 400) || null;
  if (typeof body.year === 'number' && Number.isFinite(body.year)) patch.year = Math.round(body.year);
  if (typeof body.sortOrder === 'number') patch.sort_order = Math.round(body.sortOrder);
  if (typeof body.featured === 'boolean') patch.featured = body.featured;
  if (Array.isArray(body.tags)) {
    patch.tags = body.tags.filter((t) => typeof t === 'string').map((t) => (t as string).slice(0, 40)).slice(0, 20);
  }
  if (typeof body.status === 'string' && ['draft', 'live', 'archived'].includes(body.status)) {
    patch.status = body.status;
    if (body.status === 'live' && !page.published_at) patch.published_at = new Date().toISOString();
  }
  if (typeof body.workState === 'string' && ['in_progress', 'completed'].includes(body.workState)) {
    patch.work_state = body.workState;
  }
  if (body.pageStyle && typeof body.pageStyle === 'object') patch.page_style = body.pageStyle;

  const { data, error } = await supabaseAdmin
    .from('va_pages')
    .update(patch)
    .eq('id', params.id)
    .select('id, slug, kind, title, status, updated_at')
    .single();

  if (error) {
    // A slug collision is the one error a person can cause by typing, so it gets a human message.
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Another page already uses that address.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ page: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  // Deleting an adopted built-in page is how "Restore the original" works: the row goes, and the
  // route falls back to the default block array again. So this is genuinely a delete, not an archive.
  const { error } = await supabaseAdmin.from('va_pages').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
