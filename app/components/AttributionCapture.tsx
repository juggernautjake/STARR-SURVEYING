'use client';
// AttributionCapture — records where a visitor came from, on the FIRST page they land on.
//
// G1-1 of docs/planning/in-progress/GOOGLE_INTEGRATION_2026-07-31.md.
//
// Mounted once in the root layout rather than on the forms, and that placement IS the feature. Almost
// nobody converts on the page they arrived at: they click an ad, land on `/services?gclid=…`, read, click
// through to `/contact`, and submit from a URL with no parameters at all. A capture that lives on the form
// sees that clean URL and records nothing — so the ad that bought the job gets no credit, and the campaign
// looks worthless in the one report that decides whether it keeps running.
//
// Renders nothing. All the rules (first-write-wins, the 90-day window, what counts as identifying) live in
// `lib/leads/attribution.ts` and are unit-tested there; this is only the trigger.
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { captureAttribution } from '@/lib/leads/attribution';

function Capture() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Runs on every client-side navigation as well as the first load, because a visitor can arrive on an
    // ad link, navigate within the app, and the App Router will not re-run a load-only effect. Capturing
    // again is free: `mergeAttribution` keeps the first click, so a second call cannot overwrite it.
    captureAttribution();
  }, [pathname, searchParams]);

  return null;
}

export default function AttributionCapture() {
  // `useSearchParams` opts the subtree into client-side rendering, so it is isolated here rather than
  // being allowed to deopt the whole layout.
  return <Capture />;
}
