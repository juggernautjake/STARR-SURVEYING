// app/AndrewAsh/login/page.tsx — Andrew's door.
//
// Reached from a small link at the very bottom of the footer. It is a login for one person on a site
// written for clients, so it is quiet, and it never advertises whether an account exists.
//
// ── FIRST-RUN SETUP, AND WHY IT IS SAFE ─────────────────────────────────────────────────────────
//
// When `va_users` is empty this page offers to CREATE the first account instead of asking for one.
// That is an open door — but only until somebody walks through it once.
//
// The alternative is worse: seeding a bcrypt hash into a SQL file that lives in a git repository,
// which publishes Andrew's credentials to everyone with repository access, permanently, including
// after he changes his password. A door that closes after its first visitor beats a key taped to the
// frame. `VOICE_SIGNUP_KEY` closes the window entirely for a deploy that goes public before Andrew
// gets to it.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import LoginForm from './LoginForm';
import { getVoiceSession, studioNeedsSetup } from '@/lib/voice/auth';
import { BASE_PATH } from '@/lib/voice/content';

export const metadata: Metadata = {
  title: 'Studio login',
  robots: { index: false, follow: false, nocache: true },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { setup?: string; next?: string };
}): Promise<React.ReactElement> {
  // Already signed in: nothing to do here.
  if (getVoiceSession()) redirect(`${BASE_PATH}/studio`);

  const needsSetup = await studioNeedsSetup();
  const requiresKey = Boolean(process.env.VOICE_SIGNUP_KEY);

  return (
    <section className="vaSection">
      <div className="vaContainer vaContainerNarrow" style={{ maxWidth: 460 }}>
        <div className="vaOrnament" style={{ maxWidth: 160, margin: '0 auto 30px' }}>
          <span className="vaOrnamentMark" />
        </div>

        <h1 className="vaDisplay vaH2" style={{ textAlign: 'center', marginBottom: 10 }}>
          {needsSetup ? 'Set up your studio' : 'Studio'}
        </h1>
        <p className="vaMuted" style={{ textAlign: 'center', marginBottom: 34, fontSize: '0.9375rem' }}>
          {needsSetup
            ? 'No account exists yet. Create one — this is the only time this screen will offer it.'
            : 'Sign in to manage the site, inquiries, contracts and invoices.'}
        </p>

        <LoginForm
          mode={needsSetup || searchParams.setup === '1' ? 'setup' : 'login'}
          requiresKey={requiresKey}
          next={typeof searchParams.next === 'string' ? searchParams.next : `${BASE_PATH}/studio`}
        />
      </div>
    </section>
  );
}
