'use client';

// app/admin/research/components/FreePlatLeadsNotice.tsx — a free plat the county portal names, that
// only a person can fetch.
//
// Bell County's clerk publishes every subdivision plat as a free PDF. The worker (a datacentre
// address) and the app (Vercel, another datacentre address) can read the portal's INDEX — through
// the app relay — but the files themselves live on the clerk's CMS host behind Cloudflare, which
// refuses datacentre addresses outright. A residential Browserbase session would get through and
// needs a paid plan. Until then the one address that can fetch the file is the person's own
// browser, so the run records the exact file it found and this notice hands it to them: open the
// PDF, then add it to the project's Documents. Two clicks, and the plat the owner wanted is filed.

import { ExternalLink, FileWarning } from 'lucide-react';
import Link from 'next/link';

export interface FreePlatLead {
  name: string;
  url: string;
  source: string;
  subdivision?: string;
  locatedAt?: string;
}

/** The stamped list, checked field by field — it is JSON written by the worker. */
export function normaliseFreePlatLeads(raw: unknown): FreePlatLead[] {
  if (!Array.isArray(raw)) return [];
  const out: FreePlatLead[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (typeof o.name !== 'string' || typeof o.url !== 'string' || !/^https?:\/\//.test(o.url)) continue;
    out.push({
      name: o.name,
      url: o.url,
      source: typeof o.source === 'string' ? o.source : 'the county plat portal',
      ...(typeof o.subdivision === 'string' ? { subdivision: o.subdivision } : {}),
      ...(typeof o.locatedAt === 'string' ? { locatedAt: o.locatedAt } : {}),
    });
  }
  return out;
}

export default function FreePlatLeadsNotice({ projectId, leads }: { projectId: string; leads: unknown }) {
  const items = normaliseFreePlatLeads(leads);
  if (items.length === 0) return null;
  return (
    <div
      role="note"
      data-testid="free-plat-leads"
      style={{
        border: '1px solid var(--border, #e5e7eb)', borderLeft: '4px solid var(--theme-warning, #d97706)', borderRadius: 8,
        padding: '0.75rem 1rem', margin: '0 0 1.25rem', background: 'var(--surface-2, #fafafa)',
        display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
      }}
    >
      <FileWarning size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem' }}>
        <strong>Free plat found on the county portal — it needs one click from the office</strong>
        <span style={{ opacity: 0.8 }}>
          The run found the file, but the clerk&apos;s file host refuses server addresses. Open it here, save it, then add it
          under this project&apos;s Documents and it is filed like any other plat.
        </span>
        <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.1rem' }}>
          {items.map((lead) => (
            <li key={lead.url} style={{ marginBottom: '0.2rem' }}>
              <a href={lead.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>
                {lead.name} <ExternalLink size={12} aria-hidden="true" style={{ verticalAlign: '-1px' }} />
              </a>
              <span style={{ opacity: 0.7 }}> — {lead.source}</span>
            </li>
          ))}
        </ul>
        <Link href={`/admin/research/${projectId}/documents`} style={{ fontWeight: 600 }}>
          Add the saved PDF to this project&apos;s Documents →
        </Link>
      </div>
    </div>
  );
}
