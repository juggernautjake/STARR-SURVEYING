'use client';
// app/ux-harness/CallPanelsHarnessMount.tsx — the call page's screening panels, for a real call.
//
// The call page reads its id from the route (useParams), which the harness cannot supply, so this
// mounts the three panels it added on 2026-10-06 — this number, what was this call, who was told —
// against `?call=<id>` (or the newest live call) with the same data the page loads.
import '@/app/admin/styles/AdminCalls.css';
import { useCallback, useEffect, useState } from 'react';
import type { PhoneCall } from '@/lib/receptionist/calls';
import type { RegistryEntry } from '@/lib/receptionist/registry';
import { NoticesPanel, ThisNumberPanel, VerdictPanel, type OtherCall } from '@/app/admin/calls/[id]/CallScreeningPanels';

export default function CallPanelsHarnessMount(): React.ReactElement {
  const [data, setData] = useState<{ call: PhoneCall; number: RegistryEntry | null; otherCalls: OtherCall[]; region: string | null } | null>(null);
  const load = useCallback(async () => {
    let id = new URLSearchParams(window.location.search).get('call');
    if (!id) {
      const list = (await (await fetch('/api/admin/calls?limit=1')).json()) as { calls?: PhoneCall[] };
      id = list.calls?.[0]?.id ?? null;
    }
    if (!id) return;
    const j = (await (await fetch(`/api/admin/calls/${id}`)).json()) as { call: PhoneCall; number: RegistryEntry | null; otherCalls: OtherCall[]; region: string | null };
    setData(j);
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (!data?.call) return <p className="call-panel__empty">Loading…</p>;
  return (
    <div className="call-detail">
      <div>
        <ThisNumberPanel call={data.call} number={data.number} region={data.region} otherCalls={data.otherCalls} onChanged={() => void load()} onError={() => {}} />
        <VerdictPanel call={data.call} onChanged={() => void load()} onError={() => {}} />
        <NoticesPanel call={data.call} />
      </div>
    </div>
  );
}
