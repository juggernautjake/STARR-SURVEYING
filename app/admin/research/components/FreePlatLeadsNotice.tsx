'use client';

// app/admin/research/components/FreePlatLeadsNotice.tsx — a free plat the county portal names, that
// only a person can fetch.
//
// Bell County's clerk publishes every subdivision plat as a free PDF. The worker (a datacentre
// address) and the app (Vercel, another datacentre address) can read the portal's INDEX — through
// the app relay — but the files themselves live on the clerk's CMS host behind Cloudflare, which
// refuses datacentre addresses outright. A residential Browserbase session would get through and
// needs a paid plan. A cross-origin fetch from this page cannot read the bytes either (the host sends
// no CORS header — measured 2026-09-08). So the one address that can fetch the file is the person's
// own browser, as a plain download: the run records the exact file it found, this notice opens it,
// and the same notice takes the saved file and files it as a plat — under the label the run itself
// would have used, so a later run merges rather than duplicates. Then the AI review reads it like
// any other document.

import { useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, FileWarning, Upload } from 'lucide-react';

export interface FreePlatLead {
  name: string;
  url: string;
  source: string;
  subdivision?: string;
  locatedAt?: string;
  filedAt?: string;
  documentId?: string | null;
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
      ...(typeof o.filedAt === 'string' ? { filedAt: o.filedAt } : {}),
      ...(typeof o.documentId === 'string' ? { documentId: o.documentId } : {}),
    });
  }
  return out;
}

/** The label the worker's own filing uses for a portal plat — the two must match so the rows merge. */
export function platDocumentLabel(lead: FreePlatLead): string {
  return `Subdivision Plat: ${lead.name}`;
}

function LeadRow({ projectId, lead, onFiled }: { projectId: string; lead: FreePlatLead; onFiled?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filed, setFiled] = useState<boolean>(!!lead.filedAt);

  async function fileIt(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('document_type', 'plat');
      form.append('document_label', platDocumentLabel(lead));
      const up = await fetch(`/api/admin/research/${projectId}/documents`, { method: 'POST', body: form });
      const j = (await up.json().catch(() => ({}))) as { documents?: Array<{ id?: string }>; errors?: string[]; error?: string };
      if (!up.ok || !j.documents?.length) {
        setError(j.error ?? j.errors?.[0] ?? `Upload failed (HTTP ${up.status}).`);
        return;
      }
      await fetch(`/api/admin/research/${projectId}/free-plat-leads`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: lead.url, documentId: j.documents[0]?.id ?? null }),
      }).catch(() => { /* the plat is filed either way; the mark is a courtesy */ });
      setFiled(true);
      onFiled?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="fpl__row" data-testid="free-plat-lead">
      <a href={lead.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>
        {lead.name} <ExternalLink size={12} aria-hidden="true" style={{ verticalAlign: '-1px' }} />
      </a>
      <span className="fpl__source">{lead.source}</span>
      {filed ? (
        <span className="fpl__filed">
          <CheckCircle2 size={14} aria-hidden="true" /> filed
        </span>
      ) : (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/tiff"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void fileIt(f); e.target.value = ''; }}
          />
          <button
            type="button"
            className="research-back-btn fpl__btn"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            title="Pick the PDF you just saved from the portal; it is filed on this project as the subdivision plat"
          >
            <Upload size={14} aria-hidden="true" /> {busy ? 'Filing…' : 'Add the saved PDF'}
          </button>
        </>
      )}
      {error && <span role="alert" className="fpl__error">{error}</span>}
    </li>
  );
}

export default function FreePlatLeadsNotice({ projectId, leads, onFiled }: { projectId: string; leads: unknown; onFiled?: () => void }) {
  const items = normaliseFreePlatLeads(leads);
  if (items.length === 0) return null;
  const open = items.filter((l) => !l.filedAt);
  return (
    <div
      role="note"
      data-testid="free-plat-leads"
      className="fpl"
    >
      <FileWarning size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
      <div className="fpl__body">
        <strong>
          {open.length > 0
            ? 'Free plat found on the county portal — two clicks from this browser file it'
            : 'Free plat from the county portal — filed'}
        </strong>
        <span className="fpl__hint">
          The run found the file on the clerk&apos;s portal, but the clerk&apos;s file host refuses server addresses; this
          browser is the one address that can open it. Open the PDF (it downloads), then add the saved file here. It is
          filed as this project&apos;s subdivision plat and the AI review reads it like any other document.
        </span>
        <ul className="fpl__list">
          {items.map((lead) => <LeadRow key={lead.url} projectId={projectId} lead={lead} onFiled={onFiled} />)}
        </ul>
      </div>
    </div>
  );
}
