// app/api/admin/research/[projectId]/free-plat-leads/route.ts — a free plat lead was filed by hand.
//
// The worker records `analysis_metadata.freePlatLeads` when the county portal names a plat that no
// server address of ours can fetch (the file host is Cloudflare-blocked for datacentre addresses).
// The person in the office opens the file and adds it through the Documents upload; the notice then
// calls this to mark the lead filed, so it stops asking and the next run's early pass knows the
// plat is held. Read-merge-write on the one shared bag, matching the worker's own writer.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

function extractProjectId(req: NextRequest): string | null {
  const after = req.nextUrl.pathname.split('/research/')[1];
  return after ? after.split('/')[0] || null : null;
}

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { url?: string; documentId?: string | null };
  if (!body.url || typeof body.url !== 'string') return NextResponse.json({ error: 'url is required' }, { status: 400 });

  const { data: cur, error: readErr } = await supabaseAdmin
    .from('research_projects')
    .select('analysis_metadata')
    .eq('id', projectId)
    .maybeSingle();
  if (readErr || !cur) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const meta = ((cur as { analysis_metadata?: Record<string, unknown> }).analysis_metadata ?? {}) as Record<string, unknown>;
  const prior = (Array.isArray(meta.freePlatLeads) ? meta.freePlatLeads : []) as Array<Record<string, unknown>>;
  let found = false;
  const filedAt = new Date().toISOString();
  const leads = prior.map((l) => {
    if (l?.url !== body.url) return l;
    found = true;
    return { ...l, filedAt, filedBy: session.user?.email ?? null, documentId: body.documentId ?? null };
  });
  if (!found) return NextResponse.json({ error: 'No lead with that URL on this project' }, { status: 404 });

  const { error } = await supabaseAdmin
    .from('research_projects')
    .update({ analysis_metadata: { ...meta, freePlatLeads: leads }, updated_at: filedAt })
    .eq('id', projectId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, leads });
}, { routeName: 'research/free-plat-leads' });
