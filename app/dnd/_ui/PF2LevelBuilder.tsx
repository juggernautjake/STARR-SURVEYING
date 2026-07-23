'use client';
// app/dnd/_ui/PF2LevelBuilder.tsx — build a Pathfinder 2e character level by level (B10).
//
// The PF2 counterpart of LevelBuilder. It walks the tested `/pf2-levels` plan IN ORDER and refuses to
// advance the character's level past an outstanding choice — the same invariant the 5e builder enforces,
// the reason there is no bare +/- stepper. Each prompt reads only verified data: the class's own subclass
// options (Instinct/Bloodline/…), the feat catalog filtered to the slot's track + level, and the four
// universal attribute boosts. Recording a choice and committing a level both go through the route, so the
// server stays the single source of truth. Deliberately NOT here yet (a documented follow-up): projecting
// each recorded feat/boost into the pf2e sidecar's mechanics — committing moves the level (which PF2's
// proficiency math already reads) and records the plan; the sheet's per-choice mechanics come next.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hextech.module.css';
import { pf2Class } from '@/lib/dnd/systems/pathfinder2e/content';
import { PF2_ALL_FEATS } from '@/lib/dnd/systems/pathfinder2e/data';
import { PF2_ATTRIBUTES, type PF2AttributeKey } from '@/lib/dnd/systems/pathfinder2e/model';

interface Outstanding {
  level: number;
  kind: 'subclass' | 'feat' | 'boosts';
  track?: 'ancestry' | 'class' | 'skill' | 'general' | 'archetype';
  label: string;
  detail: string;
  pick?: number;
}
interface Plan {
  from: number;
  to: number;
  outstanding: Outstanding[];
  ready: boolean;
}

export default function PF2LevelBuilder({
  characterId,
  characterName,
  className,
  currentLevel,
}: {
  characterId: string;
  characterName: string;
  className: string;
  currentLevel: number;
}) {
  const router = useRouter();
  const [target, setTarget] = useState(Math.min(20, Math.max(1, currentLevel)));
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (to: number) => {
      setError(null);
      try {
        const u = new URL(`/api/dnd/characters/${characterId}/pf2-levels`, window.location.origin);
        u.searchParams.set('to', String(to));
        const r = await fetch(u.toString());
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? 'Could not load the level plan.');
        setPlan(j.plan as Plan);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load the level plan.');
      }
    },
    [characterId],
  );

  useEffect(() => {
    void load(target);
  }, [load, target]);

  const current = plan?.outstanding?.[0] ?? null;

  const record = useCallback(
    async (choice: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const r = await fetch(`/api/dnd/characters/${characterId}/pf2-levels`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ choice }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? 'Could not record that choice.');
        setPlan(j.plan as Plan);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not record that choice.');
      } finally {
        setBusy(false);
      }
    },
    [characterId],
  );

  const commit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/pf2-levels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commitTo: target }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? 'Could not commit the level.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not commit the level.');
    } finally {
      setBusy(false);
    }
  }, [characterId, target, router]);

  const canCommit = plan?.ready && target > currentLevel;

  return (
    <div className={styles.framedPanel} style={{ display: 'grid', gap: 14 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18 }}>
          {characterName} — level by level
        </h2>
        <p style={{ color: 'var(--hx-muted)', margin: '4px 0 0', fontSize: 13 }}>
          {className || 'This class'} advances through the choices each level unlocks. The level only moves once
          every choice up to your target is made.
        </p>
      </div>

      {/* Target level */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <span style={{ color: 'var(--hx-muted)' }}>Build up to level</span>
        <select
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
          disabled={busy}
          style={selStyle}
        >
          {Array.from({ length: 20 }, (_, i) => i + 1)
            .filter((n) => n >= currentLevel)
            .map((n) => (
              <option key={n} value={n}>
                {n}
                {n === currentLevel ? ' (current)' : ''}
              </option>
            ))}
        </select>
      </label>

      {error && (
        <div style={{ color: 'var(--hx-bad, #e46)', fontSize: 13 }} role="alert">
          {error}
        </div>
      )}

      {/* The outstanding-choice walk */}
      {plan && plan.outstanding.length > 0 && current ? (
        <ChoicePrompt
          key={`${current.level}-${current.kind}-${current.track ?? ''}`}
          choice={current}
          className={className}
          count={plan.outstanding.length}
          busy={busy}
          onRecord={record}
        />
      ) : plan ? (
        <div style={{ fontSize: 13, color: 'var(--hx-muted)' }}>
          {target > currentLevel
            ? `Nothing left to choose — ready to advance to level ${target}.`
            : `Level ${currentLevel} is fully built. Raise the target to keep going.`}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--hx-muted)' }}>Loading…</div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className={styles.hexBtnPrimary ?? styles.hexBtn} disabled={busy || !canCommit} onClick={() => void commit()}>
          Advance to level {target}
        </button>
        {plan && plan.outstanding.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>
            {plan.outstanding.length} choice{plan.outstanding.length === 1 ? '' : 's'} left before level {target}.
          </span>
        )}
      </div>
    </div>
  );
}

const selStyle: React.CSSProperties = {
  background: 'var(--panel-2, #12202b)',
  border: '1px solid var(--line, #2a3b47)',
  borderRadius: 6,
  padding: '4px 8px',
  color: 'var(--ink, #dfeaf0)',
  fontSize: 13,
};

/** One outstanding choice, with the right input for its kind. On submit it hands a clean payload up. */
function ChoicePrompt({
  choice,
  className,
  count,
  busy,
  onRecord,
}: {
  choice: Outstanding;
  className: string;
  count: number;
  busy: boolean;
  onRecord: (choice: Record<string, unknown>) => void | Promise<void>;
}) {
  return (
    <div style={{ border: '1px solid var(--line, #2a3b47)', borderRadius: 8, padding: 12, display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--hx-muted)' }}>
        Choice 1 of {count} · level {choice.level}
      </div>
      <div style={{ fontWeight: 600 }}>{choice.label}</div>
      <div style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>{choice.detail}</div>
      {choice.kind === 'subclass' && <SubclassInput className={className} busy={busy} onPick={(value) => onRecord({ level: choice.level, kind: 'subclass', value })} />}
      {choice.kind === 'feat' && <FeatInput choice={choice} className={className} busy={busy} onPick={(value) => onRecord({ level: choice.level, kind: 'feat', track: choice.track, value })} />}
      {choice.kind === 'boosts' && <BoostsInput busy={busy} onPick={(attributes) => onRecord({ level: choice.level, kind: 'boosts', attributes })} />}
    </div>
  );
}

function SubclassInput({ className, busy, onPick }: { className: string; busy: boolean; onPick: (v: string) => void }) {
  const options = pf2Class(className)?.subclassOptions ?? [];
  const [value, setValue] = useState('');
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <select value={value} onChange={(e) => setValue(e.target.value)} disabled={busy} style={selStyle}>
        <option value="">— choose —</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {/* Custom escape hatch: some classes pick a weapon/stance, not a named list. */}
      {options.length === 0 && (
        <input
          placeholder="your choice"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
          style={{ ...selStyle, width: 160 }}
        />
      )}
      <button className={styles.hexBtn} disabled={busy || !value.trim()} onClick={() => onPick(value.trim())}>
        Record
      </button>
    </div>
  );
}

function FeatInput({ choice, className, busy, onPick }: { choice: Outstanding; className: string; busy: boolean; onPick: (v: string) => void }) {
  // Feats of this slot's track that a character of this level can take. Class feats are scoped to the class.
  const options = useMemo(() => {
    const list = PF2_ALL_FEATS.filter(
      (f) => f.track === choice.track && f.level <= choice.level && (choice.track !== 'class' || !f.className || f.className.toLowerCase() === className.toLowerCase()),
    );
    return [...new Set(list.map((f) => f.name))].sort();
  }, [choice.track, choice.level, className]);
  const [value, setValue] = useState('');
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <select value={value} onChange={(e) => setValue(e.target.value)} disabled={busy} style={{ ...selStyle, minWidth: 200 }}>
        <option value="">— choose a {choice.track} feat —</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <button className={styles.hexBtn} disabled={busy || !value.trim()} onClick={() => onPick(value.trim())}>
        Record
      </button>
    </div>
  );
}

function BoostsInput({ busy, onPick }: { busy: boolean; onPick: (v: PF2AttributeKey[]) => void }) {
  const [picks, setPicks] = useState<PF2AttributeKey[]>([]);
  const toggle = (a: PF2AttributeKey) =>
    setPicks((p) => (p.includes(a) ? p.filter((x) => x !== a) : p.length < 4 ? [...p, a] : p));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {PF2_ATTRIBUTES.map((a) => {
          const on = picks.includes(a);
          return (
            <button
              key={a}
              type="button"
              onClick={() => toggle(a)}
              disabled={busy || (!on && picks.length >= 4)}
              className={styles.hexBtn}
              style={{ opacity: on ? 1 : 0.6, borderColor: on ? 'var(--hx-accent, #4cf)' : undefined }}
            >
              {on ? '✓ ' : ''}
              {a}
            </button>
          );
        })}
      </div>
      <div>
        <button className={styles.hexBtn} disabled={busy || picks.length !== 4} onClick={() => onPick(picks)}>
          Record {picks.length}/4
        </button>
      </div>
    </div>
  );
}
