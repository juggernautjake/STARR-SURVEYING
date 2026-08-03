// app/api/voice/pages/route.ts — list and create pages.
//
// Every route under /api/voice that is not the public inquiry form starts with the same session
// check. It is repeated per route rather than pushed into middleware because the middleware matcher
// in this repo is an allow-list of prefixes, and a route added later that nobody remembers to add to
// that list would be silently public. A guard on the file cannot be forgotten by a file that does not
// exist yet.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVoiceSession } from '@/lib/voice/auth';
import { normalizeWidgets } from '@/lib/voice/widgets';
import { sanitizeWidgetProps } from '@/lib/voice/sanitize';
import { defaultPageBySlug, newPageBlocks, newProjectBlocks } from '@/lib/voice/default-pages';
import { safeSlug, slugify } from '@/lib/voice/slug';

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
}

export async function GET(): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  const { data, error } = await supabaseAdmin
    .from('va_pages')
    .select('id, slug, kind, title, status, work_state, featured, sort_order, updated_at, draft_blocks')
    .order('sort_order', { ascending: true })
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    pages: (data ?? []).map((p: Record<string, unknown>) => ({
      ...p,
      // The list only needs to know THAT there are unpublished changes, not what they are. Sending
      // every draft block for every page would make the page list the heaviest request in the studio.
      hasDraft: Array.isArray(p.draft_blocks) && (p.draft_blocks as unknown[]).length > 0,
      draft_blocks: undefined,
    })),
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = getVoiceSession();
  if (!session) return unauthorized();

  let body: { title?: string; kind?: string; slug?: string; adopt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  // ── ADOPTION ──
  // "Adopting" is what happens the first time Andrew edits a built-in page: the default block array
  // is copied into the database so it becomes an ordinary editable row. Doing it as an explicit
  // action rather than lazily on first save means the studio's page list can show every page — his
  // and the built-ins — as one list, and "Restore the original" is just deleting the row again.
  if (body.adopt) {
    const fallback = defaultPageBySlug(body.adopt);
    if (!fallback) return NextResponse.json({ error: 'No such built-in page.' }, { status: 404 });

    const { data: existing } = await supabaseAdmin
      .from('va_pages')
      .select('id')
      .eq('kind', 'page')
      .eq('slug', fallback.slug)
      .maybeSingle();

    // Already adopted — return the existing row rather than erroring. Two clicks on "Edit this page"
    // must not produce a duplicate-key failure.
    if (existing) return NextResponse.json({ page: existing, adopted: false });

    const { data, error } = await supabaseAdmin
      .from('va_pages')
      .insert({
        slug: fallback.slug,
        kind: 'page',
        title: fallback.title,
        summary: fallback.description,
        status: 'live',
        blocks: fallback.blocks,
        seo_title: fallback.seoTitle,
        seo_description: fallback.seoDescription,
        published_at: new Date().toISOString(),
      })
      .select('id, slug, title')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ page: data, adopted: true });
  }

  // ── NEW PAGE ──
  const kind = body.kind === 'page' ? 'page' : 'project';
  const title = String(body.title ?? '').trim() || (kind === 'page' ? 'Untitled page' : 'Untitled project');
  // `safeSlug` rather than `slugify`: a PAGE slugged `studio` or `login` is shadowed by a static
  // route that never reads this table, so it would never render and nothing would error — see
  // SHADOWED_SLUGS. Projects live under /work/<slug> and cannot collide, so they keep the plain slug.
  const baseSlug = kind === 'page' ? safeSlug(body.slug || title) : slugify(body.slug || title);

  // Slug collisions are resolved by suffixing rather than rejected. Andrew naming two projects
  // "Radio spot" is normal; making him invent a URL is not.
  let slug = baseSlug;
  for (let attempt = 2; attempt < 50; attempt += 1) {
    const { data: clash } = await supabaseAdmin
      .from('va_pages')
      .select('id')
      .eq('kind', kind)
      .eq('slug', slug)
      .maybeSingle();
    if (!clash) break;
    slug = `${baseSlug}-${attempt}`;
  }

  // A page is not a project: project scaffolding on a page about his rates is five blocks to delete
  // before he can start, which is where a person decides the builder is fighting them.
  const scaffold = kind === 'page' ? newPageBlocks(title) : newProjectBlocks(title);
  const blocks = normalizeWidgets(scaffold).map((w) => ({
    ...w,
    props: sanitizeWidgetProps(w.type, w.props),
  }));

  const { data, error } = await supabaseAdmin
    .from('va_pages')
    .insert({ slug, kind, title, status: 'draft', blocks })
    .select('id, slug, title, kind, status')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ page: data });
}
