// app/AndrewAsh/studio/settings/page.tsx — everything about the site that is not a page.
//
// Identity, contact details, theme, navigation, invoice defaults, and the studio accounts. Grouped by
// WHO is affected rather than by which table a field lives in: "what clients see" is one group,
// "what appears on paperwork" is another, "who can get in" is a third.

import type { Metadata } from 'next';

import SettingsForm from './SettingsForm';
import PaymentPanel from './PaymentPanel';
import TeamPanel from './TeamPanel';
import { cardPaymentEnabled, voiceStripePublishableKey, voiceStripeSecretKey } from '@/lib/voice/payments';
import { getSiteSettings } from '@/lib/voice/settings';
import { supabaseAdmin } from '@/lib/supabase';
import { getVoiceSession } from '@/lib/voice/auth';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage(): Promise<React.ReactElement> {
  const session = getVoiceSession();
  const settings = await getSiteSettings();

  /* eslint-disable @typescript-eslint/no-explicit-any */
  let users: any[] = [];
  try {
    const { data } = await supabaseAdmin
      .from('va_users')
      .select('id, email, username, display_name, role, last_login_at, created_at')
      .order('created_at', { ascending: true });
    users = data ?? [];
  } catch {
    users = [];
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Named on the studio page so "card payment is off" is answerable rather than mysterious. Computed
  // on the server: the secret key must never be sent to a browser, not even to test whether it exists.
  const cardMissing = [
    voiceStripeSecretKey() ? null : 'VOICE_STRIPE_SECRET_KEY',
    voiceStripePublishableKey() ? null : 'NEXT_PUBLIC_VOICE_STRIPE_PUBLISHABLE_KEY',
    process.env.VOICE_PAYMENTS_LIVE === 'true' ? null : 'VOICE_PAYMENTS_LIVE=true',
  ].filter((x): x is string => x !== null);

  return (
    <>
      <div className="vaStudioHead">
        <div>
          <h1 className="vaStudioTitle">Settings</h1>
          <p className="vaStudioSub">
            Your name, your contact details, the site&rsquo;s colours, and the defaults that end up on
            every invoice and agreement.
          </p>
        </div>
      </div>

      {settings.isDefault && (
        <div className="vaNotice" role="status">
          These are still the built-in defaults — nothing has been saved yet. Filling in your email and
          phone is the first thing worth doing: right now the site has no way for anyone to reach you
          except the form.
        </div>
      )}

      <SettingsForm settings={settings} />

      <PaymentPanel
        methods={settings.paymentMethods}
        note={settings.paymentNote}
        cardLive={cardPaymentEnabled()}
        cardMissing={cardMissing}
      />

      <TeamPanel
        users={users.map((u) => ({
          id: u.id,
          email: u.email,
          username: u.username ?? null,
          displayName: u.display_name,
          role: u.role,
          lastLoginAt: u.last_login_at,
        }))}
        currentUserId={session?.userId ?? ''}
      />
    </>
  );
}
