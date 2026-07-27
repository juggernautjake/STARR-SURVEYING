'use client';
// app/dnd/_ui/SheetEditHistory.tsx — the edit history for a BESPOKE sheet (Intuitive Games, Pathfinder 2e).
//
// WHY THIS EXISTS. `EditReviewPanel` is the DM's review surface, and it is bound to the shared 5e sheet's
// store (`useChar` — for the ✎ approve-all pass over `char.attacks`/`inventory`/`features`/`spells`). The
// two bespoke sheets don't use that store, so they mounted no review surface at all: a DM opening an IG or
// PF2 character had **nowhere to see what a player had changed**, on the two systems whose edits had also
// never been audited until the bespoke-edit audit slice.
//
// That slice fixed the recording. This is the reading. Without it those rows exist only for the AI's
// undo/history digest, and the platform's promise — *"every change is visible to the DM"* — is still false
// on half the systems.
//
// DELIBERATELY READ-ONLY, and that is not a shortcut. A bespoke row carries no `new_value`, because its
// change lives in a sidecar the 5e `Character` shape cannot express — so `revertSheetEdit` has nothing to
// replay backwards and the revert route refuses it by design. A Revert button here could only ever fail,
// which is the exact dead control fixed on the shared panel. Undo lives on the sheet's own controls.
//
// It shares `describeEdit` with the shared panel rather than formatting rows itself. That formatter is
// where two vocabularies drifted once already; a second copy here would be the third.
import { useCallback, useEffect, useState } from 'react';
import { describeEdit } from '@/lib/dnd/edit-describe';
import styles from './hextech.module.css';

export interface Row {
  id: string;
  field_path: string | null;
  is_dm: boolean | null;
  old_value: unknown;
  new_value: unknown;
  summary?: string | null;
  editor_name?: string | null;
  created_at: string;
}

export default function SheetEditHistory({ characterId, canWrite }: {
  characterId?: string;
  /** Same gate the shared panel uses: a plain viewer has no business in a sheet's edit history. */
  canWrite?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    if (!characterId || !canWrite) { setLoaded(true); return; }
    fetch(`/api/dnd/characters/${characterId}/edits?limit=40`)
      .then((r) => (r.ok ? r.json() : { edits: [] }))
      .then((j) => setRows((j.edits ?? []) as Row[]))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [characterId, canWrite]);

  useEffect(() => { load(); }, [load]);

  if (!characterId || !canWrite) return null;
  return <EditHistoryView rows={rows} loaded={loaded} />;
}

/** The MARKUP, split from the fetching container above so its states are reachable in a test.
 *
 *  Same reason `CampaignsPanel` was split out of `CharacterCampaigns`: the container renders its populated
 *  state only after a request resolves, which never happens under `renderToStaticMarkup`, so a test could
 *  otherwise only grep the source. This repo has been burned twice by exactly that — a build gate that
 *  passed nine source-anchored tests while refusing every legal build, and a green 15k-test suite that
 *  missed three rendering-condition bugs in one browser pass. A grep proves a branch EXISTS; only a render
 *  proves it puts the right thing on screen. */
export function EditHistoryView({ rows, loaded }: { rows: Row[]; loaded: boolean }) {
  // Same filter as the shared panel: the revert-audit rows are bookkeeping about the queue, not changes
  // to the character.
  const visible = rows.filter((r) => !(r.field_path ?? '').startsWith('revert:'));

  return (
    <section className={styles.framedPanel} style={{ display: 'grid', gap: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--hx-gold-2, #c8aa6e)' }}>
        Edit history
      </div>
      {!loaded ? (
        <p style={{ fontSize: 12.5, color: 'var(--hx-muted)', margin: 0 }}>Loading edit history…</p>
      ) : visible.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--hx-muted)', margin: 0 }}>No edits recorded yet — this sheet is as it was built.</p>
      ) : (
        <>
          <p style={{ fontSize: 11.5, color: 'var(--hx-muted)', margin: 0, lineHeight: 1.5 }}>
            Every change to this character, newest first. Undo one from the control that made it — these
            entries record what happened, not how to put it back.
          </p>
          <div style={{ display: 'grid', gap: 6 }}>
            {visible.map((row) => (
              <div key={row.id} style={{ borderTop: '1px solid var(--hx-line)', paddingTop: 6 }}>
                <div style={{ fontSize: 13, color: 'var(--hx-text)', wordBreak: 'break-word' }}>{describeEdit(row)}</div>
                <div style={{ fontSize: 11, color: 'var(--hx-muted)' }}>
                  {row.editor_name ? `${row.editor_name} (${row.is_dm ? 'DM' : 'player'})` : (row.is_dm ? 'DM' : 'player')}
                  {' · '}{new Date(row.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
