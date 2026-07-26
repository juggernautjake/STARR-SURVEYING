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
import { useRouter } from 'next/navigation';
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';
import { ABILITIES } from '@/app/dnd/_sheet/rules/dnd';
import { speciesCatalogFor } from '@/lib/dnd/species/view';
import { classesForSystem } from '@/lib/dnd/classes/registry';
import { backgroundsForSystem } from '@/lib/dnd/backgrounds/index';
import { featCatalogForSystem } from '@/lib/dnd/feats/catalog';
import { featEligibilityForSystem } from '@/lib/dnd/feats/eligibility';
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
import TakeAnyway from './builder/TakeAnyway';
import { unlockOffer } from '@/lib/dnd/slots/entitlement';
import type { SheetVariantKind } from '@/lib/dnd/system-variants';

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
  /** Feats taken through the escape hatch despite the rules refusing them (slot plan S6). Names only —
   *  the server records the REASON from its own gate, so a caller cannot author a flattering one. */
  exceptions: string[];
}

export default function Dnd5eManualBuilder({
  system,
  characterId,
  onBuild,
  layout = 'panel',
  aiConfigured = false,
  variantKind = 'vanilla',
  isDM = false,
}: {
  system: string;
  /** When set (and no `onBuild`), the builder persists via POST /dnd5e-build then reloads, like the PF2/IG
   *  builders — so it works standalone. Provide `onBuild` to intercept instead. */
  characterId?: string;
  onBuild?: (result: Dnd5eBuildResult) => void;
  /** 'panel' (default) shows every field at once — the sheet-page builder. 'steps' walks the SAME fields
   *  one section at a time with Prev/Next, for the guided /builder wizard (B3). Same state, validation,
   *  and POST — only the presentation differs. */
  layout?: 'panel' | 'steps';
  /** When true, show an "ask AI" box (parity with the PF2/IG builders) that sends a natural-language
   *  instruction to the shared ai-edit route — so a player can build with AI or ask AI to tweak mid-build,
   *  while the dropdowns stay the primary, manual path. */
  aiConfigured?: boolean;
  /** The character's build kind, which decides whether the rules bind at all. Defaults to `vanilla` so a
   *  caller that doesn't know still gets the gate — failing closed is the whole point of the 5e gate. */
  variantKind?: SheetVariantKind;
  /** A DM's picks are recorded as `dm-granted` rather than as the player's own exception. */
  isDM?: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [fstep, setFstep] = React.useState(0); // which foundation section is shown in 'steps' layout
  const [aiPrompt, setAiPrompt] = React.useState('');
  const [aiBusy, setAiBusy] = React.useState(false);
  const [aiMsg, setAiMsg] = React.useState<string | null>(null);
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
  // Feats taken THROUGH THE HATCH. A subset of `feats` — an exception is still a pick, it just carries a
  // record of the rule it broke. Kept as its own list rather than a flag on each chip so the POST can name
  // exactly what the player acknowledged, which is what the server matches its own refusals against.
  const [exceptions, setExceptions] = React.useState<string[]>([]);
  const offer = React.useMemo(() => unlockOffer({ isDM, kind: variantKind }), [isDM, variantKind]);

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
        body: JSON.stringify({ ...result.picks, abilities: result.abilities, backgroundAbilities: is2024 ? bgSpread : undefined, feats: result.feats, exceptions: result.exceptions }),
      });
      if (!r.ok) throw new Error(String(r.status));
      window.location.reload();
    } catch {
      setSaving(false);
    }
  };

  // Ask AI (parity with PF2/IG) — send a natural-language instruction to the shared ai-edit route, so a
  // player can have AI build or tweak the character mid-build. The manual dropdowns stay the primary path.
  const askAi = async () => {
    if (!characterId || !aiPrompt.trim() || aiBusy) return;
    setAiBusy(true); setAiMsg(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/ai-edit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instruction: aiPrompt }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setAiMsg(j.error ?? 'AI could not apply that.'); return; }
      setAiMsg('Done — the character was updated.');
      setAiPrompt('');
      router.refresh();
    } catch { setAiMsg('Network error — please try again.'); } finally { setAiBusy(false); }
  };
  const aiBlock = aiConfigured && characterId ? (
    <div style={{ display: 'grid', gap: 6, padding: '8px 10px', border: '1px solid var(--hx-line, rgba(130,132,140,0.30))', borderRadius: 8, background: 'rgba(200,170,110,0.05)' }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--hx-gold-2, #c8aa6e)' }}>✨ ASK AI (build or tweak this character)</span>
      <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={2} placeholder="e.g. make this a level 8 Battle Master fighter with the Sentinel feat and a longsword" style={{ ...selectStyle, resize: 'vertical', fontFamily: 'inherit' }} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" disabled={aiBusy || !aiPrompt.trim()} onClick={askAi}
          style={{ fontSize: 13, fontWeight: 700, padding: '6px 14px', borderRadius: 8, cursor: aiBusy || !aiPrompt.trim() ? 'default' : 'pointer', opacity: aiBusy || !aiPrompt.trim() ? 0.5 : 1, border: '1px solid var(--hx-gold-1, #8a6d3b)', background: 'var(--hx-inset-strong, rgba(130,132,140,0.14))', color: 'inherit' }}>
          {aiBusy ? 'Working…' : '✨ Ask AI'}
        </button>
        {aiMsg && <span style={{ fontSize: 12, opacity: 0.75 }}>{aiMsg}</span>}
      </div>
      <span style={{ fontSize: 10.5, opacity: 0.65 }}>The dropdowns below are the manual path; AI is here for help or quick tweaks. You can also edit with AI later from the sheet.</span>
    </div>
  ) : null;

  // ── Section nodes — defined once, then arranged by `layout` (panel = all at once; steps = one at a time,
  //    same state/validation/POST). Extracting them keeps the two layouts from drifting. ─────────────────
  const levelField = (
    <Field label="Level">
      <select value={level} onChange={(e) => setLevel(Number(e.target.value))} style={selectStyle}>
        {Array.from({ length: 20 }, (_, i) => i + 1).map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
    </Field>
  );
  // Homebrew must READ as homebrew here. The 2024 catalogs deliberately include authored-but-custom
  // content — the Pugilist class and the Rangor species — and each one's data says, in so many words,
  // "flagged `custom` so the picker badges it". But every option rendered its bare name, so in the VANILLA
  // builder, whose own copy promises "everything offered is vanilla and rules-legal", they sat in the lists
  // looking exactly like PHB content. An <option> can't carry markup, so the marker goes in the text.
  const optionLabel = (o: { name: string; custom?: { authorName?: string } | undefined }) =>
    o.custom ? `${o.name} — homebrew${o.custom.authorName ? ` (${o.custom.authorName})` : ''}` : o.name;
  const speciesField = (
    <Field label={is2024 ? 'Species' : 'Race'}>
      <select value={species} onChange={(e) => setSpecies(e.target.value)} style={selectStyle}>
        <option value="">—</option>
        {speciesList.map((s) => <option key={s.name} value={s.name}>{optionLabel(s)}</option>)}
      </select>
    </Field>
  );
  const pickedClassCustom = classList.find((c) => c.key === className)?.custom;
  const pickedSubCustom = subOptions.find((s) => s.key === subclass)?.custom;
  const pickedSpeciesCustom = speciesList.find((s) => s.name === species)?.custom;
  const pickedCustom = pickedClassCustom ?? pickedSubCustom ?? pickedSpeciesCustom;
  // A suffix in a closed <select> is easy to skim past, and the consequence — a character that is not
  // rules-legal for organised/vanilla play — outlives the moment of picking. So a selected homebrew choice
  // also says so standing, next to the control, the way the rest of the platform marks provenance.
  const homebrewNotice = pickedCustom ? (
    <div role="note" style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, lineHeight: 1.5, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--hx-gold-1, #c8aa6e)', background: 'rgba(200,170,110,0.10)', color: 'var(--hx-text)' }}>
      <span aria-hidden>⚗</span>
      <span>
        This build uses <strong>homebrew</strong>{pickedCustom.authorName ? ` by ${pickedCustom.authorName}` : ''} — it is fully authored and plays like any other {pickedSpeciesCustom && !pickedClassCustom && !pickedSubCustom ? 'species' : 'class'}, but it is <strong>not</strong> official {is2024 ? '2024' : '2014'} content. A DM running a vanilla-only table may not allow it.
      </span>
    </div>
  ) : null;
  const classField = (
    <Field label="Class">
      <select value={className} onChange={(e) => { setClassName(e.target.value); setSubclass(''); }} style={selectStyle}>
        <option value="">—</option>
        {classList.map((c) => <option key={c.key} value={c.key}>{optionLabel(c)}</option>)}
      </select>
    </Field>
  );
  const subclassField = subclassUnlocked ? (
    <Field label="Subclass">
      <select value={subclass} onChange={(e) => setSubclass(e.target.value)} style={selectStyle}>
        <option value="">—</option>
        {subOptions.map((s) => <option key={s.key} value={s.key}>{optionLabel(s)}</option>)}
      </select>
    </Field>
  ) : null;
  const backgroundField = (
    <Field label="Background">
      <select value={background} onChange={(e) => { setBackground(e.target.value); setBgSpread({}); }} style={selectStyle}>
        <option value="">—</option>
        {bgList.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
      </select>
    </Field>
  );
  const bgSpreadNode = is2024 && bgAbils.length > 0 ? (
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
  ) : null;
  const abilitiesNode = (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700 }}>Ability scores</div>
      <StatGenPanel value={base} onChange={setBase} method={method} onMethodChange={setMethod} increases={increases} increaseLabel={is2024 ? 'Backg.' : 'Racial'} />
    </div>
  );
  // One verdict per catalogued feat, for the level/abilities/picks currently on screen. Memoised on the
  // things that actually change it, so dragging an ability score doesn't re-judge the catalog per keystroke
  // but DOES re-judge it once the score lands (an ability prerequisite can flip either way).
  const featVerdicts = React.useMemo(() => {
    const m = new Map<string, { ok: boolean; reason?: string }>();
    for (const f of featList) {
      m.set(f.name, featEligibilityForSystem(system, f.key ?? f.name, {
        slot: 'asi',                       // this control spends ASI/feat slots; other slots have their own UI
        level,
        abilities: finalAbilities,
        className: className || undefined, // 2014's rule needs the class; 2024's ignores it
        takenFeatureNames: feats,          // resolved against the edition's own catalog by the gate
      }));
    }
    return m;
  }, [featList, system, level, finalAbilities, className, feats]);
  const eligibilityOf = (f: { name: string }) => featVerdicts.get(f.name) ?? { ok: true };
  const ineligibleCount = featList.reduce((n, f) => n + (!feats.includes(f.name) && !eligibilityOf(f).ok ? 1 : 0), 0);
  // What the hatch can offer: the feats the rules refuse and the player has not already taken. Built from
  // the same verdict map the chips read, so the reason shown in the hatch is the reason on the chip.
  const blockedFeats = React.useMemo(
    () => featList
      .filter((f) => !feats.includes(f.name) && !(featVerdicts.get(f.name)?.ok ?? true))
      .map((f) => ({ name: f.name, ...(featVerdicts.get(f.name)?.reason ? { reason: featVerdicts.get(f.name)!.reason } : {}) })),
    [featList, featVerdicts, feats],
  );
  // What you CAN take, first. Once the eligibility gate went in, a level-8 Fighter's list was 31 struck-
  // through entries with five live ones scattered through them, inside a 160px scroller — so the player
  // had to hunt for the handful of legal picks among the ones the app had just ruled out. Sorting is a
  // stable partition (catalog order preserved inside each group), so the list doesn't reshuffle as
  // eligibility changes with level or ability scores; the ineligible ones stay visible, and greyed,
  // because "why can't I take Alert?" is a question the list should still answer.
  const orderedFeats = React.useMemo(() => {
    // Reads `featVerdicts` directly rather than through the `eligibilityOf` helper: the helper is a fresh
    // closure every render, so depending on it would re-partition the whole catalog on each keystroke and
    // defeat the memo. The map is the real input, and it IS in the dependency list.
    const chosenOrOk: typeof featList = [], blocked: typeof featList = [];
    for (const f of featList) {
      const ok = feats.includes(f.name) || (featVerdicts.get(f.name)?.ok ?? true);
      (ok ? chosenOrOk : blocked).push(f);
    }
    return [...chosenOrOk, ...blocked];
  }, [featList, featVerdicts, feats]);

  const featsNode = featSlots > 0 ? (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700 }}>
        Feats — {featSlots} ASI/feat slot{featSlots === 1 ? '' : 's'} by level {level} ({feats.length} chosen)
      </div>
      {featList.length === 0 ? (
        <div style={{ fontSize: 12.5, opacity: 0.7 }}>No feat catalog for this edition yet — take ASIs, or add feats later on the sheet.</div>
      ) : (
        <>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxHeight: 160, overflowY: 'auto' }}>
          {orderedFeats.map((f) => {
            const on = feats.includes(f.name);
            const full = !on && feats.length >= featSlots;
            // The eligibility gate. This picker's own copy says "Only rules-legal picks are offered" and
            // the wizard says "ineligible picks are greyed with the reason" — but the ONLY thing it
            // disabled was a full slot list, so at level 4 it happily offered Epic Boons (level 19+),
            // Origin feats (those come from your background) and Fighting Styles (a class feature, not an
            // ASI pick). `featEligibilityForSystem` already knew every one of those rules; nothing called
            // it from here. It fails closed for both 5e editions and returns ok for a system it doesn't
            // own, so this cannot start refusing picks on PF2/IG.
            const verdict = eligibilityOf(f);
            const blocked = !on && !verdict.ok;
            const disabled = full || blocked;
            const why = blocked ? verdict.reason : (full ? `You've used all ${featSlots} slot${featSlots === 1 ? '' : 's'} — deselect one first.` : (f.prerequisiteText || undefined));
            return (
              <button key={f.name} type="button" disabled={disabled} title={why} aria-disabled={disabled || undefined}
                onClick={() => {
                  setFeats((cur) => on ? cur.filter((x) => x !== f.name) : [...cur, f.name]);
                  // Deselecting a hatch pick from its own chip must also drop the exception, or the POST
                  // would acknowledge a refusal for a feat it is no longer sending and the character would
                  // keep an "Altered vanilla" badge with nothing left to justify it.
                  if (on) setExceptions((cur) => cur.filter((x) => x !== f.name));
                }}
                style={{ fontSize: 12, padding: '4px 9px', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
                  textDecoration: blocked ? 'line-through' : undefined,
                  border: `1px solid ${on ? 'var(--hx-gold-1, #8a6d3b)' : LINE}`, background: on ? 'var(--hx-inset-strong, rgba(130,132,140,0.14))' : 'none', color: 'inherit' }}>
                {on ? '✓ ' : ''}{f.name}
              </button>
            );
          })}
        </div>
        {/* Say WHY out loud, not only on hover — a greyed row with a tooltip is invisible on touch and to
            anyone who doesn't think to hover. Counts rather than lists: the full reason is on each chip. */}
        {ineligibleCount > 0 && (
          <div style={{ fontSize: 11.5, opacity: 0.75 }}>
            {ineligibleCount} feat{ineligibleCount === 1 ? ' is' : 's are'} greyed out — not legal for an ASI slot at level {level}. Hover one for the reason.
          </div>
        )}
        {/* The escape hatch. Scoped to INELIGIBLE feats and not to the "slots full" block, because the
            server gate judges eligibility only — a hatch over the slot count would promise an exception the
            server never records, leaving the pick unbadged. Capping the slots server-side is its own change
            with its own risk to existing builds, so this offers exactly what the gate can honour. */}
        <TakeAnyway
          offer={offer}
          noun="feat"
          blocked={blockedFeats}
          taken={exceptions}
          onTake={(name) => { setFeats((cur) => cur.includes(name) ? cur : [...cur, name]); setExceptions((cur) => cur.includes(name) ? cur : [...cur, name]); }}
          onUntake={(name) => { setFeats((cur) => cur.filter((x) => x !== name)); setExceptions((cur) => cur.filter((x) => x !== name)); }}
        />
        </>
      )}
    </div>
  ) : null;
  const validationNode = !validation.valid || !bgSpreadOk ? (
    <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--hx-danger, #c0392b)', fontSize: 12.5 }}>
      {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
      {!bgSpreadOk && <li>Background increase must total +3 (+2/+1 or +1/+1/+1).</li>}
    </ul>
  ) : null;
  const buildButton = (
    <button type="button" disabled={!canBuild}
      onClick={() => doBuild({ picks: { system, level, species: species || undefined, className: className || undefined, subclass: subclass || undefined, background: background || undefined }, abilities: finalAbilities, feats, exceptions })}
      style={{ justifySelf: 'start', fontSize: 14, fontWeight: 700, padding: '9px 18px', borderRadius: 9, cursor: canBuild ? 'pointer' : 'default', opacity: canBuild ? 1 : 0.5,
        border: `1px solid var(--hx-gold-1, #8a6d3b)`, background: 'var(--hx-inset-strong, rgba(130,132,140,0.14))', color: 'inherit' }}>
      {saving ? 'Building…' : 'Build character'}
    </button>
  );

  // ── STEPS layout (B3) — the guided /builder wizard walks the SAME sections one at a time. ─────────────
  if (layout === 'steps') {
    const navBtn: React.CSSProperties = { fontSize: 13, fontWeight: 700, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${LINE}`, background: 'var(--hx-inset-strong, rgba(130,132,140,0.14))', color: 'inherit' };
    const stepDefs: { title: string; help: string; body: React.ReactNode }[] = [
      { title: 'Class & level', help: 'Choose your class (and subclass, once your level unlocks it) and the level you are building to.', body: <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>{levelField}{classField}{subclassField}{homebrewNotice}</div> },
      { title: is2024 ? 'Species' : 'Race', help: is2024 ? 'Your species sets traits; 2024 puts ability increases on your background, not here.' : 'Your race sets traits and its ability score increases (folded into the scores step).', body: <div style={{ display: 'grid', gap: 10, maxWidth: 340 }}>{speciesField}{homebrewNotice}</div> },
      { title: 'Background', help: is2024 ? 'Your background grants an origin feat and a +2/+1 (or +1/+1/+1) ability increase you assign below.' : 'Your background grants skills, tools, and a feature.', body: <div style={{ display: 'grid', gap: 12 }}><div style={{ maxWidth: 340 }}>{backgroundField}</div>{bgSpreadNode}</div> },
      { title: 'Ability scores', help: 'Set your six ability scores — standard array, point buy, or roll (use the docked roller for 4d6-drop-lowest). Increases are folded in.', body: abilitiesNode },
      { title: 'Feats & finish', help: 'Spend any ASI/feat slots your class has by this level, then build. Only rules-legal picks are offered.', body: <div style={{ display: 'grid', gap: 12 }}>{featsNode ?? <div style={{ fontSize: 12.5, opacity: 0.7 }}>No ASI/feat slots by level {level}.</div>}{validationNode}{buildButton}</div> },
    ];
    const idx = Math.min(fstep, stepDefs.length - 1);
    const cur = stepDefs[idx];
    return (
      <div style={{ display: 'grid', gap: 12, border: `1px solid ${LINE}`, borderRadius: 12, padding: 16, background: INSET }}>
        {aiBlock}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{cur.title}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Foundation {idx + 1} of {stepDefs.length}{is2024 ? ' · D&D 2024' : ' · D&D 2014'}</div>
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {stepDefs.map((s, i) => (
            <button key={i} type="button" onClick={() => setFstep(i)} title={s.title} aria-label={`Go to ${s.title}`}
              style={{ height: 5, flex: 1, borderRadius: 3, border: 'none', cursor: 'pointer', background: i <= idx ? 'var(--hx-teal-1, #0ac8b9)' : LINE }} />
          ))}
        </div>
        <div style={{ fontSize: 12.5, opacity: 0.75, lineHeight: 1.45 }}>{cur.help}</div>
        <div>{cur.body}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <button type="button" disabled={idx === 0} onClick={() => setFstep((i) => Math.max(0, i - 1))} style={{ ...navBtn, opacity: idx === 0 ? 0.4 : 1, cursor: idx === 0 ? 'default' : 'pointer' }}>← Prev</button>
          {idx < stepDefs.length - 1 && (
            <button type="button" onClick={() => setFstep((i) => Math.min(stepDefs.length - 1, i + 1))} style={navBtn}>Next →</button>
          )}
        </div>
      </div>
    );
  }

  // ── PANEL layout (default) — every field at once, as on the sheet page. ──────────────────────────────
  return (
    <div style={{ display: 'grid', gap: 16, border: `1px solid ${LINE}`, borderRadius: 12, padding: 16, background: INSET }}>
      {aiBlock}
      <div style={{ fontSize: 16, fontWeight: 800 }}>Manual build{is2024 ? ' — D&D 2024' : ' — D&D 2014'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {levelField}{speciesField}{classField}{subclassField}{backgroundField}{homebrewNotice}
      </div>
      {bgSpreadNode}
      {abilitiesNode}
      {featsNode}
      {validationNode}
      {buildButton}
    </div>
  );
}
