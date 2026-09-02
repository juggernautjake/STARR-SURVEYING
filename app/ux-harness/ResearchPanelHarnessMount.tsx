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

// ── D1: the progress bar, at the states a real run passes through ───────────────────────────────
//
// "The bar's new pacing needs browser QA against a real run. A green suite has missed rendering bugs
// in this repo repeatedly."
//
// A real run needs a live worker and a live county portal, and takes thirty minutes to reach four of
// these states. What D1 is actually about is the RENDERING — the fill, the tone, the percentage, the
// budget line, the outcome wording — and that is a pure function of `RunState`.
//
// So this mounts the real `StatusCard` with the real stylesheet over hand-built states. Nothing is
// faked at the network layer, because there is nothing to fake: `StatusCard` takes `RunState` as a
// prop and has no fetch of its own. That is the difference between this and stubbing `window.fetch`,
// which this file's header warns against — there is no fake here to be testing.
//
// The outcomes come from the REAL `resolveOutcome()`, not from hand-written objects. A harness that
// invented its own outcome text would show a screen the product cannot produce, and the three states
// worth checking hardest — budget stop, cancellation, interruption — are precisely the ones whose
// wording that function exists to get right.

import { StatusCard, RunNotices, RunCounters, RunViewStyles } from '@/app/admin/research/components/ResearchRunView';
import { resolveOutcome, type RunState, type RunLifecycle } from '@/lib/research/run-state';

/** The extra signals a real run carries that are inputs to the outcome rather than fields on it. */
type OutcomeSignals = { stopReason?: string; budgetSummary?: string; failureReason?: string };

function runState(over: Partial<RunState> & { lifecycle?: RunLifecycle } & OutcomeSignals = {}): RunState {
  const lifecycle: RunLifecycle = over.lifecycle ?? 'active';
  const percent = over.percent ?? 0;
  return {
    lifecycle,
    outcome: resolveOutcome({
      lifecycle,
      percent,
      ...(over as { stopReason?: string; budgetSummary?: string; failureReason?: string }),
    }),
    runId: 'run-1',
    runNumber: 2,
    percent,
    phaseLabel: 'Retrieving documents',
    // Deliberately not a real county: audit-starr-assumptions counts Bell County as a
    // single-county assumption, and a harness has no reason to make one.
    activity: 'County Clerk — searching by owner name',
    elapsedMs: 0,
    budgetMs: 30 * 60_000,
    spendUsd: 0,
    spendUnrecorded: false,
    spendIncomplete: false,
    paidDocumentsNotice: null,
    skipped: [],
    looksStalled: false,
    canCancel: lifecycle === 'active',
    settings: { maxResearchTimeMinutes: 30 },
    ...over,
  } as RunState;
}

/**
 * The bar at the points that matter.
 *
 * The early ones are the reason this exists. The owner's complaint was that it "jumps up to 92% out
 * of the gate and then loads slowly", so 3% / 11% / 24% at the top is the specific claim under test,
 * and a screenshot answers it without waiting half an hour for a run to reach them.
 */
export function RunProgressHarness() {
  const cases: Array<{ title: string; state: RunState }> = [
    { title: '3% — just started', state: runState({ percent: 3, elapsedMs: 40_000, phaseLabel: 'Locating the property' }) },
    { title: '11% — early', state: runState({ percent: 11, elapsedMs: 3 * 60_000 }) },
    { title: '24% — a quarter in', state: runState({ percent: 24, elapsedMs: 7 * 60_000 }) },
    { title: '61% — mid run', state: runState({ percent: 61, elapsedMs: 18 * 60_000, spendUsd: 1.4 }) },
    { title: '92% — nearly done', state: runState({ percent: 92, elapsedMs: 27 * 60_000, spendUsd: 2.1 }) },

    {
      title: 'succeeded',
      state: runState({ lifecycle: 'succeeded', percent: 100, elapsedMs: 29 * 60_000, spendUsd: 2.2 }),
    },
    {
      title: 'stopped at the budget — must NOT read as a failure',
      state: runState({
        lifecycle: 'succeeded', percent: 100, elapsedMs: 30 * 60_000,
        // The real signal a budget stop carries. Without it this case renders as an ordinary
        // completion, which is what it did on the first pass through this harness.
        stopReason: 'budget_reached',
        budgetSummary: 'The run reached its 30-minute ceiling and kept everything it had found.',
        skipped: [{ what: 'Deed chain, generations 3–5', reason: 'the run reached its time ceiling first' }],
      }),
    },
    {
      title: 'cancelled — must NOT read as a failure',
      state: runState({ lifecycle: 'cancelled', percent: 46, elapsedMs: 12 * 60_000 }),
    },
    {
      title: 'interrupted (a deploy) — must NOT read as a failure',
      state: runState({ lifecycle: 'interrupted', percent: 55, elapsedMs: 16 * 60_000 }),
    },
    {
      title: 'failed — the ONLY red one',
      state: runState({ lifecycle: 'failed', percent: 13, elapsedMs: 4 * 60_000 }),
    },

    { title: 'stalled', state: runState({ percent: 38, elapsedMs: 22 * 60_000, looksStalled: true }) },
    {
      title: 'spend unrecorded and incomplete',
      state: runState({ percent: 55, elapsedMs: 15 * 60_000, spendUnrecorded: true, spendIncomplete: true }),
    },
    {
      title: 'paid documents refused',
      state: runState({
        percent: 70, elapsedMs: 20 * 60_000,
        paidDocumentsNotice: '3 documents behind a paywall were not retrieved. Paid documents are switched OFF for this run.',
      }),
    },
    { title: 'no budget known — no ceiling shown', state: runState({ percent: 30, elapsedMs: 9 * 60_000, budgetMs: null }) },
  ];

  return (
    <div className="rrv" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <RunViewStyles />
      {cases.map((c) => (
        <section key={c.title} data-harness-case={c.title}>
          <h3 style={{ font: '600 0.8rem system-ui', margin: '0 0 0.4rem', color: 'var(--theme-fg-primary)' }}>{c.title}</h3>
          <StatusCard state={c.state} cancelling={false} onCancelRequest={() => {}} />
          <RunNotices state={c.state} />
          <RunCounters state={c.state} documentCount={14} pageCount={92} />
        </section>
      ))}
    </div>
  );
}

// ── F1: does the address autocomplete actually work? ────────────────────────────────────────────
//
// The component degrades to a plain text box on every failure — absent key, refused key, no
// suggestions — and that is correct behaviour which also means a BROKEN key and a working one look
// nearly identical to a casual glance. The notice line is the only difference, and it is easy to
// miss on a form you are not looking at closely.
//
// So this mounts it alone, with what it reports about itself. Typing here answers the question the
// server cannot: the key is referer-restricted, so a `curl` against the Places REST API returns
// REQUEST_DENIED whatever the state of the browser path — that is the correct answer for a browser
// key and says nothing at all about whether the browser works.

import AddressAutocomplete from '@/app/admin/components/AddressAutocomplete';

export function AddressAutocompleteHarness() {
  const [value, setValue] = useState('');
  const [picked, setPicked] = useState<Record<string, string> | null>(null);

  return (
    <div style={{ padding: '1.5rem', maxWidth: 640, font: '14px system-ui' }}>
      <p style={{ marginTop: 0 }}>
        Type a Texas address. If suggestions appear, the browser key works from this origin. If a
        notice appears instead, it says which failure it was.
      </p>
      <AddressAutocomplete
        value={value}
        onChange={setValue}
        onSelect={(d) => setPicked(d as unknown as Record<string, string>)}
        biasTexas
      />
      <pre data-testid="picked" style={{ marginTop: '1rem', padding: '0.6rem', background: 'var(--theme-bg-subtle)', fontSize: 12 }}>
        {picked ? JSON.stringify(picked, null, 2) : 'nothing selected yet'}
      </pre>
    </div>
  );
}
