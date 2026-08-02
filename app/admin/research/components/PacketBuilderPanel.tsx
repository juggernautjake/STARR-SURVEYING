'use client';
// app/admin/research/components/PacketBuilderPanel.tsx — choosing what goes to the crew (plan R25).
//
// R25 built the packet: assembly, provenance lines, versioning, approval, the PDF. R26 put the
// approved packet on the job and in Work Mode. Neither gave anybody a way to CHOOSE what is in it —
// the API took a selection and nothing produced one, so the whole deliverable path was unreachable
// in practice.
//
// ── THE DEFAULT MATTERS MORE THAN THE PICKER ────────────────────────────────────────────────────
//
// Left to a blank list, people ship an empty packet or tick everything. So the panel opens with a
// sensible selection already made — every conflict, every readable document, the plan — and the
// facts left OUT by default, because fifty unreviewed facts in a packet is how an unchecked value
// reaches a crew looking authoritative. Adding them is one click; the point is that including them
// is a decision somebody made rather than a default nobody noticed.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText } from 'lucide-react';
import type { Discrepancy, ExtractedDataPoint, ResearchDocument } from '@/types/research';
import type { PacketItemKind, PacketItemRef } from '@/lib/research/packet';
import { evidenceFor } from '@/lib/research/fact-evidence';
import { reviewMeta } from '@/lib/research/fact-review';

interface PacketRow {
  id: string;
  version: number;
  title: string;
  status: 'draft' | 'approved' | 'superseded';
  approved_by: string | null;
  approved_at: string | null;
  contents: PacketItemRef[];
}

interface Candidate {
  kind: PacketItemKind;
  refId: string;
  label: string;
  detail: string;
  /** Ticked when the panel opens. */
  defaultOn: boolean;
  /** Why this one is off by default, or why it needs care. */
  caution?: string;
}

export default function PacketBuilderPanel({ projectId }: { projectId: string }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [packets, setPackets] = useState<PacketRow[]>([]);
  const [title, setTitle] = useState('');
  const [coverNotes, setCoverNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const key = (c: { kind: string; refId: string }) => `${c.kind}:${c.refId}`;

  const load = useCallback(async () => {
    try {
      const [docRes, factRes, discRes, packetRes] = await Promise.all([
        fetch(`/api/admin/research/${projectId}/documents`),
        fetch(`/api/admin/research/${projectId}/data-points`),
        fetch(`/api/admin/research/${projectId}/discrepancies`),
        fetch(`/api/admin/research/${projectId}/packets`),
      ]);
      if (!docRes.ok || !factRes.ok || !discRes.ok) {
        setError('The project contents could not be read, so nothing can be selected. This is not an empty project.');
        setLoaded(true);
        return;
      }

      const docs = ((await docRes.json()).documents ?? []) as ResearchDocument[];
      const factJson = await factRes.json() as { grouped?: Record<string, ExtractedDataPoint[]> };
      const facts = Object.values(factJson.grouped ?? {}).flat();
      const conflicts = ((await discRes.json()).discrepancies ?? []) as Discrepancy[];
      if (packetRes.ok) setPackets(((await packetRes.json()).packets ?? []) as PacketRow[]);

      const list: Candidate[] = [
        // Conflicts first — they are what a crew must resolve, and they belong in every packet.
        ...conflicts.map((c): Candidate => ({
          kind: 'conflict', refId: c.id,
          label: c.title,
          detail: c.description.slice(0, 120),
          defaultOn: true,
        })),
        ...docs.map((d): Candidate => ({
          kind: 'document', refId: d.id,
          label: d.document_label || d.original_filename || 'Untitled document',
          detail: (d.document_type ?? 'document').replace(/_/g, ' '),
          // An unreadable document still belongs in the packet — its provenance line says nobody
          // could read it, which is a fact the crew needs — but it is not ticked silently.
          defaultOn: d.processing_status !== 'unreadable',
          caution: d.processing_status === 'unreadable'
            ? 'Nobody could read this document. Including it prints that fact; leaving it out hides it.'
            : undefined,
        })),
        ...facts.map((f): Candidate => {
          const r = reviewMeta(f);
          const e = evidenceFor(f);
          const unchecked = r.status === 'unreviewed';
          return {
            kind: 'fact', refId: f.id,
            label: `${f.data_category.replace(/_/g, ' ')}: ${r.effectiveValue ?? '(rejected)'}`,
            detail: `${r.label} · ${e.label}`,
            // Off by default when nobody has checked it — fifty unreviewed facts in a packet is how
            // an unchecked value reaches a crew looking authoritative.
            defaultOn: !unchecked && r.status !== 'rejected',
            caution: unchecked
              ? 'Nobody has checked this against the source. It will be printed as unverified.'
              : r.status === 'rejected'
                ? 'A reviewer rejected this value.'
                : undefined,
          };
        }),
      ];

      setCandidates(list);
      setSelected(new Set(list.filter(c => c.defaultOn).map(key)));
      setLoaded(true);
    } catch {
      setError('The project contents could not be read, so nothing can be selected. This is not an empty project.');
      setLoaded(true);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const on = candidates.filter(c => selected.has(key(c)));
    return {
      total: on.length,
      conflicts: on.filter(c => c.kind === 'conflict').length,
      documents: on.filter(c => c.kind === 'document').length,
      facts: on.filter(c => c.kind === 'fact').length,
      cautioned: on.filter(c => c.caution).length,
    };
  }, [candidates, selected]);

  function toggle(c: Candidate) {
    setSelected(prev => {
      const next = new Set(prev);
      const k = key(c);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  async function createPacket() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // Order follows the on-screen order within each kind, which is the order the surveyor sees.
      const contents: PacketItemRef[] = candidates
        .filter(c => selected.has(key(c)))
        .map((c, i) => ({ kind: c.kind, refId: c.refId, order: i }));

      const res = await fetch(`/api/admin/research/${projectId}/packets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', title: title.trim() || undefined, coverNotes: coverNotes.trim() || null, contents }),
      });
      if (!res.ok) {
        setError(((await res.json()) as { error?: string }).error ?? 'The packet could not be created.');
        return;
      }
      await load();
    } catch {
      setError('The packet could not be created — check your connection.');
    } finally {
      setBusy(false);
    }
  }

  async function approve(packetId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/research/${projectId}/packets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', packetId }),
      });
      if (!res.ok) {
        setError(((await res.json()) as { error?: string }).error ?? 'The packet could not be approved.');
        return;
      }
      await load();
    } catch {
      setError('The packet could not be approved — check your connection.');
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <p className="packet-builder__note">Reading the project contents…</p>;

  return (
    <div className="packet-builder">
      {error && <p className="packet-builder__error">{error}</p>}

      {packets.length > 0 && (
        <div className="packet-builder__existing">
          {packets.map(p => (
            <div key={p.id} className={`packet-builder__packet packet-builder__packet--${p.status}`}>
              <FileText size={13} aria-hidden />
              <span className="packet-builder__packet-title">{p.title} (v{p.version})</span>
              <span className="packet-builder__packet-status">
                {p.status === 'approved'
                  ? `approved by ${p.approved_by ?? 'unknown'}${p.approved_at ? ` on ${p.approved_at.slice(0, 10)}` : ''}`
                  : p.status}
              </span>
              <a
                className="packet-builder__packet-pdf"
                href={`/api/admin/research/${projectId}/packets/${p.id}/pdf`}
                target="_blank" rel="noopener noreferrer"
              >
                PDF
              </a>
              {p.status === 'draft' && (
                <button className="packet-builder__approve" disabled={busy} onClick={() => void approve(p.id)}>
                  Approve for the field
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="packet-builder__meta">
        <input
          className="packet-builder__title"
          placeholder="Packet title (optional)"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
        <textarea
          className="packet-builder__notes"
          placeholder="Cover notes for the crew — gate codes, access, anything the documents do not say"
          value={coverNotes}
          onChange={e => setCoverNotes(e.target.value)}
          rows={2}
        />
      </div>

      <p className="packet-builder__counts">
        {counts.total} item(s) selected — {counts.conflicts} conflict(s), {counts.documents} document(s),
        {' '}{counts.facts} fact(s).
        {counts.cautioned > 0 && (
          <span className="packet-builder__caution-count">
            {' '}<AlertTriangle size={12} aria-hidden /> {counts.cautioned} need care — see the notes below.
          </span>
        )}
      </p>

      <div className="packet-builder__list">
        {candidates.map(c => {
          const on = selected.has(key(c));
          return (
            <label key={key(c)} className={`packet-builder__item${c.caution ? ' packet-builder__item--caution' : ''}`}>
              <input type="checkbox" checked={on} onChange={() => toggle(c)} />
              <span className="packet-builder__item-kind">{c.kind}</span>
              <span className="packet-builder__item-label">{c.label}</span>
              <span className="packet-builder__item-detail">{c.detail}</span>
              {/* Said on the item, not in a legend: whoever ticks it is the person who needs to know. */}
              {c.caution && <span className="packet-builder__item-caution">{c.caution}</span>}
            </label>
          );
        })}
        {candidates.length === 0 && (
          <p className="packet-builder__note">
            Nothing has been extracted for this project yet, so there is nothing to put in a packet.
          </p>
        )}
      </div>

      <button
        className="packet-builder__create"
        disabled={busy || counts.total === 0}
        onClick={() => void createPacket()}
      >
        {busy ? 'Working…' : <><CheckCircle2 size={14} aria-hidden /> Create packet version</>}
      </button>
      {counts.total === 0 && (
        <span className="packet-builder__note"> Select at least one item — an empty packet cannot be approved.</span>
      )}
    </div>
  );
}
