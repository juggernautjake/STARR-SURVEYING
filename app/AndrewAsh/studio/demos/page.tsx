// app/AndrewAsh/studio/demos/page.tsx — the demo reels.
//
// These are the most important four files on the whole platform. Every page on the public site exists
// to get somebody to press play on one of them, and until they exist the players say "coming soon" —
// honest, and not something that gets anyone hired.
//
// So the page leads with WHICH REELS ARE MISSING rather than with what has been uploaded. An empty
// state that lists the four categories with a record button beside each is a to-do list; a grid
// saying "no demos yet" is a shrug.

import type { Metadata } from 'next';
import Link from 'next/link';

import DemoManager from './DemoManager';
import { supabaseAdmin } from '@/lib/supabase';
import { PLACEHOLDER_DEMOS, BASE_PATH } from '@/lib/voice/content';

export const metadata: Metadata = { title: 'Demo reels' };
export const dynamic = 'force-dynamic';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function DemosPage(): Promise<React.ReactElement> {
  let demos: any[] = [];
  let audio: any[] = [];
  try {
    const [d, m] = await Promise.all([
      supabaseAdmin.from('va_demos').select('*, media:va_media(url)').order('sort_order').limit(50),
      supabaseAdmin.from('va_media').select('id, title, url').eq('kind', 'audio').order('created_at', { ascending: false }),
    ]);
    demos = d.data ?? [];
    audio = m.data ?? [];
  } catch {
    demos = [];
    audio = [];
  }

  const covered = new Set(demos.map((d) => d.category));
  const missing = PLACEHOLDER_DEMOS.filter((p) => !covered.has(p.category));
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <>
      <div className="vaStudioHead">
        <div>
          <h1 className="vaStudioTitle">Demo reels</h1>
          <p className="vaStudioSub">
            The four files the whole site is built around. Ninety seconds each, five or six segments,
            strongest read first with no processing on the voice — see{' '}
            <Link href={`${BASE_PATH}/studio/guide#first-ten-minutes`} style={{ color: 'var(--va-accent)' }}>
              the setup checklist
            </Link>
            .
          </p>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="vaNotice" role="status">
          <strong style={{ color: 'var(--va-accent)' }}>
            {missing.length} of {PLACEHOLDER_DEMOS.length} reels still to record
          </strong>
          <span style={{ display: 'block', marginTop: 6 }}>
            {missing.map((m) => m.title).join(', ')}. Until then those players show &ldquo;coming
            soon&rdquo; on the site — honest, but not what gets you hired.
          </span>
        </div>
      )}

      <DemoManager
        demos={demos.map((d) => ({
          id: d.id,
          title: d.title,
          category: d.category,
          description: d.description ?? '',
          audioUrl: d.audio_url || d.media?.url || '',
          traits: Array.isArray(d.traits) ? d.traits : [],
          featured: d.featured,
        }))}
        audioLibrary={audio.map((a) => ({ id: a.id, title: a.title, url: a.url }))}
        missing={missing.map((m) => ({ category: m.category, title: m.title, blurb: m.blurb }))}
      />
    </>
  );
}
