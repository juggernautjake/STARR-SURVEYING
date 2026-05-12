// app/admin/research/coverage/page.tsx — Phase 14 §407 statewide coverage-gap dashboard
//
// Read-only admin page that visualizes which Texas counties have which
// clerk-system adapter coverage. Sources from
// `worker/src/adapters/clerk-registry.ts` (the canonical 22-entry registry +
// TexasFile aggregator fallback for the remaining 232 counties).
//
// Server component — pure rendering of compile-time data; no client state, no
// network. The registry isn't large enough to warrant pagination.

import Link from 'next/link';
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

export const metadata = {
  title: 'Statewide Coverage — Research',
};

export default function CoveragePage() {
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
        <Link
          href="/admin/research"
          style={{ fontSize: '13px', color: '#2563EB' }}
        >
          ← Research home
        </Link>
        <h1 style={{ marginTop: 8 }}>Statewide Coverage</h1>
        <p style={{ color: '#475569', fontSize: '14px' }}>
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
            overflow: 'hidden',
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
                  background: '#F8FAFC',
                  textAlign: 'left',
                  borderBottom: '1px solid #E2E8F0',
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
                          color: '#2563EB',
                          fontSize: 12,
                          marginRight: 6,
                        }}
                      >
                        portal ↗
                      </a>
                    ) : null}
                    <span style={{ color: '#64748B', fontSize: 12 }}>
                      {entry.notes ?? '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p style={{ marginTop: 16, fontSize: '12px', color: '#94A3B8' }}>
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
  color: '#0F172A',
  fontSize: '13px',
};

const td: React.CSSProperties = {
  padding: '10px 14px',
  verticalAlign: 'top',
  color: '#1E293B',
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
      <div style={{ fontSize: '12px', color: '#475569', marginTop: 4 }}>
        {hint}
      </div>
    </div>
  );
}
