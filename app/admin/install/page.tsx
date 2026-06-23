'use client';
// app/admin/install/page.tsx
//
// Employee-only "Get the Starr Field app" surface. Reachable from the
// admin sidebar (Account section) once a user is signed in, so the
// install links live behind the same auth gate as the rest of the
// portal — the app is not on the public App Store / Play Store.
//
// Distribution model:
//   * iPhone  → TestFlight (Apple's sanctioned private-beta channel).
//               A normal iPhone cannot install an .ipa from a raw web
//               link, so the button hands off to the TestFlight invite.
//   * Android → direct download of the signed .apk hosted by us. The
//               EAS `preview` profile already builds this artifact.
//
// The two links are operator-configured via NEXT_PUBLIC env vars (see
// .env.example). When a link is unset the card degrades to a "coming
// soon" state instead of a broken button — admins/developers also see
// an inline hint naming the env var to set.

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  Apple,
  Smartphone,
  Download,
  RefreshCw,
  ShieldCheck,
  Info,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';

import './install.css';

const TESTFLIGHT_URL = process.env.NEXT_PUBLIC_MOBILE_TESTFLIGHT_URL || '';
const APK_URL = process.env.NEXT_PUBLIC_MOBILE_ANDROID_APK_URL || '';
const APP_VERSION = process.env.NEXT_PUBLIC_MOBILE_APP_VERSION || '';

type Platform = 'ios' | 'android' | 'other';

function qrSrc(data: string): string {
  return `/api/admin/install/qr?size=320&data=${encodeURIComponent(data)}`;
}

export default function InstallPage() {
  const { data: session, status } = useSession();
  const [platform, setPlatform] = useState<Platform>('other');

  useEffect(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    const isIpadOS =
      typeof navigator !== 'undefined' &&
      navigator.platform === 'MacIntel' &&
      (navigator.maxTouchPoints || 0) > 1;
    if (/iPhone|iPad|iPod/i.test(ua) || isIpadOS) setPlatform('ios');
    else if (/Android/i.test(ua)) setPlatform('android');
    else setPlatform('other');
  }, []);

  if (status === 'loading') {
    return (
      <div className="admin-install">
        <p className="admin-install__muted">Loading…</p>
      </div>
    );
  }
  if (status === 'unauthenticated' || !session?.user?.email) {
    return (
      <div className="admin-install">
        <p className="admin-install__muted">
          You need to be signed in to your Starr Surveying account to install
          the field app.
        </p>
      </div>
    );
  }

  const roles = (session.user as { roles?: string[] }).roles || [];
  const isOperator = roles.includes('admin') || roles.includes('developer');

  const iosFirst = platform !== 'android'; // iOS or desktop → iOS card first

  const iosCard = (
    <section
      className={`admin-install__card${
        platform === 'ios' ? ' admin-install__card--detected' : ''
      }`}
    >
      <div className="admin-install__card-head">
        <span className="admin-install__card-icon">
          <Apple size={22} />
        </span>
        <div>
          <h2 className="admin-install__card-title">iPhone &amp; iPad</h2>
          <p className="admin-install__card-sub">via TestFlight</p>
        </div>
        {platform === 'ios' && (
          <span className="admin-install__badge">Your device</span>
        )}
      </div>

      {TESTFLIGHT_URL ? (
        <>
          <ol className="admin-install__steps">
            <li>
              Install the free{' '}
              <a
                href="https://apps.apple.com/app/testflight/id899247664"
                target="_blank"
                rel="noopener noreferrer"
              >
                TestFlight
              </a>{' '}
              app from the App Store.
            </li>
            <li>Tap the button below to accept the Starr Field invite.</li>
            <li>Tap <strong>Install</strong> inside TestFlight — done.</li>
          </ol>
          <a
            className="admin-btn admin-btn--primary admin-install__cta"
            href={TESTFLIGHT_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={16} /> Open TestFlight invite
          </a>
          <div className="admin-install__qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSrc(TESTFLIGHT_URL)}
              alt="QR code for the TestFlight invite"
              width={150}
              height={150}
            />
            <span>On a computer? Scan with your iPhone camera.</span>
          </div>
        </>
      ) : (
        <ComingSoon
          isOperator={isOperator}
          envVar="NEXT_PUBLIC_MOBILE_TESTFLIGHT_URL"
          hint="the public TestFlight invite link from App Store Connect → TestFlight"
        />
      )}
    </section>
  );

  const androidCard = (
    <section
      className={`admin-install__card${
        platform === 'android' ? ' admin-install__card--detected' : ''
      }`}
    >
      <div className="admin-install__card-head">
        <span className="admin-install__card-icon">
          <Smartphone size={22} />
        </span>
        <div>
          <h2 className="admin-install__card-title">Android</h2>
          <p className="admin-install__card-sub">direct download</p>
        </div>
        {platform === 'android' && (
          <span className="admin-install__badge">Your device</span>
        )}
      </div>

      {APK_URL ? (
        <>
          <ol className="admin-install__steps">
            <li>Tap <strong>Download Starr Field</strong> below.</li>
            <li>
              If Android warns about installing from this source, tap{' '}
              <strong>Settings</strong> → allow, then go back.
            </li>
            <li>Open the downloaded file and tap <strong>Install</strong>.</li>
          </ol>
          <a
            className="admin-btn admin-btn--primary admin-install__cta"
            href={APK_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download size={16} /> Download Starr Field (.apk)
          </a>
          <div className="admin-install__qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSrc(APK_URL)}
              alt="QR code to download the Android app"
              width={150}
              height={150}
            />
            <span>On a computer? Scan with your Android camera.</span>
          </div>
        </>
      ) : (
        <ComingSoon
          isOperator={isOperator}
          envVar="NEXT_PUBLIC_MOBILE_ANDROID_APK_URL"
          hint="a public URL to the signed .apk built by `eas build --profile preview --platform android`"
        />
      )}
    </section>
  );

  return (
    <div className="admin-install">
      <header className="admin-install__header">
        <h1 className="admin-install__title">Get the Starr Field app</h1>
        <p className="admin-install__subtitle">
          Starr Field is our private app for field crews — job details,
          time tracking, receipt &amp; photo capture, and more. It isn&apos;t on
          the public app stores; install it here with your employee account.
          {APP_VERSION && (
            <span className="admin-install__version"> Current version {APP_VERSION}.</span>
          )}
        </p>
      </header>

      <div className="admin-install__cards">
        {iosFirst ? (
          <>
            {iosCard}
            {androidCard}
          </>
        ) : (
          <>
            {androidCard}
            {iosCard}
          </>
        )}
      </div>

      <section className="admin-install__notes">
        <div className="admin-install__note">
          <ShieldCheck size={18} />
          <p>
            <strong>Sign in with your work account.</strong> Use the same email
            and password you use here. Only Starr Surveying employees can use
            the app.
          </p>
        </div>
        <div className="admin-install__note">
          <RefreshCw size={18} />
          <p>
            <strong>Updates.</strong> Small fixes arrive automatically the next
            time you open the app. Bigger updates may ask you to re-install from
            this page — TestFlight builds also refresh roughly every 90 days.
          </p>
        </div>
        <div className="admin-install__note">
          <Info size={18} />
          <p>
            <strong>Trouble installing?</strong> Make sure you&apos;re on
            Wi-Fi or good signal, then retry. If it still won&apos;t install,
            message an admin and include a screenshot of the error.
          </p>
        </div>
        <div className="admin-install__note">
          <CheckCircle2 size={18} />
          <p>
            <strong>After installing,</strong> open Starr Field, sign in, and
            confirm your jobs load. You can clock in and capture photos right
            away.
          </p>
        </div>
      </section>
    </div>
  );
}

function ComingSoon({
  isOperator,
  envVar,
  hint,
}: {
  isOperator: boolean;
  envVar: string;
  hint: string;
}) {
  return (
    <div className="admin-install__soon">
      <p className="admin-install__soon-title">Not available yet</p>
      <p className="admin-install__muted">
        Your administrator is finalizing this build. Check back soon.
      </p>
      {isOperator && (
        <p className="admin-install__operator">
          <strong>Operator:</strong> set <code>{envVar}</code> to {hint}, then
          redeploy to enable this button.
        </p>
      )}
    </div>
  );
}
