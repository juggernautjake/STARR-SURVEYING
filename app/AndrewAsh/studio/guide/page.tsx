// app/AndrewAsh/studio/guide/page.tsx — "Start here".
//
// A thin server component: read the signed-in user's saved checklist progress, hand the playbook to
// the client, and get out of the way. All rendering lives in `GuideBody` — see the note at the top of
// that file for why the server/client boundary was collapsed rather than kept.
//
// ── THE STUDIO IS NOT EDITABLE, AND THAT IS DELIBERATE ──────────────────────────────────────────
//
// Every page under /AndrewAsh/studio is ordinary JSX with no widget system behind it. The back office
// is a TOOL for running the business and for editing the public site; it is not itself content. Only
// the public pages are widget-composed (see lib/voice/default-pages.ts), because those are the ones
// Andrew needs to make look the way he wants.

import type { Metadata } from 'next';

import '../_ui/guide.css';
import GuideBody from './GuideBody';
import { PLAYBOOK, totalMinutes } from '@/lib/voice/playbook';
import { getVoiceSession } from '@/lib/voice/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const metadata: Metadata = { title: 'Start here' };
export const dynamic = 'force-dynamic';

export default async function GuidePage(): Promise<React.ReactElement> {
  const session = getVoiceSession();

  // Which boxes this person has already ticked. Falls back to empty on any failure — a checklist that
  // forgets is better than a page that will not open, and this page is mostly reference material.
  let progress: Record<string, boolean> = {};
  if (session) {
    try {
      const { data } = await supabaseAdmin
        .from('va_users')
        .select('checklist_progress')
        .eq('id', session.userId)
        .maybeSingle();
      if (data?.checklist_progress && typeof data.checklist_progress === 'object') {
        progress = data.checklist_progress as Record<string, boolean>;
      }
    } catch {
      progress = {};
    }
  }

  return <GuideBody playbook={PLAYBOOK} minutes={totalMinutes()} initialProgress={progress} />;
}
