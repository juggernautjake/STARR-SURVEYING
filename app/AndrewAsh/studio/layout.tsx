// app/AndrewAsh/studio/layout.tsx — the gate and the frame for Andrew's back office.
//
// ── THE GATE IS HERE, ONCE ──────────────────────────────────────────────────────────────────────
//
// Every page under /AndrewAsh/studio is behind this check, and no page under it repeats the check.
// A layout is the only place in the App Router where "authorisation for this whole subtree" can be
// stated once and be true — put it on the pages instead and the guarantee becomes "every page the
// author remembered", which is a guarantee with a hole in it the first time somebody adds a route.
//
// The API routes guard themselves independently. A layout protects what a person can NAVIGATE to; it
// does nothing for what they can `fetch`. Both are needed and neither substitutes for the other.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import './_ui/studio.css';
import StudioNav from './_ui/StudioNav';
import { getVoiceSession, studioNeedsSetup } from '@/lib/voice/auth';
import { unreadCount } from '@/lib/voice/notifications';
import { BASE_PATH } from '@/lib/voice/content';

export const metadata: Metadata = {
  title: 'Studio',
  // The studio must never be indexed, whatever `VOICE_SITE_INDEXABLE` is set to on the public site.
  // A search result for "Andrew Ash invoices" would be a genuinely bad day.
  robots: { index: false, follow: false, nocache: true },
};

export default async function StudioLayout({ children }: { children: React.ReactNode }): Promise<React.ReactElement> {
  const session = getVoiceSession();

  if (!session) {
    // No account exists yet → send him to set one up rather than to a login he cannot pass.
    const needsSetup = await studioNeedsSetup();
    redirect(needsSetup ? `${BASE_PATH}/login?setup=1` : `${BASE_PATH}/login`);
  }

  const unread = await unreadCount(session.userId);

  return (
    <div className="vaStudio">
      <StudioNav displayName={session.displayName} unread={unread} />
      <div className="vaStudioMain">{children}</div>
    </div>
  );
}
