// app/ux-harness/ResearchPanelHarnessMount.tsx — the research panels, mountable without a project.
//
// Three UI surfaces shipped this session and none has ever been driven in a browser. I named that
// gap twice without attempting it, and the reason given — "the pages are auth-gated and need a
// project with data" — was true of the PAGES and not of the panels. The harness already mounts
// components with a mock session; what was missing was somewhere to mount ones that take props.
//
// That is the same shape as every other blocker in this session: the decision was not the obstacle,
// the absence of a form for it was.
//
// These mounts supply representative props and nothing else. They do not fake API responses — a
// panel that fetches will show its loading or error state here, which is itself worth seeing, and
// faking the response would be testing the fake.
'use client';

import { useState } from 'react';
import RotationPanel from '@/app/admin/research/components/RotationPanel';
import VendorAccountsPanel from '@/app/admin/research/components/VendorAccountsPanel';

/** The rotation panel, open, with a square's worth of record calls behind it. */
export function RotationPanelHarness() {
  const [open, setOpen] = useState(true);
  return (
    <div className="min-h-screen bg-gray-950">
      <button onClick={() => setOpen(true)} className="m-4 p-2">
        Reopen
      </button>
      <RotationPanel
        projectId="harness"
        calls={[
          { bearing: 'N 0°00\'00" E', distance: 1000 },
          { bearing: 'N 90°00\'00" E', distance: 1000 },
          { bearing: 'S 0°00\'00" E', distance: 1000 },
          { bearing: 'S 90°00\'00" W', distance: 980 },
        ]}
        isOpen={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

/** The vendor-accounts form. Takes no props; it will show whatever the route returns. */
export function VendorAccountsPanelHarness() {
  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <VendorAccountsPanel />
    </div>
  );
}
