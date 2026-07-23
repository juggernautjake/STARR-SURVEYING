'use client';
// app/dnd/_ui/IGLevelBuilder.tsx — build an Intuitive Games character level by level (IG-4).
//
// The IG counterpart of PF2LevelBuilder. It walks the tested /ig-levels plan IN ORDER and refuses to advance
// the level past an outstanding choice — the same invariant the 5e/PF2 builders enforce. Every prompt reads
// the scraped schedule's options: subclass powers / specializations / capstones come straight from the plan;
// feats are filtered from IG_FEATS by the slot's category; skills from systemSkills; the trait picker offers
// the five documented trait benefits; ability boosts are a distinct-N attribute pick. Recording + committing
// go through the route so the server stays the source of truth.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hextech.module.css';
import { IG_FEATS } from '@/lib/dnd/systems/intuitive-games/content';
import { systemSkills } from '@/lib/dnd/system-rules';

const IG_ATTRS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
// The five benefits a "New Trait" may grant (intuitivegames.net character-building rules).
const TRAIT_BENEFITS = ['An ancestry option', 'Two Ability Score Boosts', 'A skill proficiency', 'Two weapon-group proficiencies', 'A new stance'];

type Kind = 'trait' | 'ability-boosts' | 'feat-general' | 'feat-combat' | 'skill-proficiency' | 'subclass-power' | 'specialization' | 'greater-specialization' | 'capstone';
interface Outstanding { level: number; kind: Kind; label: string; count?: number; options?: string[] }
interface Plan { from: number; to: number; outstanding: Outstanding[]; ready: boolean }

const selStyle: React.CSSProperties = { background: 'var(--panel-2, #12202b)', border: '1px solid var(--line, #2a3b47)', borderRadius: 6, padding: '4px 8px', color: 'var(--ink, #dfeaf0)', fontSize: 13 };

export default function IGLevelBuilder({ characterId, characterName, subclass, currentLevel }: { characterId: string; characterName: string; subclass: string; currentLevel: number }) {
  const router = useRouter();
  const [target, setTarget] = useState(Math.min(10, Math.max(1, currentLevel)));
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (to: number) => {
    setError(null);
    try {
      const u = new URL(`/api/dnd/characters/${characterId}/ig-levels`, window.location.origin);
      u.searchParams.set('to', String(to));
      const r = await fetch(u.toString());
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? 'Could not load the level plan.');
      setPlan(j.plan as Plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the level plan.');
    }
  }, [characterId]);

  useEffect(() => { void load(target); }, [load, target]);

  const current = plan?.outstanding?.[0] ?? null;

  const record = useCallback(async (choice: Record<string, unknown>) => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/ig-levels`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ choice }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? 'Could not record that choice.');
      setPlan(j.plan as Plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record that choice.');
    } finally { setBusy(false); }
  }, [characterId]);

  const commit = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/ig-levels`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commitTo: target }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? 'Could not commit the level.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not commit the level.');
    } finally { setBusy(false); }
  }, [characterId, target, router]);

  const canCommit = plan?.ready && target > currentLevel;

  return (
    <div className={styles.framedPanel} style={{ display: 'grid', gap: 14 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18 }}>{characterName} — level by level</h2>
        <p style={{ color: 'var(--hx-muted)', margin: '4px 0 0', fontSize: 13 }}>
          {subclass || 'This subclass'} advances on the Remastered schedule (levels 2–10). The level only moves
          once every choice up to your target is made.
        </p>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <span style={{ color: 'var(--hx-muted)' }}>Build up to level</span>
        <select value={target} onChange={(e) => setTarget(Number(e.target.value))} disabled={busy} style={selStyle}>
          {Array.from({ length: 10 }, (_, i) => i + 1).filter((n) => n >= currentLevel).map((n) => (
            <option key={n} value={n}>{n}{n === currentLevel ? ' (current)' : ''}</option>
          ))}
        </select>
      </label>

      {error && <div style={{ color: 'var(--hx-bad, #e46)', fontSize: 13 }} role="alert">{error}</div>}

      {plan && plan.outstanding.length > 0 && current ? (
        <ChoicePrompt key={`${current.level}-${current.kind}`} choice={current} subclass={subclass} count={plan.outstanding.length} busy={busy} onRecord={record} />
      ) : plan ? (
        <div style={{ fontSize: 13, color: 'var(--hx-muted)' }}>
          {target > currentLevel ? `Nothing left to choose — ready to advance to level ${target}.` : `Level ${currentLevel} is fully built. Raise the target to keep going.`}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--hx-muted)' }}>Loading…</div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className={styles.hexBtnPrimary ?? styles.hexBtn} disabled={busy || !canCommit} onClick={() => void commit()}>Advance to level {target}</button>
        {plan && plan.outstanding.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>{plan.outstanding.length} choice{plan.outstanding.length === 1 ? '' : 's'} left before level {target}.</span>
        )}
      </div>
    </div>
  );
}

/** One outstanding choice, with the right input for its kind. */
function ChoicePrompt({ choice, subclass, count, busy, onRecord }: { choice: Outstanding; subclass: string; count: number; busy: boolean; onRecord: (c: Record<string, unknown>) => void | Promise<void> }) {
  return (
    <div style={{ border: '1px solid var(--line, #2a3b47)', borderRadius: 8, padding: 12, display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--hx-muted)' }}>Choice 1 of {count} · level {choice.level}</div>
      <div style={{ fontWeight: 600 }}>{choice.label}</div>
      {choice.kind === 'ability-boosts'
        ? <BoostsInput count={choice.count ?? 2} busy={busy} onPick={(attributes) => onRecord({ level: choice.level, kind: choice.kind, attributes })} />
        : <PickOne options={optionsFor(choice, subclass)} placeholder={placeholderFor(choice.kind)} busy={busy} onPick={(value) => onRecord({ level: choice.level, kind: choice.kind, value })} />}
    </div>
  );
}

/** The option list for a choice: the plan's own options (subclass power / specialization / capstone) when
 *  present, else the right IG catalog (feats by category, skills, trait benefits). */
function optionsFor(choice: Outstanding, _subclass: string): string[] {
  if (choice.options?.length) return choice.options;
  if (choice.kind === 'feat-general') return IG_FEATS.filter((f) => f.category === 'General').map((f) => f.name);
  if (choice.kind === 'feat-combat') return IG_FEATS.filter((f) => f.category === 'Combat').map((f) => f.name);
  if (choice.kind === 'skill-proficiency') return systemSkills('intuitive-games').map((s) => s.name);
  if (choice.kind === 'trait') return TRAIT_BENEFITS;
  return [];
}
function placeholderFor(kind: Kind): string {
  if (kind.startsWith('feat')) return '— choose a feat —';
  if (kind === 'skill-proficiency') return '— choose a skill —';
  if (kind === 'trait') return '— choose a trait benefit —';
  return '— choose —';
}

function PickOne({ options, placeholder, busy, onPick }: { options: string[]; placeholder: string; busy: boolean; onPick: (v: string) => void }) {
  const opts = useMemo(() => [...new Set(options)].sort(), [options]);
  const [value, setValue] = useState('');
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <select value={value} onChange={(e) => setValue(e.target.value)} disabled={busy} style={{ ...selStyle, minWidth: 220 }}>
        <option value="">{placeholder}</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <button className={styles.hexBtn} disabled={busy || !value.trim()} onClick={() => onPick(value.trim())}>Record</button>
    </div>
  );
}

function BoostsInput({ count, busy, onPick }: { count: number; busy: boolean; onPick: (v: string[]) => void }) {
  const [picks, setPicks] = useState<string[]>([]);
  const toggle = (a: string) => setPicks((p) => (p.includes(a) ? p.filter((x) => x !== a) : p.length < count ? [...p, a] : p));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {IG_ATTRS.map((a) => {
          const on = picks.includes(a);
          return (
            <button key={a} type="button" onClick={() => toggle(a)} disabled={busy || (!on && picks.length >= count)} className={styles.hexBtn} style={{ opacity: on ? 1 : 0.6, borderColor: on ? 'var(--hx-accent, #4cf)' : undefined }}>
              {on ? '✓ ' : ''}{a}
            </button>
          );
        })}
      </div>
      <div><button className={styles.hexBtn} disabled={busy || picks.length !== count} onClick={() => onPick(picks)}>Record {picks.length}/{count}</button></div>
    </div>
  );
}
