'use client';

// app/admin/components/PageOffGate.tsx — what a switched-off page shows.
//
// T4 of §11.4 in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// Owner: *"if we decide to use that page/feature in the future, then we can turn it back on **and
// make sure it is hooked up correctly**."*
//
// That last clause settles the hardest question in this feature. An admin has to be able to REACH a
// disabled page to check it works before switching it back on for everybody. So:
//
//   ordinary user, direct URL   a plain "this is turned off" page
//   ADMIN, direct URL           THE PAGE, WORKING, behind a banner saying it is off for everyone else
//
// ── AND WHY IT IS NOT A 404 ─────────────────────────────────────────────────────────────────────
//
// A 404 says the thing does not exist. It does exist — somebody switched it off, and the person who
// followed a link here needs to know which of those two it is, because one is a bug worth reporting
// and the other is a decision the company made.
//
// ── THE THING THIS IS NOT ───────────────────────────────────────────────────────────────────────
//
// §11.5: **a toggle is not a permission.** This component renders on top of a page that has already
// answered the real question — the middleware role gate ran, the APIs behind it keep every check
// they have, and nothing here refuses a request. Somebody who may not see payroll still may not see
// it; somebody who may, and types the URL, gets the page with a notice on it. Turning a page off
// hides it; it has never locked it, and the settings screen says so out loud for the same reason.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { EyeOff, Settings as SettingsIcon } from 'lucide-react';
import { findRoute } from '@/lib/admin/route-registry';
import { isEnabled } from '@/lib/admin/feature-toggles';
import { useFeatureToggles } from '@/lib/admin/use-feature-toggles';
import './PageOffGate.css';

export default function PageOffGate({
  isAdminUser,
  children,
}: {
  isAdminUser: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const toggles = useFeatureToggles();

  // ── THE ROUTE, NOT THE URL ───────────────────────────────────────────────────────────────────
  //
  // `findRoute` resolves `/admin/jobs/abc123` to the `/admin/jobs` entry, so switching off Jobs also
  // covers every job's detail page. Matching on the raw pathname would leave the children reachable
  // while the parent was off, which is the sort of gap somebody finds by accident and then does not
  // trust the switch again.
  const route = findRoute(pathname);
  if (!route || isEnabled(toggles, route.href)) return <>{children}</>;

  if (isAdminUser) {
    return (
      <>
        {/* The page renders BELOW this, untouched and working. That is the whole point: "make sure
          * it is hooked up correctly" is impossible if the only thing an admin can see of a disabled
          * page is a notice about it. */}
        <div className="page-off__banner" role="status">
          <EyeOff size={16} aria-hidden />
          <span>
            <strong>{route.label} is switched off.</strong> Nobody else can find it in the menus.
            You are seeing it because you are an admin.
          </span>
          <Link className="page-off__action" href="/admin/settings">
            <SettingsIcon size={13} aria-hidden /> Turn it back on
          </Link>
        </div>
        {children}
      </>
    );
  }

  return (
    <div className="page-off">
      <EyeOff size={32} aria-hidden />
      <h1>{route.label} is turned off</h1>
      <p>
        This company is not using this page at the moment. It has not been deleted — an admin can
        switch it back on in Settings, and everything on it will be exactly as it was.
      </p>
      {/* No "request access" button and no email link. This is not a permission problem and offering
        * a permission remedy would teach the wrong thing about what happened. */}
      <Link className="page-off__home" href="/admin/me">Back to your hub</Link>
    </div>
  );
}
