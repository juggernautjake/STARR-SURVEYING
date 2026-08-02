'use client';
// app/admin/research/components/RunDiffPanel.tsx — what changed since the last run (plan R27).
//
// Research is not a one-shot. A job that sits for three months and gains two new deeds needs to be
// told so, and the previously-approved packet needs to be told it is out of date.
//
// `PipelineDiffEngine` has existed for a while, diffing boundary calls between stored versions, and
// no screen ever rendered it. This is the screen — for the broader question, and honest about the
// one thing it cannot answer.

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, FileText, Image as ImageIcon, PenLine, Plus } from 'lucide-react';
import type { ChangeKind, RunChange } from '@/lib/research/run-diff';

interface Payload {
  headline: string;
  firstRun: boolean;
  changes: RunChange[];
  material: RunChange[];
  caveats: string[];
  packetImpact: string;
}

const ICON: Record<ChangeKind, typeof FileText> = {
  new_document: FileText,
  new_imagery: ImageIcon,
  new_fact: Plus,
  corrected_fact: PenLine,
};

export default function RunDiffPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/research/${projectId}/run-diff`);
      if (!res.ok) { setFailed(true); return; }
      setData((await res.json()) as Payload);
      setFailed(false);
    } catch { setFailed(true); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  if (failed) {
    return (
      <div className="run-diff run-diff--bad">
        The change history could not be read — this is not the same as nothing having changed.
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className={`run-diff${data.material.length > 0 ? ' run-diff--material' : ''}`}>
      <p className="run-diff__headline">{data.headline}</p>

      {/* The approved packet being out of date is the most consequential thing on this panel, so it
          is not a footnote. */}
      {data.packetImpact && (
        <p className="run-diff__packet-impact">
          <AlertTriangle size={14} aria-hidden /> {data.packetImpact}
        </p>
      )}

      {data.changes.length > 0 && (
        <ul className="run-diff__list">
          {data.changes.map((c, i) => {
            const Icon = ICON[c.kind];
            const material = c.kind === 'new_document' || c.kind === 'corrected_fact';
            return (
              <li key={i} className={`run-diff__item${material ? ' run-diff__item--material' : ''}`}>
                <Icon size={13} aria-hidden />
                <span className="run-diff__item-label">{c.label}</span>
                <span className="run-diff__item-detail">{c.detail}</span>
                <span className="run-diff__item-at">{c.at.slice(0, 10)}</span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Stated, not hidden: a diff that silently omits changed values is worse than one that admits
          it detects additions and corrections only. */}
      {data.caveats.map((c, i) => (
        <p key={i} className="run-diff__caveat">{c}</p>
      ))}
    </div>
  );
}
