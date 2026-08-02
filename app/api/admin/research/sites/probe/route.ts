// app/api/admin/research/sites/probe/route.ts — read an unknown portal, propose nothing more (§8.3).
//
//   POST { url } → { proposal, config, field_map, evidence } | { available: false, reason }
//
// The registration screen's known-vendor path needs no browser: detection is a regex against seeded
// fingerprints. This is the other half — the county whose portal matches nothing we have a template
// for — and it is a separate route, separately gated, because it is a separate KIND of act. One is
// string matching; this one makes a request to a government server.
//
// ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────────────────────────
//
// It does not save. It does not submit the search form. It does not run on a schedule. A proposal
// comes back, a person reads the evidence and the warnings, and if they accept it the ordinary
// POST /api/admin/research/sites saves a `draft` adapter like every other registration — §8.4's
// confirm step, done by the person rather than asserted by the machine.
//
// It also does not fail loudly when there is no browser. A deploy without Chromium is a normal
// state of this app, and a 500 on the registration screen would send somebody looking for a bug in
// the county's website.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin, isDeveloper } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { supabaseAdmin } from '@/lib/supabase';
import { captureSite } from '@/lib/research/site-probe-runner';
import { configFromProposal, fieldMapFromProposal, proposeFromCapture } from '@/lib/research/site-probe';

export const maxDuration = 60;

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const roles = session.user.roles ?? [];
  if (!isAdmin(roles) && !isDeveloper(roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { url?: string };
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url) return NextResponse.json({ error: 'A portal URL is required.' }, { status: 400 });

  // §9.9: off unless somebody turned it on. Read at call time, not at module load, so switching it
  // off takes effect on the next request rather than on the next deploy.
  const { data: settings, error: settingsError } = await supabaseAdmin
    .from('research_self_heal_settings')
    .select('site_probe_enabled')
    .eq('id', 'singleton')
    .maybeSingle();

  if (settingsError) {
    // A settings read that failed is NOT permission to proceed. The safe direction for a switch
    // that governs touching somebody else's server is closed.
    return NextResponse.json(
      { available: false, reason: 'The probe’s settings could not be read, so it did not run.' },
      { status: 503 },
    );
  }
  if (!settings?.site_probe_enabled) {
    return NextResponse.json({
      available: false,
      reason:
        'The site probe is switched off. It opens the county’s website in a browser, so it is turned on deliberately — from Site Health.',
      settingsHref: '/admin/research/self-heal',
    });
  }

  const run = await captureSite(url);
  if (!run.available || !run.capture) {
    return NextResponse.json({ available: false, reason: run.reason ?? 'The portal could not be read.', elapsedMs: run.elapsedMs });
  }

  const proposal = proposeFromCapture(run.capture);

  return NextResponse.json(
    {
      available: true,
      elapsedMs: run.elapsedMs,
      proposal,
      // Returned alongside so the confirm step saves exactly the object that was shown, rather than
      // the client re-deriving a config from a proposal it rendered.
      config: configFromProposal(proposal, url),
      field_map: fieldMapFromProposal(proposal),
      page: { title: run.capture.title, forms: run.capture.forms.length, tables: run.capture.tables.length },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
