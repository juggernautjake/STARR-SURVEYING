'use client';
// app/dnd/_ui/builder/SlotSteps.tsx — the outstanding choices as a strip of screens (P5-7b).
//
// One presentational component for all three systems, for the same reason `slot-steps.ts` is one module:
// it is handed `{ id, level, short }` and never learns what a subclass or an attribute boost is. The three
// walkers each render it above their own choice prompt.
//
// It shows every choice still owed, grouped by level, with the active one marked — and every chip is a
// button, so a player who is undecided about their subclass can jump ahead and record the ASI they have
// already settled on. That is the actual behaviour change; the grouping is what makes it legible.
//
// It deliberately does NOT show answered choices as ticked-off history. `outstanding` is what REMAINS —
// an answered choice leaves the list, and inventing a "done" section would mean reconstructing history
// from a list that does not carry it. (The same reasoning that turned "Choice 1 of N" into a remaining
// count in the walkers: the honest sentence about a remaining list is how many are left.)
import type { SlotStep } from '@/lib/dnd/builder/slot-steps';
import { slotStepsByLevel, slotStepNav } from '@/lib/dnd/builder/slot-steps';
import styles from '../hextech.module.css';

export default function SlotSteps({
  steps,
  activeId,
  onSelect,
  disabled = false,
  targetLevel,
}: {
  steps: SlotStep[];
  /** The id the player last selected. May name a step that no longer exists — resolution is the pure
   *  module's job, and this component renders whichever step it settled on as active. */
  activeId: string | null;
  onSelect: (id: string) => void;
  /** True while a save is in flight — jumping mid-save would leave the response landing on another screen. */
  disabled?: boolean;
  /** The level being built to, for the summary line. */
  targetLevel?: number;
}) {
  if (steps.length === 0) return null;
  const nav = slotStepNav(steps, activeId);
  const active = nav.position > 0 ? steps[nav.position - 1] : steps[0];
  const groups = slotStepsByLevel(steps);
  // A single outstanding choice needs no navigation between screens — there is nowhere to go, and a strip
  // with one chip and two dead arrows reads as broken rather than as complete.
  const single = steps.length === 1;

  return (
    <nav
      aria-label="Outstanding choices"
      style={{ display: 'grid', gap: 8, border: '1px solid var(--hx-line)', borderRadius: 10, background: 'var(--hx-inset-soft)', padding: '10px 12px' }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--hx-gold-2)' }}>
          {single ? 'Last choice' : `${steps.length} choices left`}
          {targetLevel != null && <span style={{ color: 'var(--hx-muted)', fontWeight: 500, letterSpacing: '0.06em' }}> · before level {targetLevel}</span>}
        </span>
        {!single && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--hx-muted)' }}>
            Screen {nav.position} of {nav.total}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {groups.map((g) => (
          <div key={g.level} style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--hx-teal-1)' }}>Level {g.level}</span>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {g.steps.map((s) => {
                const on = s.id === active.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onSelect(s.id)}
                    disabled={disabled}
                    aria-current={on ? 'step' : undefined}
                    title={s.label}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 999,
                      cursor: disabled ? 'default' : 'pointer',
                      fontSize: 12.5,
                      fontWeight: on ? 700 : 500,
                      border: `1px solid ${on ? 'var(--hx-teal-1)' : 'var(--hx-line)'}`,
                      background: on ? 'rgba(10,200,185,0.14)' : 'rgba(1,10,19,0.4)',
                      color: on ? 'var(--hx-text)' : 'var(--hx-muted)',
                      opacity: disabled ? 0.6 : 1,
                    }}
                  >
                    {s.short}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {!single && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button" className={styles.hexBtn} disabled={disabled || !nav.prev}
            onClick={() => nav.prev && onSelect(nav.prev.id)}
            style={{ padding: '3px 9px', fontSize: 11.5, opacity: nav.prev ? 1 : 0.45 }}
          >← Previous choice</button>
          <button
            type="button" className={styles.hexBtn} disabled={disabled || !nav.next}
            onClick={() => nav.next && onSelect(nav.next.id)}
            style={{ padding: '3px 9px', fontSize: 11.5, opacity: nav.next ? 1 : 0.45 }}
          >Next choice →</button>
          <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>
            Answer them in any order — the level only moves once all of them are made.
          </span>
        </div>
      )}
    </nav>
  );
}
