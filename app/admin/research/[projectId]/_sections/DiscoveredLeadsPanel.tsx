// app/admin/research/[projectId]/_sections/DiscoveredLeadsPanel.tsx — iterative loop (plan 3.1).
//
// After analysis, the user can compile the NEW leads it surfaced (chain-of-title citations, adjoiners,
// referenced documents) and choose to run a FOLLOW-UP research round seeded with the selected ones.
// User-initiated throughout: nothing compiles or runs on its own. Styles live in `.leads-panel__*` in
// AdminResearch.css.

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, ArrowRight, Loader2 } from 'lucide-react';

export interface DiscoveredLead {
  id: string;
  kind: 'volume_page' | 'instrument' | 'grantor_name' | 'adjoiner' | 'subdivision';
  value: string;
  volume?: string;
  page?: string;
  label: string;
  source: string;
  round: number;
  searched: boolean;
}

/** Selected leads → the run's supplemental payload (mirrors worker `leadsToSupplemental`). */
export function leadsToSupplemental(leads: DiscoveredLead[]): {
  instrumentNumbers: string[];
  volumePages: Array<{ volume: string; page: string }>;
  ownerNames: string[];
  subdivisions: string[];
} {
  const s = { instrumentNumbers: [] as string[], volumePages: [] as Array<{ volume: string; page: string }>, ownerNames: [] as string[], subdivisions: [] as string[] };
  for (const l of leads) {
    if (l.kind === 'instrument') s.instrumentNumbers.push(l.value);
    else if (l.kind === 'volume_page' && l.volume && l.page) s.volumePages.push({ volume: l.volume, page: l.page });
    else if (l.kind === 'grantor_name' || l.kind === 'adjoiner') s.ownerNames.push(l.value);
    else if (l.kind === 'subdivision') s.subdivisions.push(l.value);
  }
  return s;
}

const KIND_LABEL: Record<DiscoveredLead['kind'], string> = {
  volume_page: 'Referenced deed (vol/page)',
  instrument: 'Referenced instrument',
  grantor_name: 'Prior owner (chain of title)',
  adjoiner: 'Adjoiner',
  subdivision: 'Subdivision / plat',
};

export default function DiscoveredLeadsPanel({
  projectId,
  onRunFollowUp,
}: {
  projectId: string;
  onRunFollowUp: (supplemental: ReturnType<typeof leadsToSupplemental>) => void;
}) {
  const [leads, setLeads] = useState<DiscoveredLead[]>([]);
  const [round, setRound] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [deepReading, setDeepReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compiledOnce, setCompiledOnce] = useState(false);

  const applyLeads = useCallback((next: DiscoveredLead[], nextRound: number) => {
    setLeads(next);
    setRound(nextRound);
    // Default-select the leads not yet searched.
    setSelected(new Set(next.filter((l) => !l.searched).map((l) => l.id)));
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/research/${projectId}/compile-leads`);
      if (res.ok) {
        const data = await res.json();
        applyLeads(data.leads ?? [], data.round ?? 1);
        if ((data.leads ?? []).length > 0) setCompiledOnce(true);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [projectId, applyLeads]);

  useEffect(() => { load(); }, [load]);

  const compile = useCallback(async () => {
    setCompiling(true); setError(null);
    try {
      const res = await fetch(`/api/admin/research/${projectId}/compile-leads`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not compile leads'); }
      else { applyLeads(data.leads ?? [], data.round ?? 1); setCompiledOnce(true); }
    } catch { setError('Could not reach the research worker'); }
    setCompiling(false);
  }, [projectId, applyLeads]);

  const deepRead = useCallback(async () => {
    setDeepReading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/research/${projectId}/deep-read`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Deep-read failed'); }
      else { applyLeads(data.leads ?? [], data.round ?? round); setCompiledOnce(true); }
    } catch { setError('Could not reach the research worker'); }
    setDeepReading(false);
  }, [projectId, applyLeads, round]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const open = leads.filter((l) => !l.searched);
  const chosen = leads.filter((l) => selected.has(l.id) && !l.searched);
  const byKind = (k: DiscoveredLead['kind']) => open.filter((l) => l.kind === k);

  return (
    <div className="leads-panel">
      <div className="leads-panel__head">
        <h4 className="leads-panel__title"><Search size={15} strokeWidth={2} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: '0.35rem' }} />Follow-up research leads</h4>
        <div className="leads-panel__actions">
          <button className="leads-panel__compile" onClick={compile} disabled={compiling || deepReading}>
            {compiling ? <><Loader2 size={13} className="leads-panel__spin" aria-hidden="true" /> Compiling…</> : compiledOnce ? 'Re-compile from analysis' : 'Compile leads from analysis'}
          </button>
          <button className="leads-panel__compile" onClick={deepRead} disabled={compiling || deepReading} title="Run one AI pass over the captured documents to find identifiers the structured read missed. Costs AI time, shown on the run spend.">
            {deepReading ? <><Loader2 size={13} className="leads-panel__spin" aria-hidden="true" /> Deep-reading…</> : 'Deep-read for more clues (AI)'}
          </button>
        </div>
      </div>
      <p className="leads-panel__desc">
        The clues analysis surfaced that the research has not chased yet — referenced deeds and plats, prior
        owners in the chain of title, adjoiners. Pick the ones worth pursuing and run another research round
        to add to what you already have. Currently on round {round}.
      </p>

      {error && <p className="leads-panel__error">{error}</p>}
      {loading && !compiledOnce && <p className="leads-panel__empty">Loading…</p>}

      {compiledOnce && open.length === 0 && !compiling && (
        <p className="leads-panel__empty">Analysis found no new leads to chase — the research already covers what it references.</p>
      )}

      {open.length > 0 && (
        <>
          <div className="leads-panel__groups">
            {(['subdivision', 'volume_page', 'instrument', 'grantor_name', 'adjoiner'] as const).map((kind) => {
              const group = byKind(kind);
              if (group.length === 0) return null;
              return (
                <div key={kind} className="leads-panel__group">
                  <div className="leads-panel__group-title">{KIND_LABEL[kind]} <span className="leads-panel__count">{group.length}</span></div>
                  {group.map((l) => (
                    <label key={l.id} className="leads-panel__lead">
                      <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                      <span className="leads-panel__lead-label">{l.label}</span>
                      <span className="leads-panel__lead-source">{l.source}</span>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
          <button
            className="leads-panel__run"
            disabled={chosen.length === 0}
            onClick={() => onRunFollowUp(leadsToSupplemental(chosen))}
          >
            Run follow-up research ({chosen.length} lead{chosen.length === 1 ? '' : 's'}) <ArrowRight size={15} aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}
