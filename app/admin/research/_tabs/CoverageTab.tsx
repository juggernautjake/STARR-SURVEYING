// app/admin/research/_tabs/CoverageTab.tsx — a tab of the Research portal.
//
// C11b / P13 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
// Was `/admin/research/coverage/page.tsx`; the old route stays and forwards.
//
// ── THIS ONE WAS A SERVER COMPONENT, WHICH IS THE C9 TRAP ────────────────────────────────────
//
// A portal is a client component. C9 imported an async server page into one and put
// `node:async_hooks` in the browser bundle: 26,194 tests stayed green, `tsc` stayed clean, and
// the page did not load at all. This page was server-rendered too, but for a different reason —
// its own header says "pure rendering of compile-time data; no client state, no network" — so it
// becomes a client component honestly rather than needing an endpoint. `clerk-registry.ts`
// imports nothing and is 382 lines of data, and both panels below were already `use client`.
//
// Its `metadata` export went with the page file. A module that is not a route cannot set a title,
// and leaving the export would have been a line that looks load-bearing and is not.
// app/admin/research/coverage/page.tsx — Phase 14 §407 statewide coverage-gap dashboard
//
// Read-only admin page that visualizes which Texas counties have which
// clerk-system adapter coverage. Sources from
// `worker/src/adapters/clerk-registry.ts` (the canonical 22-entry registry +
// TexasFile aggregator fallback for the remaining 232 counties).
//
// Server component — pure rendering of compile-time data; no client state, no
// network. The registry isn't large enough to warrant pagination.

'use client';

import AdapterHealthPanel from '../coverage/AdapterHealthPanel';
import MeasuredCoverage from '../coverage/MeasuredCoverage';
import '../coverage/MeasuredCoverage.css';
import '../coverage/AdapterHealth.css';
import {
  CLERK_REGISTRY,
  getAdapterCoverage,
  type ClerkRegistryEntry,
} from '@/worker/src/adapters/clerk-registry';

const SYSTEM_LABEL: Record<ClerkRegistryEntry['system'], string> = {
  kofile: 'Kofile / PublicSearch',
  henschen: 'Henschen & Associates',
  idocket: 'iDocket',
  fidlar: 'Fidlar Technologies',
  texasfile: 'TexasFile (aggregator)',
  harris_custom: 'Harris County custom',
  dallas_custom: 'Dallas County custom',
  tarrant_custom: 'TAD / Tarrant County',
  bexar_custom: 'Bexar County custom',
  fort_bend_custom: 'Fort Bend ccweb',
  manual: 'Manual / offline only',
};

const STATUS_BADGE: Record<ClerkRegistryEntry['status'], string> = {
  implemented:
    'bg-green-100 text-green-800 ring-1 ring-green-200',
  stub: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
  unavailable: 'bg-red-100 text-red-800 ring-1 ring-red-200',
};

export default function CoverageTab() {
  const coverage = getAdapterCoverage();

  // Sort entries: implemented first, then stub, then unavailable; alpha by
  // county within each tier so operators can scan to a target quickly.
  const STATUS_ORDER: Record<ClerkRegistryEntry['status'], number> = {
    implemented: 0,
    stub: 1,
    unavailable: 2,
  };
  const sortedEntries = [...CLERK_REGISTRY].sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (byStatus !== 0) return byStatus;
    return a.county.localeCompare(b.county);
  });

  return (
    <main className="research-page">
      <header style={{ marginBottom: '24px' }}>
        {/* C11b: a "← Research" link sat here. This IS Research now — it pointed at the portal it
          * renders inside, which lands you on the Projects tab and reads as a bug. Fourth slice
          * running that an absorbed body carried one; five of the seven did here. */}
        <h1 style={{ marginTop: 8 }}>Statewide Coverage</h1>
        <p style={{ color: 'var(--theme-fg-secondary, #475569)', fontSize: '14px' }}>
          Clerk-system routing for Texas&apos; 254 counties. The registry
          carries {CLERK_REGISTRY.length} explicit entries; the remaining{' '}
          {254 - CLERK_REGISTRY.length} fall back to the TexasFile aggregator at{' '}
          <code style={{ fontSize: '12px' }}>
            getClerkByFIPS(fips).fallback === true
          </code>{' '}
          so document-harvest still works while the per-county adapter is
          pending.
        </p>
      </header>

      {/* Roadmap §9.8 — the runtime counterpart to the compile-time map below. That registry says
          which counties we INTEND to cover; this says which registered portals are actually
          returning data. A county can be green on one and broken on the other, and only showing the
          first is how a firm promises a customer a county it can no longer search. */}
      <AdapterHealthPanel />

      {/* R11 — measured coverage sits ABOVE the compiled registry below, because "what we have
          proven" is the claim a firm should read first. The two are separate blocks rather than
          one coloured table: they answer different questions, and a reader must be able to tell
          which one they are looking at. */}
      <MeasuredCoverage />

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        <CoverageStat
          label="Implemented"
          count={coverage.implemented.count}
          tone="green"
          hint="Adapter built + tested against live county portal."
        />
        <CoverageStat
          label="Stub"
          count={coverage.stub.count}
          tone="amber"
          hint="Registered + routed, but the per-county adapter is a placeholder; relies on the aggregator fallback or queues for manual retrieval."
        />
        <CoverageStat
          label="Unavailable / Manual"
          count={coverage.unavailable.count}
          tone="red"
          hint="No online portal known; document retrieval requires in-person courthouse work."
        />
      </section>

      <section>
        <h2 style={{ marginBottom: 12 }}>Counties in registry</h2>
        <div
          style={{
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            /* admin-ui-alignment-2026-08-15 (A11) — was `overflow: hidden`, which clipped this
               six-column registry 259px short on a phone. Scrolls sideways now. */
            overflowX: 'auto',
            overflowY: 'hidden',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '14px',
            }}
          >
            <thead>
              <tr
                style={{
                  background: 'var(--theme-bg-elevated, #F8FAFC)',
                  textAlign: 'left',
                  borderBottom: '1px solid var(--theme-border, #E2E8F0)',
                }}
              >
                <th style={th}>FIPS</th>
                <th style={th}>County</th>
                <th style={th}>System</th>
                <th style={th}>Status</th>
                <th style={th}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map((entry) => (
                <tr
                  key={entry.fips + entry.county}
                  style={{ borderBottom: '1px solid #F1F5F9' }}
                >
                  <td style={td}>
                    <code style={{ fontSize: 12 }}>{entry.fips}</code>
                  </td>
                  <td style={td}>{entry.county}</td>
                  <td style={td}>{SYSTEM_LABEL[entry.system] ?? entry.system}</td>
                  <td style={td}>
                    <span
                      className={STATUS_BADGE[entry.status]}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 500,
                      }}
                    >
                      {entry.status}
                    </span>
                  </td>
                  <td style={td}>
                    {entry.baseUrl ? (
                      <a
                        href={entry.baseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: 'var(--theme-accent, #2563EB)',
                          fontSize: 12,
                          marginRight: 6,
                        }}
                      >
                        portal ↗
                      </a>
                    ) : null}
                    <span style={{ color: 'var(--theme-fg-muted, #64748B)', fontSize: 12 }}>
                      {entry.notes ?? '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p style={{ marginTop: 16, fontSize: '12px', color: 'var(--theme-fg-secondary, #4B5563)' }}>
        Source of truth:{' '}
        <code>worker/src/adapters/clerk-registry.ts</code>. Add a county or
        promote a stub by editing that file.
      </p>
    </main>
  );
}

const th: React.CSSProperties = {
  padding: '10px 14px',
  fontWeight: 600,
  color: 'var(--theme-fg-primary, #0F172A)',
  fontSize: '13px',
};

const td: React.CSSProperties = {
  padding: '10px 14px',
  verticalAlign: 'top',
  color: 'var(--theme-fg-primary, #1E293B)',
};

function CoverageStat({
  label,
  count,
  tone,
  hint,
}: {
  label: string;
  count: number;
  tone: 'green' | 'amber' | 'red';
  hint: string;
}) {
  const TONE: Record<'green' | 'amber' | 'red', { bg: string; ring: string; text: string }> = {
    green: { bg: '#F0FDF4', ring: '#BBF7D0', text: '#166534' },
    amber: { bg: '#FFFBEB', ring: '#FDE68A', text: '#92400E' },
    red:   { bg: '#FEF2F2', ring: '#FECACA', text: '#991B1B' },
  };
  const palette = TONE[tone];
  return (
    <div
      style={{
        background: palette.bg,
        border: `1px solid ${palette.ring}`,
        borderRadius: '8px',
        padding: '14px',
      }}
    >
      <div
        style={{
          fontSize: '12px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: palette.text,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '28px',
          fontWeight: 700,
          color: palette.text,
          lineHeight: 1.2,
        }}
      >
        {count}
      </div>
      {/* `palette.text`, not the theme token. This card paints its own background, so its
          text has to come from the same palette — see the note in the plan doc. */}
      <div style={{ fontSize: '12px', color: palette.text, marginTop: 4 }}>
        {hint}
      </div>
    </div>
  );
}
