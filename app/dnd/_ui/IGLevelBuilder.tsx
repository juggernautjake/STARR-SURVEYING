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
import { igOtherSubclassOptions } from '@/lib/dnd/slots/walker-options';
import { igMulticlassDedicationName, igMulticlassTargets } from '@/lib/dnd/systems/intuitive-games/levelup';
import { systemSkills } from '@/lib/dnd/system-rules';
import SlotSteps from './builder/SlotSteps';
import { slotSteps, resolveSlotFocus } from '@/lib/dnd/builder/slot-steps';

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
  // The last refusal the route flagged as overridable (slot plan S6d).
  const [refused, setRefused] = useState<Record<string, unknown> | null>(null);
  // Which outstanding choice is on screen (P5-7b). Null = the first one, this walker's previous behaviour.
  const [focusId, setFocusId] = useState<string | null>(null);

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

  // The outstanding list as SCREENS (P5-7b). IG's level 1 alone owes a Combat Feat AND a General Feat, so
  // even the first level had two choices the one-screen walker showed one at a time.
  const steps = useMemo(() => slotSteps(plan?.outstanding), [plan?.outstanding]);
  const focus = resolveSlotFocus(steps, focusId);
  const current = focus ? plan?.outstanding?.[focus.position - 1] ?? null : null;

  const record = useCallback(async (choice: Record<string, unknown>, acceptException = false) => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/ig-levels`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ choice, acceptException }) });
      const j = await r.json();
      if (!r.ok) {
        // The route says whether THIS refusal may be overridden; hold the exact choice so the retry sends
        // what was judged rather than something rebuilt from the form.
        setRefused(j?.canTakeAnyway ? choice : null);
        throw new Error(j?.error ?? 'Could not record that choice.');
      }
      setRefused(null);
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
      {/* The escape hatch (slot plan S6d). IG's walker now gates the POWER and the SPECIALIZATION as well
          as the slot, so a refusal is real — this is what keeps it a decision rather than a wall. */}
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

      {/* The outstanding choices, one screen each (P5-7b) */}
      {plan && steps.length > 0 && (
        <SlotSteps steps={steps} activeId={focus?.id ?? null} onSelect={setFocusId} disabled={busy} targetLevel={target} />
      )}

      {plan && plan.outstanding.length > 0 && current ? (
        <ChoicePrompt key={focus?.id ?? `${current.level}-${current.kind}`} choice={current} subclass={subclass} busy={busy} onRecord={record} />
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
function ChoicePrompt({ choice, subclass, busy, onRecord }: { choice: Outstanding; subclass: string; busy: boolean; onRecord: (c: Record<string, unknown>) => void | Promise<void> }) {
  return (
    <div style={{ border: '1px solid var(--line, #2a3b47)', borderRadius: 8, padding: 12, display: 'grid', gap: 8 }}>
      {/* The remaining count moved to the screen strip above (P5-7b); this names the screen's level. */}
      <div style={{ fontSize: 12, color: 'var(--hx-muted)' }}>Level {choice.level}</div>
      <div style={{ fontWeight: 600 }}>{choice.label}</div>
      {choice.kind === 'ability-boosts'
        ? <BoostsInput count={choice.count ?? 2} busy={busy} onPick={(attributes) => onRecord({ level: choice.level, kind: choice.kind, attributes })} />
        : <PickOne options={optionsFor(choice, subclass)} others={otherSubclassOptions(choice)}
            othersLabel={`⊘ Not on ${subclass || 'this subclass'}’s list — needs an exception`}
            placeholder={placeholderFor(choice.kind)} busy={busy} onPick={(value) => onRecord({ level: choice.level, kind: choice.kind, value })} kindLabel={choice.label} />}
    </div>
  );
}

/** The option list for a choice: the plan's own options (subclass power / specialization / capstone) when
 *  present, else the right IG catalog (feats by category, skills, trait benefits). */
function optionsFor(choice: Outstanding, subclass: string): string[] {
  if (choice.options?.length) return choice.options;
  // Feat slots also offer the flagged Multiclass Dedication house-rule (MC-IG) — dedicate into another
  // subclass to draw its powers at your subclass-power slots.
  const dedications = igMulticlassTargets(subclass).map(igMulticlassDedicationName);
  if (choice.kind === 'feat-general') return [...IG_FEATS.filter((f) => f.category === 'General').map((f) => f.name), ...dedications];
  if (choice.kind === 'feat-combat') return [...IG_FEATS.filter((f) => f.category === 'Combat').map((f) => f.name), ...dedications];
  if (choice.kind === 'skill-proficiency') return systemSkills('intuitive-games').map((s) => s.name);
  if (choice.kind === 'trait') return TRAIT_BENEFITS;
  return [];
}

/** The OTHER subclasses' powers / specializations — offered, marked, and selectable, so the escape hatch
 *  this file renders can actually be reached (S6g).
 *
 *  `/ig-levels` gates exactly two kinds — `subclass-power` and `specialization` — and `igPowerEligibility`
 *  has exactly ONE refusal for them: *"X is not a <subclass> power"*. Yet `optionsFor` handed back the
 *  plan's own scoped list, so the only pick the gate can refuse was the one pick the picker would not
 *  offer. The refusal was unreachable and so was "+ Take it anyway" — S6c built that hatch for IG's
 *  cross-subclass case specifically, and S6e proved the gate works by driving it. Nothing could get to it.
 *
 *  The decision lives in `lib/dnd/slots/walker-options.ts`, tested against the real catalog and the real
 *  eligibility core — including the bound that keeps it a usable dropdown, and why the label describes the
 *  CATALOG rather than judging the character. */
function otherSubclassOptions(choice: Outstanding): string[] {
  return igOtherSubclassOptions(choice.kind, choice.options ?? []);
}
function placeholderFor(kind: Kind): string {
  if (kind.startsWith('feat')) return '— choose a feat —';
  if (kind === 'skill-proficiency') return '— choose a skill —';
  if (kind === 'trait') return '— choose a trait benefit —';
  return '— choose —';
}

export function PickOne({ options, others = [], othersLabel, placeholder, busy, onPick, kindLabel }: { options: string[]; others?: string[]; othersLabel?: string; placeholder: string; busy: boolean; onPick: (v: string) => void; kindLabel?: string }) {
  const opts = useMemo(() => [...new Set(options)].sort(), [options]);
  const [value, setValue] = useState('');
  // A choice with NOTHING to choose from. It happens when a subclass in the taxonomy has no entry in
  // IG_CLASS_DETAILS — Champion today — so `igEntry` finds no powers/specializations and the catalog
  // fallback has none either. The level walker still (correctly) demands the choice, so an empty dropdown
  // was a dead end at levels 3/4/5/7/8/9.
  //
  // The IG catalog was SCRAPED from intuitivegames.net, so the honest response is not to invent the
  // missing list: it is to say the list isn't here and let the player type what their table uses. A typed
  // value records exactly like a picked one — the walker only needs a non-empty value.
  //
  // The S6g widening deliberately does NOT rescue this branch, even though `others` is non-empty here.
  // A Champion has no catalogued powers, so their own power is UNKNOWN — not an exception — and offering
  // "every other subclass's powers, needs an exception" would push them to flag a legal pick as altered
  // vanilla to get past a gap in our data. Free text stays the right answer for missing data; the
  // widened group is for a rule the player is knowingly stepping outside of.
  if (!opts.length) {
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        <div role="note" style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--hx-muted)', border: '1px solid var(--hx-gold-1, #c8aa6e)', background: 'rgba(200,170,110,0.08)', borderRadius: 6, padding: '6px 9px' }}>
          ⚗ We don’t have a catalogued list for {kindLabel ? <strong>{kindLabel.toLowerCase()}</strong> : 'this choice'} on this
          subclass yet — the Intuitive Games content here is transcribed from the published site, and this one isn’t in it.
          Type what your table uses and it records the same way a picked option would.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={value} onChange={(e) => setValue(e.target.value)} disabled={busy} placeholder="Type your choice…"
            style={{ ...selStyle, minWidth: 220 }} />
          <button className={styles.hexBtn} disabled={busy || !value.trim()} onClick={() => onPick(value.trim())}>Record</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <select value={value} onChange={(e) => setValue(e.target.value)} disabled={busy} style={{ ...selStyle, minWidth: 220 }}>
        <option value="">{placeholder}</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        {/* One shared reason stated ONCE on the group rather than repeated on every row — every entry
            here is out of scope for the same reason. Nothing is `disabled`: a disabled option would mark
            it correctly and still leave "+ Take it anyway" unreachable, which was the entire defect. */}
        {others.length > 0 && (
          <optgroup label={othersLabel ?? '⊘ Other subclasses — needs an exception'}>
            {others.map((o) => <option key={o} value={o}>{o}</option>)}
          </optgroup>
        )}
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
