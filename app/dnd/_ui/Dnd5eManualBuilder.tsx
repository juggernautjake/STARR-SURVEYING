'use client';
// Dnd5eManualBuilder — the vanilla, dropdown-and-roll 5e character builder (MB-2a).
//
// The one 5e edition had NO manual builder; this is it. Dropdowns for level / species / class / subclass /
// background over the real catalogs, the `StatGenPanel` for abilities (with the edition's increases folded
// in — racial for 2014, a background spread for 2024), a feat picker sized to the ASI/feat slots the class
// has by that level, and live validation. All the catalog questions come from the unit-tested
// `statgen/builder5e`; this file is the binding. Colours are `var(--hx-*, <fallback>)` so it reads on every
// skin. Assembling + persisting the character is MB-2b (via `onBuild`).
import React from 'react';
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';
import { ABILITIES } from '@/app/dnd/_sheet/rules/dnd';
import { speciesCatalogFor } from '@/lib/dnd/species/view';
import { classesForSystem } from '@/lib/dnd/classes/registry';
import { backgroundsForSystem } from '@/lib/dnd/backgrounds/index';
import { featCatalogForSystem } from '@/lib/dnd/feats/catalog';
import {
  dnd5eSpeciesIncreases,
  dnd5eBackgroundAbilities,
  dnd5eSubclassLevelFor,
  dnd5eFeatSlotsAtLevel,
  dnd5eSubclassOptions,
  dnd5eValidatePicks,
} from '@/lib/dnd/statgen/builder5e';
import { applyAbilityIncreases5e } from '@/lib/dnd/statgen/dnd5e';
import StatGenPanel, { type StatGenMethod } from './StatGenPanel';

const LINE = 'var(--hx-line, rgba(130,132,140,0.30))';
const INSET = 'var(--hx-inset, rgba(130,132,140,0.06))';
const selectStyle: React.CSSProperties = {
  fontSize: 13.5, padding: '6px 9px', borderRadius: 7, width: '100%',
  background: 'var(--hx-inset-strong, rgba(130,132,140,0.10))', color: 'inherit', border: `1px solid ${LINE}`,
};
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label style={{ display: 'grid', gap: 4, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.7 }}>
    {label}
    <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 'normal' }}>{children}</span>
  </label>
);

export interface Dnd5eBuildResult {
  picks: { system: string; level: number; species?: string; className?: string; subclass?: string; background?: string };
  abilities: Record<AbilityKey, number>;
  feats: string[];
}

export default function Dnd5eManualBuilder({
  system,
  characterId,
  onBuild,
}: {
  system: string;
  /** When set (and no `onBuild`), the builder persists via POST /dnd5e-build then reloads, like the PF2/IG
   *  builders — so it works standalone. Provide `onBuild` to intercept instead. */
  characterId?: string;
  onBuild?: (result: Dnd5eBuildResult) => void;
}) {
  const [saving, setSaving] = React.useState(false);
  const is2024 = system === 'dnd5e-2024';
  const speciesList = React.useMemo(() => speciesCatalogFor(system), [system]);
  const classList = React.useMemo(() => classesForSystem(system), [system]);
  const bgList = React.useMemo(() => backgroundsForSystem(system), [system]);
  const featList = React.useMemo(() => featCatalogForSystem(system), [system]);

  const [level, setLevel] = React.useState(1);
  const [species, setSpecies] = React.useState('');
  const [className, setClassName] = React.useState('');
  const [subclass, setSubclass] = React.useState('');
  const [background, setBackground] = React.useState('');
  const [method, setMethod] = React.useState<StatGenMethod>('standard');
  const [base, setBase] = React.useState<Record<AbilityKey, number>>({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 });
  const [bgSpread, setBgSpread] = React.useState<Partial<Record<AbilityKey, number>>>({});
  const [feats, setFeats] = React.useState<string[]>([]);

  const subLevel = dnd5eSubclassLevelFor(system, className);
  const subclassUnlocked = subLevel > 0 && level >= subLevel;
  const subOptions = dnd5eSubclassOptions(system, className);
  const featSlots = dnd5eFeatSlotsAtLevel(system, className, level);
  const bgAbils = dnd5eBackgroundAbilities(system, background);

  // The increases fed to the panel: 2014 racial (fixed by species), or the 2024 background spread (assigned).
  const racial = is2024 ? {} : dnd5eSpeciesIncreases(system, species);
  const increases = is2024 ? bgSpread : racial;

  const validation = dnd5eValidatePicks({ system, level, species: species || undefined, className: className || undefined, subclass: subclass || undefined, background: background || undefined });
  const bgSpreadTotal = ABILITIES.reduce((s, a) => s + (bgSpread[a.key] ?? 0), 0);
  const bgSpreadOk = !is2024 || !background || bgSpreadTotal === 3; // +2/+1 or +1/+1/+1
  const canBuild = validation.valid && bgSpreadOk && !saving;

  const finalAbilities = applyAbilityIncreases5e(base, increases);

  const doBuild = async (result: Dnd5eBuildResult) => {
    if (onBuild) return onBuild(result);
    if (!characterId) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/dnd5e-build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...result.picks, abilities: result.abilities, backgroundAbilities: is2024 ? bgSpread : undefined, feats: result.feats }),
      });
      if (!r.ok) throw new Error(String(r.status));
      window.location.reload();
    } catch {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16, border: `1px solid ${LINE}`, borderRadius: 12, padding: 16, background: INSET }}>
      <div style={{ fontSize: 16, fontWeight: 800 }}>Manual build{is2024 ? ' — D&D 2024' : ' — D&D 2014'}</div>

      {/* Core dropdowns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Field label="Level">
          <select value={level} onChange={(e) => setLevel(Number(e.target.value))} style={selectStyle}>
            {Array.from({ length: 20 }, (_, i) => i + 1).map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>
        <Field label={is2024 ? 'Species' : 'Race'}>
          <select value={species} onChange={(e) => setSpecies(e.target.value)} style={selectStyle}>
            <option value="">—</option>
            {speciesList.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Class">
          <select value={className} onChange={(e) => { setClassName(e.target.value); setSubclass(''); }} style={selectStyle}>
            <option value="">—</option>
            {classList.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
          </select>
        </Field>
        {subclassUnlocked && (
          <Field label="Subclass">
            <select value={subclass} onChange={(e) => setSubclass(e.target.value)} style={selectStyle}>
              <option value="">—</option>
              {subOptions.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Background">
          <select value={background} onChange={(e) => { setBackground(e.target.value); setBgSpread({}); }} style={selectStyle}>
            <option value="">—</option>
            {bgList.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
          </select>
        </Field>
      </div>

      {/* 2024 background ability spread */}
      {is2024 && bgAbils.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>Background increase — assign +2/+1 (or +1/+1/+1), total +3:</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {bgAbils.map((a) => (
              <label key={a} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <strong>{a.toUpperCase()}</strong>
                <select value={bgSpread[a] ?? 0} onChange={(e) => setBgSpread((cur) => ({ ...cur, [a]: Number(e.target.value) }))} style={{ ...selectStyle, width: 64 }}>
                  <option value={0}>—</option>
                  <option value={1}>+1</option>
                  <option value={2}>+2</option>
                </select>
              </label>
            ))}
            <span style={{ fontSize: 12, opacity: 0.7, alignSelf: 'center' }}>assigned +{bgSpreadTotal}</span>
          </div>
        </div>
      )}

      {/* Ability scores */}
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700 }}>Ability scores</div>
        <StatGenPanel value={base} onChange={setBase} method={method} onMethodChange={setMethod} increases={increases} increaseLabel={is2024 ? 'Backg.' : 'Racial'} />
      </div>

      {/* Feats */}
      {featSlots > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>
            Feats — {featSlots} ASI/feat slot{featSlots === 1 ? '' : 's'} by level {level} ({feats.length} chosen)
          </div>
          {featList.length === 0 ? (
            <div style={{ fontSize: 12.5, opacity: 0.7 }}>No feat catalog for this edition yet — take ASIs, or add feats later on the sheet.</div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxHeight: 160, overflowY: 'auto' }}>
              {featList.map((f) => {
                const on = feats.includes(f.name);
                const full = !on && feats.length >= featSlots;
                return (
                  <button key={f.name} type="button" disabled={full}
                    onClick={() => setFeats((cur) => on ? cur.filter((x) => x !== f.name) : [...cur, f.name])}
                    style={{ fontSize: 12, padding: '4px 9px', borderRadius: 6, cursor: full ? 'default' : 'pointer', opacity: full ? 0.45 : 1,
                      border: `1px solid ${on ? 'var(--hx-gold-1, #8a6d3b)' : LINE}`, background: on ? 'var(--hx-inset-strong, rgba(130,132,140,0.14))' : 'none', color: 'inherit' }}>
                    {on ? '✓ ' : ''}{f.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Validation + build */}
      {(!validation.valid || !bgSpreadOk) && (
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--hx-danger, #c0392b)', fontSize: 12.5 }}>
          {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
          {!bgSpreadOk && <li>Background increase must total +3 (+2/+1 or +1/+1/+1).</li>}
        </ul>
      )}
      <button type="button" disabled={!canBuild}
        onClick={() => doBuild({ picks: { system, level, species: species || undefined, className: className || undefined, subclass: subclass || undefined, background: background || undefined }, abilities: finalAbilities, feats })}
        style={{ justifySelf: 'start', fontSize: 14, fontWeight: 700, padding: '9px 18px', borderRadius: 9, cursor: canBuild ? 'pointer' : 'default', opacity: canBuild ? 1 : 0.5,
          border: `1px solid var(--hx-gold-1, #8a6d3b)`, background: 'var(--hx-inset-strong, rgba(130,132,140,0.14))', color: 'inherit' }}>
        {saving ? 'Building…' : 'Build character'}
      </button>
    </div>
  );
}
