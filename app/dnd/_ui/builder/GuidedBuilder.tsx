'use client';
// app/dnd/_ui/builder/GuidedBuilder.tsx — the guided character-builder SHELL (B1).
//
// A dedicated "build from the system" page walks a character through Foundations (class/race/background/
// abilities) → each Level's choices → Review, one step at a time, like the D&D Beyond builder. This shell
// is system-AGNOSTIC: it renders an ordered step list grouped into phases in a left rail, the current
// step's content in the centre, and Back / Next navigation. Each system supplies its own steps (their
// nodes are built server-side from that system's rules), so the shell never knows a mechanic.
//
// B1 ships the shell + navigation, reusing the existing per-system builder components as the step bodies;
// later slices (B3+) replace those with true per-level choice flows and a live preview. Styling is
// hextech-token only so every skin applies.
import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import styles from '../hextech.module.css';
import type { GuidedStepMeta } from '@/lib/dnd/builder/types';
import BuilderRoller from './BuilderRoller';

export interface GuidedStep extends GuidedStepMeta {
  /** The step's rendered body (built server-side with the system's data + the shared statgen/pickers). */
  node: ReactNode;
}

export default function GuidedBuilder({
  characterId,
  characterName,
  systemLabel,
  steps,
}: {
  characterId: string;
  characterName: string;
  /** Human-readable current system, e.g. "D&D 5e (2024)" — shown in the header so the page reads as
   *  "building in THIS system", answering the owner's "geared to the system we chose". */
  systemLabel: string;
  steps: GuidedStep[];
}) {
  const [active, setActive] = useState(0);
  const current = steps[active];

  // Group the rail by phase, preserving first-seen order, so Foundations → Levels → Review reads top-down.
  const phases = useMemo(() => {
    const order: string[] = [];
    const byPhase = new Map<string, { step: GuidedStep; index: number }[]>();
    steps.forEach((step, index) => {
      if (!byPhase.has(step.phase)) { byPhase.set(step.phase, []); order.push(step.phase); }
      byPhase.get(step.phase)!.push({ step, index });
    });
    return order.map((phase) => ({ phase, items: byPhase.get(phase)! }));
  }, [steps]);

  const chip = (index: number) => {
    if (index === active) return { t: '●', c: 'var(--hx-teal-1)' };
    if (index < active) return { t: '✓', c: 'var(--hx-gold-2)' };
    return { t: index + 1, c: 'var(--hx-muted)' };
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 260px) 1fr', gap: 20, alignItems: 'start' }}>
      {/* ── Left column: the step rail + the permanently DOCKED dice roller (owner: the builder's roller is a
          fixed page mechanic for rolling stats — it does not float/move like the sheet's play roller). ──── */}
      <div style={{ position: 'sticky', top: 12, display: 'grid', gap: 14 }}>
      <nav aria-label="Build steps" style={{ display: 'grid', gap: 14, border: '1px solid var(--hx-line)', borderRadius: 12, background: 'var(--hx-inset-soft)', padding: '14px 12px' }}>
        {phases.map(({ phase, items }) => (
          <div key={phase} style={{ display: 'grid', gap: 5 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--hx-gold-2)', padding: '0 4px' }}>{phase}</div>
            {items.map(({ step, index }) => {
              const c = chip(index);
              const on = index === active;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActive(index)}
                  aria-current={on ? 'step' : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                    padding: '7px 9px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${on ? 'var(--hx-teal-2)' : 'transparent'}`,
                    background: on ? 'rgba(10,200,185,0.10)' : 'transparent',
                    color: on ? 'var(--hx-text)' : 'var(--hx-muted)', fontSize: 13.5, fontWeight: on ? 600 : 500,
                  }}
                >
                  <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, flex: 'none', borderRadius: '50%', border: `1px solid ${c.c}`, color: c.c, fontSize: 12, fontWeight: 700 }}>{c.t}</span>
                  <span style={{ minWidth: 0 }}>{step.title}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>
        <BuilderRoller />
      </div>

      {/* ── Current step ─────────────────────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--hx-muted)' }}>{current.phase} · Step {active + 1} of {steps.length}</div>
            <h2 style={{ margin: '3px 0 0', fontFamily: 'var(--hx-font-display)', fontWeight: 700, fontSize: 22, color: 'var(--hx-gold-2)' }}>{current.title}</h2>
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--hx-muted)' }}>{systemLabel}</span>
        </div>
        {current.help && <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500, color: 'var(--hx-muted)', lineHeight: 1.5, maxWidth: 720 }}>{current.help}</p>}

        <div style={{ border: '1px solid var(--hx-line)', borderRadius: 12, background: 'var(--hx-inset-soft)', padding: '16px 18px', minWidth: 0 }}>
          {current.node}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className={styles.hexBtn} disabled={active === 0} onClick={() => setActive((i) => Math.max(0, i - 1))} style={{ opacity: active === 0 ? 0.5 : 1 }}>← Back</button>
          <span style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>{characterName}</span>
          {active < steps.length - 1 ? (
            <button type="button" className={styles.hexBtn} onClick={() => setActive((i) => Math.min(steps.length - 1, i + 1))}>Next →</button>
          ) : (
            <Link className={styles.hexBtn} href={`/dnd/characters/${characterId}`}>Finish → View sheet</Link>
          )}
        </div>
      </div>
    </div>
  );
}
