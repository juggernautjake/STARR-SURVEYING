'use client';
// app/dnd/_ui/MulticlassManager.tsx — the intuitive 5e MULTICLASS level manager (MC-5e-4).
//
// A D&D-Beyond-style panel: one row per class with −/+ level steppers, an "add a class" picker (each option
// annotated with its multiclass ability prerequisite), and a LIVE aggregated summary computed by the tested
// `multiclassSnapshot` engine — total level, proficiency, HP, combined spell slots, warlock pact — so you see
// exactly what a class split produces before saving. Saves `data.meta.classes` via the /classes route. The
// per-level feature/subclass choices still live in the LevelBuilder below; this manages the class SPLIT.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hextech.module.css';
import { classesForSystem, findClass } from '@/lib/dnd/classes/registry';
import { multiclassSnapshot, meetsMulticlassPrereq, multiclassPrereqFor, formatClassLevels, isMulticlass } from '@/lib/dnd/classes/engine';
import type { ClassLevel } from '@/lib/dnd/classes/types';
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';

const CAP = 20;

export default function MulticlassManager({ characterId, system, initialClasses, abilities }: {
  characterId: string;
  system: string;
  initialClasses: ClassLevel[];
  /** Best-available ability scores, used only to ANNOTATE the multiclass prerequisites (a hint, not a hard
   *  block — mirrors the flag-don't-block rule; the server enforces the real caps). */
  abilities?: Partial<Record<AbilityKey, number>>;
}) {
  const router = useRouter();
  const [classes, setClasses] = useState<ClassLevel[]>(initialClasses);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const all = classesForSystem(system);
  const nameFor = (key: string) => findClass(system, key)?.name ?? key;
  const lookup = (key: string) => { const def = findClass(system, key); return def ? { def, sub: null } : null; };
  const snap = multiclassSnapshot(classes, lookup);
  const total = snap.totalLevel;
  const atCap = total >= CAP;

  const setLevel = (i: number, level: number) => setClasses((cs) => cs.map((c, j) => (j === i ? { ...c, level: Math.max(1, Math.min(CAP, level)) } : c)));
  const removeClass = (i: number) => setClasses((cs) => cs.filter((_, j) => j !== i));
  const addClass = (key: string) => { if (key && !classes.some((c) => c.classKey === key)) setClasses((cs) => [...cs, { classKey: key, level: 1 }]); };

  const prereqLabel = (key: string): string => {
    const p = multiclassPrereqFor(key);
    if (!p) return '';
    return `${p.abilities.map((a) => a.toUpperCase()).join(p.mode === 'any' ? ' or ' : ' & ')} ${p.minScore}`;
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/classes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ classes }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error ?? 'Could not save the class split.'); return; }
      setMsg('Saved.');
      router.refresh();
    } catch { setMsg('Network error — please try again.'); } finally { setSaving(false); }
  };

  const stepBtn: React.CSSProperties = { fontSize: 15, fontWeight: 800, lineHeight: 1, width: 26, height: 26, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--hx-line)', background: 'var(--hx-inset-strong)', color: 'var(--hx-text)' };
  const addable = all.filter((c) => !classes.some((x) => x.classKey === c.key));

  return (
    <div className={styles.framedPanel} style={{ margin: '10px 0', padding: '14px 16px', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontFamily: 'var(--hx-font-display)', fontWeight: 700, fontSize: 15, color: 'var(--hx-gold-2)', letterSpacing: '0.04em' }}>Class levels</strong>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--hx-teal-1)' }}>{isMulticlass(classes) ? formatClassLevels(classes, nameFor) : ''} · total {total} / {CAP}</span>
      </div>

      <div style={{ display: 'grid', gap: 7 }}>
        {classes.map((c, i) => (
          <div key={c.classKey} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', border: '1px solid var(--hx-line)', borderRadius: 8, padding: '7px 11px' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--hx-text)', minWidth: 110 }}>{nameFor(c.classKey)}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <button type="button" aria-label={`Lower ${nameFor(c.classKey)} level`} onClick={() => setLevel(i, c.level - 1)} disabled={c.level <= 1} style={{ ...stepBtn, opacity: c.level <= 1 ? 0.4 : 1 }}>−</button>
              <strong style={{ fontSize: 16, fontWeight: 800, minWidth: 24, textAlign: 'center', color: 'var(--hx-text)' }}>{c.level}</strong>
              <button type="button" aria-label={`Raise ${nameFor(c.classKey)} level`} onClick={() => setLevel(i, c.level + 1)} disabled={atCap} style={{ ...stepBtn, opacity: atCap ? 0.4 : 1 }}>+</button>
            </span>
            {classes.length > 1 && (
              <button type="button" aria-label={`Remove ${nameFor(c.classKey)}`} onClick={() => removeClass(i)} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, background: 'none', border: '1px solid var(--hx-line)', color: 'var(--hx-muted)', borderRadius: 6, padding: '4px 9px', cursor: 'pointer' }}>Remove</button>
            )}
          </div>
        ))}
      </div>

      {!atCap && addable.length > 0 && (
        <label style={{ display: 'grid', gap: 4, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--hx-muted)' }}>
          Add a class (multiclass)
          <select value="" onChange={(e) => addClass(e.target.value)} style={{ fontSize: 13.5, fontWeight: 500, padding: '6px 9px', background: 'var(--hx-inset-strong)', color: 'var(--hx-text)', border: '1px solid var(--hx-line)', borderRadius: 7, textTransform: 'none', letterSpacing: 'normal', maxWidth: 360 }}>
            <option value="">+ add a class…</option>
            {addable.map((c) => {
              const pre = prereqLabel(c.key);
              const ok = meetsMulticlassPrereq(c.key, abilities ?? {});
              return <option key={c.key} value={c.key}>{c.name}{pre ? ` — needs ${pre}${!ok ? ' (not met)' : ''}` : ''}</option>;
            })}
          </select>
        </label>
      )}

      {/* Live aggregated preview — the whole point: every synergy resolved before you save. */}
      <div style={{ display: 'grid', gap: 3, fontSize: 13, color: 'var(--hx-text)', border: '1px solid var(--hx-teal-2)', borderRadius: 8, padding: '9px 12px', background: 'rgba(10,200,185,0.06)' }}>
        <div><strong style={{ color: 'var(--hx-teal-1)' }}>Total level {total}</strong> · Proficiency +{snap.proficiencyBonus} · HP (before CON) {snap.hitPointsBeforeCon}{snap.casterLevel ? ` · caster level ${snap.casterLevel}` : ''}</div>
        {snap.spellSlots && (
          <div style={{ color: 'var(--hx-muted)' }}>Spell slots: {snap.spellSlots.slice(1).map((n, r) => (n ? `${n}×R${r + 1}` : '')).filter(Boolean).join(' · ') || 'none'}{snap.spellcastingClassCount >= 2 ? ' (multiclass table)' : ''}</div>
        )}
        {snap.pact && <div style={{ color: 'var(--hx-muted)' }}>Pact magic: {snap.pact.slots}×R{snap.pact.rank}</div>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save class split'}</button>
        {msg && <span style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>{msg}</span>}
        <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>Set the LEVEL in each class here; make each level&rsquo;s feature and subclass choices in the walker below.</span>
      </div>
    </div>
  );
}
