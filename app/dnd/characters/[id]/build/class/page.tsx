'use client';
// app/dnd/characters/[id]/build/class/page.tsx — the homebrew CLASS designer (Slice 5 UI).
//
// Describe a class in prose and the AI drafts it (via /homebrew-class), or write one yourself; the engine
// builds + reviews it (errors block the save, warnings advise), and a saved class then walks a real level
// table in the level builder like an official one.
//
// 2026-07-26 — editable draft + no AI required. The third and largest of the three designers, closing Slice
// 5's last "nice-to-have" (the feat and subclass shipped in the two slices before this).
//
// WHY THE REVIEW IS COMPUTED THE LONG WAY. The save route does
// `parseCustomClassDraft(body.draft, system) → buildCustomClass → reviewCustomClass`, and this page runs the
// SAME three pure functions in the same order on every edit. Skipping the parse and building the raw form
// state would have been simpler and subtly wrong: parse is what fills a partial hand-written draft's defaults
// (ASI ladder, skill list, subclass level), so a review that skipped it would judge a different object than
// the server judges — and the player would clear the screen and still get a 400.
//
// `resources` (per-level pools) is the one part of the model left to the AI: it is an array of per-level
// arrays and needs a grid editor of its own, which is a slice rather than a field. An AI-drafted class keeps
// whatever resources it came with; a hand-written one has none, which the engine accepts.
import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import styles from '@/app/dnd/_ui/hextech.module.css';
import { buildCustomClass, reviewCustomClass, type CustomClassDraft } from '@/lib/dnd/classes/custom';
import { parseCustomClassDraft, splitReview } from '@/lib/dnd/classes/custom-ai';
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';

type Draft = CustomClassDraft;
type Feature = Draft['features'][number];

const ABILITIES: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const HIT_DICE = [6, 8, 10, 12];
const CASTER_KINDS = ['full', 'half', 'third', 'pact'] as const;
/** The choice kinds the level walker knows how to prompt for. Blank = the feature is just granted. */
const CHOICE_KINDS = ['subclass', 'asi', 'fighting-style', 'expertise', 'cantrip', 'epic-boon', 'other'] as const;

const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const nums = (s: string) => list(s).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 20);

/** An empty draft, for authoring without the AI. `parseCustomClassDraft` fills the rest at review time. */
const blankDraft = (): Draft => ({
  name: '', system: '', description: '', hitDie: 8,
  primaryAbility: [], savingThrows: [], skillChoices: { count: 2, from: [] },
  armorProficiencies: [], weaponProficiencies: [],
  subclassLevel: 3, subclassLabel: 'Subclass', features: [],
});

export default function HomebrewClassBuilderPage() {
  const params = useParams<{ id: string }>();
  const characterId = params?.id as string;
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  // The engine's verdict on what is on screen, via the save route's exact pipeline. `system` is not editable
  // and not shown: the save route derives it from the character, so this page cannot know it and must not
  // invent an edition. The placeholder only satisfies the presence check.
  const built = useMemo(() => {
    if (!draft) return null;
    try {
      const parsed = parseCustomClassDraft({ ...draft, system: draft.system || 'set-on-save' }, draft.system || 'set-on-save');
      const definition = buildCustomClass(parsed);
      return { definition, review: splitReview(reviewCustomClass(definition)) };
    } catch {
      // A draft too incomplete to build at all: say so rather than crashing the page mid-edit.
      return { definition: null, review: { ok: false, errors: [{ field: 'draft', message: 'This draft is not complete enough to check yet.', severity: 'error' as const }], warnings: [] } };
    }
  }, [draft]);

  /**
   * PAGE-LEVEL completeness, on top of the engine's review — and found by writing the test for this page.
   *
   * The engine is deliberately permissive because the AI path needs it: `parseCustomClassDraft` defaults a
   * blank name to "Homebrew Class" and `buildCustomClass` injects the subclass feature at its declared level,
   * so an *untouched* blank draft parses, builds, and reviews CLEAN. That is correct for a draft arriving from
   * a model with fields missing; it is wrong as a thing to let someone save. Pressing "Write it myself" and
   * then "Save" would otherwise mint a class called "Homebrew Class" whose only feature the player never
   * wrote.
   *
   * Deliberately NOT fixed in `validateClassDefinition`: that function also judges the official class data,
   * where those defaults are load-bearing. Being stricter here than the server is the safe direction — the
   * dangerous one is a page that permits what the server refuses.
   */
  const unfinished = useMemo(() => {
    if (!draft) return [];
    const out: string[] = [];
    if (!draft.name.trim()) out.push('Give the class a name — an unnamed draft would save as “Homebrew Class”.');
    if (!draft.features.some((f) => f.name.trim())) out.push('Add at least one feature of your own.');
    return out;
  }, [draft]);
  const savable = !!built?.review.ok && unfinished.length === 0;

  const patch = (p: Partial<Draft>) => { setDraft((d) => (d ? { ...d, ...p } : d)); setSaved(null); };
  const patchFeature = (i: number, p: Partial<Feature>) =>
    patch({ features: (draft?.features ?? []).map((f, j) => (j === i ? { ...f, ...p } : f)) });
  const toggleAbility = (field: 'primaryAbility' | 'savingThrows', a: AbilityKey) => {
    const cur = draft?.[field] ?? [];
    patch({ [field]: cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a] } as Partial<Draft>);
  };

  async function drawWithAi() {
    if (!prompt.trim()) { setError('Describe the class you want, or write one yourself below.'); return; }
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/homebrew-class`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error ?? 'Could not draft the class.'); return; }
      const d = (j as { draft?: Partial<Draft> }).draft;
      if (d) setDraft({ ...blankDraft(), ...d } as Draft);
      setSaved(null);
    } catch { setError('Network error — please try again.'); } finally { setBusy(false); }
  }

  async function save() {
    if (!draft || !savable) return;
    setSaving(true); setError(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/homebrew-class/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error ?? 'Could not save the class.'); return; }
      setSaved(j.name ?? 'the class');
    } catch { setError('Network error — please try again.'); } finally { setSaving(false); }
  }

  const input = { padding: '9px 11px', fontSize: 14, background: 'rgba(1,10,19,0.55)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', borderRadius: 6, width: '100%' } as const;
  const label = { fontSize: 11.5, color: 'var(--hx-teal-1)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' } as const;
  const chip = (on: boolean) => ({
    fontSize: 12, padding: '4px 9px', borderRadius: 12, cursor: 'pointer',
    border: `1px solid ${on ? 'var(--hx-teal-1)' : 'var(--hx-line)'}`,
    background: on ? 'rgba(10,200,185,0.15)' : 'transparent',
    color: on ? 'var(--hx-teal-1)' : 'var(--hx-muted)',
  } as const);

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 760, margin: '0 auto', display: 'grid', gap: 16 }}>
          <div>
            <a className={styles.hexBtn} href={`/dnd/characters/${characterId}`}>← Back to sheet</a>
            <h1 className={styles.title} style={{ textAlign: 'left', margin: '8px 0 0' }}>Homebrew Class Designer</h1>
            <p style={{ color: 'var(--hx-muted)', margin: '4px 0 0' }}>
              Describe a class and let the AI draft it, or write one yourself. Either way you can edit every
              field, the engine checks it as you go, and a saved class levels up like an official one.
            </p>
          </div>

          <div className={styles.framedPanel} style={{ display: 'grid', gap: 8, padding: '12px 14px' }}>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} style={input}
              placeholder="e.g. “a d10 martial class that channels storm magic — half caster on Wisdom, subclass at 3 called a Tempest Vow”" />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} disabled={busy} onClick={drawWithAi}>
                {busy ? 'Drafting…' : '✨ Draft with AI'}
              </button>
              <button type="button" className={styles.hexBtn} onClick={() => { setDraft(blankDraft()); setSaved(null); setError(null); }}>
                ✎ Write it myself
              </button>
            </div>
            {error && <div className={styles.error}>{error}</div>}
          </div>

          {draft && built && (
            <section className={styles.framedPanel} style={{ display: 'grid', gap: 12, padding: '14px 16px' }}>
              {/* Identity */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: 4, minWidth: 200, flex: 2 }}>
                  <label style={label} htmlFor="hc-name">Name</label>
                  <input id="hc-name" style={input} value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Class name" />
                </div>
                <div style={{ display: 'grid', gap: 4, width: 110 }}>
                  <label style={label} htmlFor="hc-hitdie">Hit die</label>
                  <select id="hc-hitdie" style={input} value={draft.hitDie} onChange={(e) => patch({ hitDie: Number(e.target.value) })}>
                    {HIT_DICE.map((d) => <option key={d} value={d}>d{d}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 4 }}>
                <label style={label} htmlFor="hc-desc">Description</label>
                <textarea id="hc-desc" style={input} rows={2} value={draft.description}
                  onChange={(e) => patch({ description: e.target.value })} placeholder="What this class is." />
              </div>

              {/* Abilities */}
              <div style={{ display: 'grid', gap: 4 }}>
                <span style={label}>Primary ability</span>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {ABILITIES.map((a) => (
                    <button key={a} type="button" style={chip(draft.primaryAbility.includes(a))}
                      onClick={() => toggleAbility('primaryAbility', a)}>{a.toUpperCase()}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                <span style={label}>Saving throws</span>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {ABILITIES.map((a) => (
                    <button key={a} type="button" style={chip(draft.savingThrows.includes(a))}
                      onClick={() => toggleAbility('savingThrows', a)}>{a.toUpperCase()}</button>
                  ))}
                </div>
              </div>

              {/* Progression */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: 4, width: 120 }}>
                  <label style={label} htmlFor="hc-sublevel">Subclass at</label>
                  <input id="hc-sublevel" style={input} type="number" min={0} max={20} value={draft.subclassLevel}
                    onChange={(e) => patch({ subclassLevel: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })} />
                </div>
                <div style={{ display: 'grid', gap: 4, minWidth: 160, flex: 1 }}>
                  <label style={label} htmlFor="hc-sublabel">Called</label>
                  <input id="hc-sublabel" style={input} value={draft.subclassLabel}
                    onChange={(e) => patch({ subclassLabel: e.target.value })} placeholder="e.g. Oath, Circle, Tradition" />
                </div>
                <div style={{ display: 'grid', gap: 4, minWidth: 160, flex: 1 }}>
                  {/* This drives the ASI ladder the level walker prompts from (see snapshotAtLevel), so a
                      homebrew class with an unusual ladder really does get asked at its own levels. */}
                  <label style={label} htmlFor="hc-asi">ASI levels</label>
                  <input id="hc-asi" style={input} value={(draft.asiLevels ?? []).join(', ')}
                    onChange={(e) => patch({ asiLevels: nums(e.target.value) })} placeholder="4, 8, 12, 16" />
                </div>
              </div>

              {/* Skills + proficiencies. Comma lists: they are free-text vocabularies in the model, and a
                  picker would have to invent the allowed values. */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: 4, width: 110 }}>
                  <label style={label} htmlFor="hc-skillcount">Skills</label>
                  <input id="hc-skillcount" style={input} type="number" min={0} max={8} value={draft.skillChoices.count}
                    onChange={(e) => patch({ skillChoices: { ...draft.skillChoices, count: Math.max(0, Math.min(8, Number(e.target.value) || 0)) } })} />
                </div>
                <div style={{ display: 'grid', gap: 4, minWidth: 220, flex: 1 }}>
                  <label style={label} htmlFor="hc-skillfrom">…chosen from</label>
                  <input id="hc-skillfrom" style={input} value={draft.skillChoices.from.join(', ')}
                    onChange={(e) => patch({ skillChoices: { ...draft.skillChoices, from: list(e.target.value) } })}
                    placeholder="Athletics, Insight, Perception…" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: 4, minWidth: 180, flex: 1 }}>
                  <label style={label} htmlFor="hc-armor">Armour</label>
                  <input id="hc-armor" style={input} value={draft.armorProficiencies.join(', ')}
                    onChange={(e) => patch({ armorProficiencies: list(e.target.value) })} placeholder="Light armor, Shields" />
                </div>
                <div style={{ display: 'grid', gap: 4, minWidth: 180, flex: 1 }}>
                  <label style={label} htmlFor="hc-weapons">Weapons</label>
                  <input id="hc-weapons" style={input} value={draft.weaponProficiencies.join(', ')}
                    onChange={(e) => patch({ weaponProficiencies: list(e.target.value) })} placeholder="Simple weapons" />
                </div>
              </div>

              {/* Spellcasting */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ display: 'grid', gap: 4, width: 150 }}>
                  <label style={label} htmlFor="hc-caster">Spellcasting</label>
                  <select id="hc-caster" style={input} value={draft.caster?.kind ?? ''}
                    onChange={(e) => patch(e.target.value
                      ? { caster: { kind: e.target.value as typeof CASTER_KINDS[number], ability: draft.caster?.ability ?? 'int' } }
                      : { caster: undefined })}>
                    <option value="">None</option>
                    {CASTER_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                {draft.caster && (
                  <div style={{ display: 'grid', gap: 4, width: 120 }}>
                    <label style={label} htmlFor="hc-casterab">Casting stat</label>
                    <select id="hc-casterab" style={input} value={draft.caster.ability}
                      onChange={(e) => patch({ caster: { ...draft.caster!, ability: e.target.value as AbilityKey } })}>
                      {ABILITIES.map((a) => <option key={a} value={a}>{a.toUpperCase()}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* Features */}
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={label}>Features</span>
                {draft.features.map((f, i) => (
                  <div key={i} style={{ display: 'grid', gap: 6, padding: '8px 10px', border: '1px solid var(--hx-line)', borderRadius: 6 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input style={{ ...input, width: 74 }} type="number" min={1} max={20} value={f.level}
                        onChange={(e) => patchFeature(i, { level: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })}
                        aria-label={`Feature ${i + 1} level`} />
                      <input style={{ ...input, flex: 1, minWidth: 130 }} value={f.name} placeholder="Feature name"
                        onChange={(e) => patchFeature(i, { name: e.target.value })} aria-label={`Feature ${i + 1} name`} />
                      {/* A feature can PROMPT the player at its level. Blank means it is simply granted. */}
                      <select style={{ ...input, width: 140 }} value={f.choice ?? ''}
                        onChange={(e) => patchFeature(i, { choice: (e.target.value || undefined) as Feature['choice'] })}
                        aria-label={`Feature ${i + 1} choice kind`}>
                        <option value="">granted</option>
                        {CHOICE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                      <button type="button" className="btn tiny danger"
                        onClick={() => patch({ features: draft.features.filter((_, j) => j !== i) })}>✕</button>
                    </div>
                    <textarea style={input} rows={2} value={f.body} placeholder="What it does"
                      onChange={(e) => patchFeature(i, { body: e.target.value })} aria-label={`Feature ${i + 1} rules text`} />
                  </div>
                ))}
                <button type="button" className="btn tiny" style={{ justifySelf: 'start' }}
                  onClick={() => patch({ features: [...draft.features, { level: draft.features.length ? Math.min(20, Math.max(...draft.features.map((f) => f.level)) + 1) : 1, name: '', body: '' }] })}>
                  + Add a feature
                </button>
              </div>

              {/* The engine's live verdict, plus the two page-level completeness notes. */}
              {(built.review.errors.length > 0 || built.review.warnings.length > 0 || unfinished.length > 0) ? (
                <div style={{ display: 'grid', gap: 4 }}>
                  {built.review.errors.map((e, i) => <div key={`e${i}`} style={{ fontSize: 12.5, color: 'var(--hx-danger, #ff6b6b)' }}>⛔ {e.field}: {e.message}</div>)}
                  {unfinished.map((u, i) => <div key={`u${i}`} style={{ fontSize: 12.5, color: 'var(--hx-danger, #ff6b6b)' }}>⛔ {u}</div>)}
                  {built.review.warnings.map((w, i) => <div key={`w${i}`} style={{ fontSize: 12.5, color: 'var(--hx-gold-2)' }}>⚠ {w.field}: {w.message}</div>)}
                </div>
              ) : (
                <div style={{ fontSize: 12.5, color: 'var(--hx-teal-1)' }}>✓ The engine found no problems with this class.</div>
              )}

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} disabled={saving || !savable} onClick={save}
                  title={savable ? 'Save this class to your character' : 'Fix the errors above before saving'}>
                  {saving ? 'Saving…' : '⚒ Save to my character'}
                </button>
                {saved && <span style={{ fontSize: 12.5, color: 'var(--hx-teal-1)' }}>✓ Saved “{saved}”.</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--hx-muted)' }}>
                Saved classes are flagged custom for DM review, and resolve in the level builder like an official one.
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
