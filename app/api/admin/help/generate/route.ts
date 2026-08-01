// app/api/admin/help/generate/route.ts — the empty help drawers fill themselves (audit §5, item 15).
//
// §5: *"The help drawer — the literal 'help me, I'm stuck' surface — has no AI at all, and 150 of
// 158 pages show 'No help curated for this page yet.'"* And: *"AI-generated page help as the
// fallback when `help-catalog.ts` has no entry — grounded in the route registry entry + the actual
// page, so those 150 empty drawers fill themselves."*
//
// GET ?path=/admin/x → { entry, source: 'curated' | 'generated' | 'unavailable' }
//
// ── CURATED ALWAYS WINS, AND THE ANSWER SAYS WHICH IT IS ────────────────────────────────────────
//
// A generated entry is a good guess about a page from its registry metadata. A curated one is what
// somebody who built the page decided to say. Where both exist the human wins, and the response
// labels the source so the drawer can mark generated help as generated — a reader who cannot tell
// the difference will trust a guess exactly as much as a fact.
//
// ── GENERATED HELP IS CACHED, BECAUSE A HELP DRAWER IS OPENED CONSTANTLY ────────────────────────
//
// Without a cache this is an LLM call every time somebody presses `?`. Cached by pathname in the
// database, so the second reader of a page — and every reader after — pays nothing.
import { NextRequest, NextResponse } from 'next/server';
import { auth, type UserRole } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { supabaseAdmin } from '@/lib/supabase';
import { callAi, aiConfigured } from '@/lib/ai/client';
import { findRoute, routeLabel, breadcrumbTrail, type Crumb } from '@/lib/admin/route-registry';
import { lookupHelp, type HelpEntry } from '@/lib/admin/help-catalog';
import { getTenantProfile } from '@/lib/saas/tenant-profile';
import { orgIdForSession } from '@/lib/saas/org-scope-context';

const PROMPT = `
You write the short help text shown in a "?" drawer on one page of a surveying firm's admin app.

You are given only what the app's own route registry knows about the page. Write from that. Do NOT
invent buttons, fields, keyboard shortcuts, menu items, or workflows you have not been told about —
help that describes a button which is not there is worse than no help, because the reader searches
for it and concludes the page is broken.

Return JSON only, with exactly these keys:
  "title": short, the page's name.
  "blurb": one or two sentences on what this page is FOR — the job it does, not the widgets on it.
  "tips": 2 to 4 short strings. Practical and specific to this page. If you genuinely have nothing
          page-specific to say, return fewer tips rather than padding with generic advice.

No markdown, no code fences, no commentary. JSON only.
`.trim();

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const path = new URL(req.url).searchParams.get('path');
  if (!path || !path.startsWith('/admin')) {
    return NextResponse.json({ error: 'An /admin path is required.' }, { status: 400 });
  }

  const route = findRoute(path);
  const workspaceHref = route ? `/admin/${route.workspace}` : null;

  // 1. Curated wins.
  const curated = lookupHelp(path, workspaceHref);
  if (curated) {
    return NextResponse.json({ entry: curated, source: 'curated' }, { headers: { 'Cache-Control': 'private, max-age=300' } });
  }

  // 2. Previously generated.
  const { data: cached } = await supabaseAdmin
    .from('help_generated')
    .select('title, blurb, tips, generated_at')
    .eq('path', path)
    .maybeSingle();
  if (cached) {
    const row = cached as { title: string; blurb: string; tips: string[] };
    return NextResponse.json(
      { entry: { title: row.title, blurb: row.blurb, tips: row.tips ?? [] } satisfies HelpEntry, source: 'generated' },
      { headers: { 'Cache-Control': 'private, max-age=300' } },
    );
  }

  if (!aiConfigured()) {
    // Distinguished from "no help exists". The drawer can say "help hasn't been written for this
    // page" rather than implying the page is undocumented on purpose.
    return NextResponse.json({ entry: null, source: 'unavailable', reason: 'not_configured' });
  }

  // 3. Generate, grounded in what the registry knows and nothing else.
  const profile = await getTenantProfile(orgIdForSession(session));
  const trail = breadcrumbTrail(path).map((c: Crumb) => c.label).join(' › ');
  const grounding = [
    `Firm: ${profile.name || 'a surveying firm'}`,
    `Page path: ${path}`,
    `Page name: ${route?.label ?? routeLabel(path)}`,
    route?.description ? `Registry description: ${route.description}` : null,
    route?.workspace ? `Workspace: ${route.workspace}` : null,
    route?.keywords?.length ? `Search keywords for this page: ${route.keywords.join(', ')}` : null,
    route?.roles?.length ? `Roles that can reach it: ${route.roles.join(', ')}` : null,
    trail ? `Breadcrumb trail: ${trail}` : null,
  ].filter(Boolean).join('\n');

  try {
    const { text } = await callAi({
      role: 'drafting',
      surface: 'help-generate',
      system: PROMPT,
      messages: [{ role: 'user', content: grounding }],
      maxTokens: 700,
      userEmail: session.user.email,
      retries: 1,
    });

    // The model was told JSON only; a fence still shows up occasionally, and a parse failure here
    // would return a 502 for a help drawer.
    const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned) as { title?: string; blurb?: string; tips?: unknown };
    const entry: HelpEntry = {
      title: String(parsed.title ?? route?.label ?? routeLabel(path)),
      blurb: String(parsed.blurb ?? ''),
      tips: Array.isArray(parsed.tips) ? parsed.tips.slice(0, 4).map(String) : [],
    };
    if (!entry.blurb) throw new Error('Model returned no blurb.');

    // Cached for everyone after. Failure to cache is not failure to help — the entry is returned
    // either way and the next reader simply regenerates.
    void supabaseAdmin.from('help_generated').upsert(
      { path, title: entry.title, blurb: entry.blurb, tips: entry.tips, model_role: 'drafting' },
      { onConflict: 'path' },
    );

    return NextResponse.json({ entry, source: 'generated' });
  } catch {
    // Silent to the user, deliberately: a failed help generation should leave the drawer saying
    // "no help yet", which is true, rather than showing an error about an AI they did not invoke.
    return NextResponse.json({ entry: null, source: 'unavailable', reason: 'generation_failed' });
  }
});
