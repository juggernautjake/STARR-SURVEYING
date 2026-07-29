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
import { PF2_ATTRIBUTES, type PF2AttributeKey } from '@/lib/dnd/systems/pathfinder2e/model';
import { pf2WalkerFeatOptions } from '@/lib/dnd/slots/walker-options';
import type { PF2OutstandingChoice, PF2LevelUpPlan } from '@/lib/dnd/systems/pathfinder2e/levelup';

// The plan's shape comes from the planner that PRODUCES it, not from a hand-copy here. It was hand-copied,
// and the copy had already drifted: adding the Monk's `save` choice to `PF2ChoiceKind` left this file's
// union at three kinds, so the new branch typechecked as unreachable and the `options` the server sends
// simply did not exist as far as this component was concerned. A duplicated type is a type that stops
// agreeing the first time the original changes.
export type Outstanding = PF2OutstandingChoice;
type Plan = PF2LevelUpPlan;

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
  // The last refusal the route flagged as overridable, held with its exact choice (slot plan S6d).
  const [refused, setRefused] = useState<Record<string, unknown> | null>(null);

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
    async (choice: Record<string, unknown>, acceptException = false) => {
      setBusy(true);
      setError(null);
      try {
        const r = await fetch(`/api/dnd/characters/${characterId}/pf2-levels`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ choice, acceptException }),
        });
        const j = await r.json();
        if (!r.ok) {
          // The route says whether THIS refusal may be overridden. Hold the exact choice so "Take it
          // anyway" re-sends what was judged, rather than something rebuilt from the form.
          setRefused(j?.canTakeAnyway ? choice : null);
          throw new Error(j?.error ?? 'Could not record that choice.');
        }
        setRefused(null);
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
      {/* The escape hatch (slot plan S6d). PF2's level walker now GATES the value as well as the slot, so a
          refusal is real — and this is what stops it being a wall. Offered only when the route says this
          particular refusal is overridable. */}
      {refused && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
          <span style={{ flex: 1, minWidth: 200, color: 'var(--hx-muted)' }}>
            You can take it anyway — it is recorded as an exception, and this character will read{' '}
            <strong>Altered vanilla</strong> and name it for your DM.
          </span>
          <button className={styles.hexBtn} disabled={busy} onClick={() => void record(refused, true)}>
            + Take it anyway
          </button>
          <button className={styles.hexBtn} disabled={busy} onClick={() => { setRefused(null); setError(null); }}>
            Pick something else
          </button>
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
        {/* A REMAINING count, not "Choice 1 of N" — see the note in LevelBuilder. The literal 1 never
            moved, so answering a choice looked like nothing had happened. */}
        {count === 1 ? `Last choice · level ${choice.level}` : `${count} choices left · level ${choice.level}`}
      </div>
      <div style={{ fontWeight: 600 }}>{choice.label}</div>
      <div style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>{choice.detail}</div>
      {choice.kind === 'subclass' && <SubclassInput className={className} busy={busy} onPick={(value) => onRecord({ level: choice.level, kind: 'subclass', value })} />}
      {choice.kind === 'feat' && <FeatInput choice={choice} className={className} busy={busy} onPick={(value) => onRecord({ level: choice.level, kind: 'feat', track: choice.track, value })} />}
      {choice.kind === 'boosts' && <BoostsInput busy={busy} onPick={(attributes) => onRecord({ level: choice.level, kind: 'boosts', attributes })} />}
      {choice.kind === 'save' && <SaveInput choice={choice} busy={busy} onPick={(value) => onRecord({ level: choice.level, kind: 'save', value })} />}
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

/**
 * The Monk's Path to Perfection (P5-10b) — pick which saving throw this step raises.
 *
 * Unlike the feat picker three functions down, this one FILTERS rather than showing refusals, and the
 * asymmetry is deliberate: an ineligible feat is a real choice a table might allow, so it stays visible
 * and reachable through the escape hatch. A save that is not at the step's starting rank is not a choice
 * at all — raising an expert save to legendary is a state the rules cannot produce and the sheet cannot
 * depict as wrong. There are three options; showing one greyed out teaches nothing.
 *
 * The legal set comes from the PLAN, not from this component. The server computes it from the picks as
 * they stand and re-checks it on the way in, so a stale page cannot record an illegal step.
 */
function SaveInput({ choice, busy, onPick }: { choice: Outstanding; busy: boolean; onPick: (v: string) => void }) {
  const options = choice.options ?? [];
  const [value, setValue] = useState('');
  if (!options.length) {
    return (
      <div style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>
        No save is eligible for this step yet — answer the earlier Path to Perfection first.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <select value={value} onChange={(e) => setValue(e.target.value)} disabled={busy} style={selStyle}>
        <option value="">— choose —</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o.charAt(0).toUpperCase() + o.slice(1)}
          </option>
        ))}
      </select>
      <button className={styles.hexBtn} disabled={busy || !value} onClick={() => onPick(value)}>
        Record
      </button>
    </div>
  );
}

export function FeatInput({ choice, className, busy, onPick }: { choice: Outstanding; className: string; busy: boolean; onPick: (v: string) => void }) {
  // Feats of this slot's track. Two filters used to live here and they are NOT the same kind of thing —
  // S6f made that distinction visible on the 5e walker and it applies identically here.
  //
  // · The LEVEL floor is now shown, not enforced. `pf2FeatEligibility`'s first refusal is
  //   "X is a level-4 feat; this character is level 2" — and this picker used to drop exactly those,
  //   so the pick could not be made, could not be refused, and could not reach "+ Take it anyway".
  //   The hatch this file renders 40 lines up was unreachable for the single most common PF2 refusal.
  //   They stay, grouped, labelled with their level, and SELECTABLE: the server refuses them exactly as
  //   before, and that refusal is what raises the hatch.
  //
  // · CLASS scoping stays a filter, and that is a deliberate asymmetry rather than an oversight.
  //   `PF2_ALL_FEATS` carries ~500 class feats; offering every other class's as "you can't have this"
  //   would be a 500-row dropdown of refusals, which S6b already ruled against for the PF2 content
  //   picker ("the hatch offers what the SEARCH surfaced, not the whole catalog"). A player who wants
  //   another class's feat is doing something the search surface serves better than a select can.
  //   Bounded-and-shown, unbounded-and-filtered — the same rule the rest of this plan uses.
  //
  // Nothing here judges PREREQUISITES, on purpose. This component holds a class name and a level, not
  // the character's attributes, skills or feat list, and `pf2FeatEligibility` needs all of them. Judging
  // with a thinner context than the server is precisely the War Caster bug S6f found on the 5e picker —
  // it prints a confident, wrong reason. A prereq failure still surfaces the honest way: the server
  // refuses it and returns its own sentence.
  //
  // The split itself lives in `lib/dnd/slots/walker-options.ts` so it can be tested against the real
  // catalog and the real gate rather than by grepping this file — which is how S6f's two bugs survived a
  // green suite in the first place.
  const { legal, higher, higherOmitted } = useMemo(
    () => pf2WalkerFeatOptions(choice.track, choice.level, className),
    [choice.track, choice.level, className],
  );
  const [value, setValue] = useState('');
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <select value={value} onChange={(e) => setValue(e.target.value)} disabled={busy} style={{ ...selStyle, minWidth: 200 }}>
        <option value="">— choose a {choice.track} feat —</option>
        {legal.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {/* One shared reason for the whole group, so the group states it ONCE rather than repeating
            "too high level" on sixty rows. No `disabled` anywhere: a disabled option would explain the
            feat correctly and still leave the hatch unreachable, which was the whole defect. */}
        {higher.length > 0 && (
          <optgroup label="⊘ Above your level — needs an exception">
            {higher.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name} (level {f.level})
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <button className={styles.hexBtn} disabled={busy || !value.trim()} onClick={() => onPick(value.trim())}>
        Record
      </button>
      {/* Say what was left out rather than letting a truncated list read as the whole catalog. Ancestry is
          the only track that hits this today — the walker doesn't know the character's ancestry, so it
          cannot narrow 313 entries the way it narrows class feats by class. */}
      {higherOmitted > 0 && (
        <div style={{ flexBasis: '100%', fontSize: 11.5, color: 'var(--hx-muted)' }}>
          {higherOmitted} further out-of-level {choice.track} feats aren’t listed — the nearest {higher.length} are.
        </div>
      )}
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
