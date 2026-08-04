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

import EnableNotifications from '@/app/admin/components/EnableNotifications';

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

      {/* ── ADD TO HOME SCREEN, first, because it is the one that works TODAY ──────────────────
          Owner, 2026-08-04: *"It is saying I need to set NEXT_PUBLIC_MOBILE_TESTFLIGHT_URL and
          NEXT_PUBLIC_MOBILE_ANDROID_APK_URL before I can download the app."*

          They did — because this page offered only NATIVE distribution: a TestFlight build and a
          signed APK, each needing a developer account, a signing key and a release pipeline. None
          of that exists yet, so the page's answer to "how do I get the app on my phone" was two
          configuration errors.

          Meanwhile the PWA has been built and shipped since W2: manifest, scoped service worker,
          offline page, push. **Adding it to the home screen needs no account, no build and no URL**
          — it installs from the browser you are already reading this in, and it is what the owner
          actually asked for ("an app icon on my phone").

          So it leads. The native cards stay below, honestly labelled as not set up rather than as
          the way in. */}
      <section className="admin-install__card admin-install__card--detected">
        <div className="admin-install__card-head">
          <span className="admin-install__card-icon"><Smartphone size={22} /></span>
          <div>
            <h2 className="admin-install__card-title">Add to your home screen</h2>
            <p className="admin-install__card-sub">
              Works right now — no download, no account, no store
            </p>
          </div>
          <span className="admin-install__badge">Recommended</span>
        </div>

        {platform === 'ios' ? (
          <ol className="admin-install__steps">
            <li>You must be in <strong>Safari</strong> — Chrome on iPhone cannot install apps.</li>
            <li>Tap the <strong>Share</strong> button (the square with an arrow, at the bottom).</li>
            <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
            <li>Tap <strong>Add</strong>. The app icon appears with your other apps.</li>
            <li>Open it from that icon — it runs full screen, with no browser bars.</li>
          </ol>
        ) : platform === 'android' ? (
          <ol className="admin-install__steps">
            <li>You must be in <strong>Chrome</strong>.</li>
            <li>Tap the <strong>⋮</strong> menu, top right.</li>
            <li>
              Tap <strong>Install app</strong> — or <strong>Add to Home screen</strong> on older
              versions.
            </li>
            <li>Confirm. The app icon appears in your app drawer.</li>
          </ol>
        ) : (
          <ol className="admin-install__steps">
            <li>Open this page on your phone, signed in as yourself.</li>
            <li><strong>iPhone:</strong> in Safari, tap Share → Add to Home Screen.</li>
            <li><strong>Android:</strong> in Chrome, tap ⋮ → Install app.</li>
            <li>These steps also appear automatically when you open this page on the phone itself.</li>
          </ol>
        )}

        <p className="admin-install__card-sub" style={{ marginTop: '0.75rem' }}>
          You stay signed in, and it opens straight to your Hub. On iPhone, notifications only work
          from the home-screen icon — not from Safari — which is the usual reason they seem missing.
        </p>
      </section>

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

      <PwaCard platform={platform} />
      {/* W4b — directly under the install steps on purpose. On iOS the install is a PRECONDITION for
          notifications, so the two belong on one screen; a notifications toggle anywhere else would
          be reached by people who cannot yet act on it. */}
      <EnableNotifications />
    </div>
  );
}

/** Install straight from the browser — no store, no account, no review.
 *
 *  This page's original model was TestFlight for iPhone and a direct APK for Android, which needs an
 *  Apple Developer account ($99/yr) and a Play account ($25). The PWA route needs neither, and this
 *  app already has the parts: a manifest at `/manifest.json` and, since PWA plan W2, a service worker
 *  scoped to `/admin/`.
 *
 *  iOS IS THE REASON THIS CARD EXISTS. Android shows its own install prompt; iOS shows nothing at
 *  all, and push notifications there work ONLY from a home-screen install. So on iOS the steps have
 *  to be spelled out or the capability is built and unreachable — which is this codebase's most
 *  frequent defect, and it would be a poor place to repeat it.
 *
 *  Not shown once installed: a standalone display-mode means they already did this. */
function PwaCard({ platform }: { platform: 'ios' | 'android' | 'other' }) {
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    setStandalone(
      window.matchMedia?.('(display-mode: standalone)').matches === true
      // iOS Safari predates the media query and reports it here instead.
      || nav.standalone === true,
    );
  }, []);

  if (standalone) {
    return (
      <section className="admin-install__card">
        <h2>You are running the installed app</h2>
        <p className="admin-install__muted">
          This app is on your home screen, and notifications can reach you here.
        </p>
      </section>
    );
  }

  return (
    <section className="admin-install__card">
      <h2>Install from this browser — no app store</h2>
      <p className="admin-install__muted">
        Adds this app to your home screen with its own icon, opens without browser chrome, and
        can send you notifications. Nothing to download and no account needed.
      </p>

      {platform === 'ios' ? (
        <ol className="admin-install__steps">
          <li>Tap the <strong>Share</strong> button at the bottom of Safari (the square with an arrow).</li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
          <li>Tap <strong>Add</strong>. Open it from the new icon, not from Safari.</li>
        </ol>
      ) : platform === 'android' ? (
        <ol className="admin-install__steps">
          <li>Tap the <strong>⋮</strong> menu in Chrome.</li>
          <li>Tap <strong>Install app</strong> (Chrome may offer this to you automatically).</li>
        </ol>
      ) : (
        <ol className="admin-install__steps">
          <li>Open this page on your phone.</li>
          <li>iPhone: Share → Add to Home Screen. Android: ⋮ → Install app.</li>
        </ol>
      )}

      {platform === 'ios' && (
        <div className="admin-install__note">
          <CheckCircle2 size={18} />
          <p>
            {/* Stated because it is the one iOS rule that silently defeats notifications, and a crew
                member who skips the install will simply never receive one. */}
            <strong>On iPhone this step is required for notifications.</strong> Alerts cannot reach
            you in an ordinary Safari tab — only from the home-screen icon.
          </p>
        </div>
      )}
    </section>
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
      <p className="admin-install__soon-title">Not set up — and you don’t need it</p>
      {/* Reworded 2026-08-04. This said "your administrator is finalizing this build", which is a
          statement about work in progress that nobody has started — and it sat above an env-var
          instruction, so the page's answer to "how do I install the app" read as a configuration
          error the reader had to solve. Add to Home Screen, above, installs the app today. */}
      <p className="admin-install__muted">
        This is the separate <strong>native</strong> app-store build, which needs a paid developer
        account and a signed release. It does not exist yet, and nothing above depends on it —{' '}
        <strong>Add to home screen</strong> gives you the app icon and full-screen app right now.
      </p>
      {isOperator && (
        <p className="admin-install__operator">
          <strong>Operator:</strong> only if you later publish a native build — set{' '}
          <code>{envVar}</code> to {hint}, then redeploy. Not required for the home-screen install.
        </p>
      )}
    </div>
  );
}
