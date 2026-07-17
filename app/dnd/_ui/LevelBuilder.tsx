'use client';
// app/dnd/_ui/LevelBuilder.tsx — build a character level by level.
//
// This is where the sheet's "Manage Levels" button lands. The contract: a level is only complete
// once the choices it unlocks are recorded, so this walks them IN ORDER and refuses to advance
// past one that's outstanding. That's the whole reason the sheet no longer has a +/- stepper.
//
// If the character is going somewhere the rulebook doesn't cover, the AI can homebrew the feature
// for that level — recorded as custom content, which the DM already reviews (seed 443).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hextech.module.css';
import { ABILITIES, type AbilityKey } from '@/app/dnd/_sheet/rules/dnd';
import { FEATS_2024, type Feat } from '@/lib/dnd/feats/dnd5e-2024';

/**
 * The feats a 2024 character may take at an ASI slot of a given level: General feats (and, at 19+,
 * Epic Boons) whose minLevel is met — never an Origin or Fighting Style feat. Ability/needs
 * prerequisites are checked server-side (validateChoice) since the picker doesn't hold ability scores;
 * they're surfaced in the label so the player knows what a feat needs. Empty for non-2024 systems,
 * where we don't yet ship a feat list — those fall back to the explicit-custom text entry.
 */
function asiFeatChoices(system: string, level: number, extra: Feat[] = []): Feat[] {
  if (system !== 'dnd5e-2024') return [];
  const official = FEATS_2024.filter((f) => {
    if (f.category !== 'general' && !(f.category === 'epic-boon' && level >= 19)) return false;
    return (f.prerequisites ?? []).every((p) => p.minLevel == null || level >= p.minLevel);
  });
  // Saved homebrew feats (already category-eligible + adapted by the levels route) sit alongside them.
  const homebrew = extra.filter((f) => f.category === 'general' || (f.category === 'epic-boon' && level >= 19));
  return [...official, ...homebrew];
}

/** A short "(needs STR 13, Spellcasting)" hint for a feat's non-level prerequisites. */
function prereqHint(feat: Feat): string {
  const parts: string[] = [];
  for (const p of feat.prerequisites ?? []) {
    if (p.ability) parts.push(`${p.ability.key.toUpperCase()} ${p.ability.min}`);
    if (p.needs) parts.push(p.text ?? p.needs);
  }
  return parts.length ? ` (needs ${parts.join(', ')})` : '';
}

interface Choice {
  level: number;
  kind: 'asi' | 'subclass' | 'fighting-style' | 'expertise' | 'cantrip' | 'epic-boon' | 'other';
  value?: string;
  abilities?: AbilityKey[];
  featKey?: string;
  skills?: string[];
  homebrew?: { name: string; body: string };
}

interface Outstanding {
  level: number;
  kind: Choice['kind'];
  label: string;
  detail: string;
  options?: { key: string; name: string; description: string }[];
  pick?: number;
  from?: string[];
}

interface PlanResponse {
  level: number;
  maxLevel: number;
  className: string | null;
  classKnown: boolean;
  outstanding: Outstanding[];
  gained: { level: number; name: string; body: string; subclass?: boolean }[];
  /** Saved homebrew feats (adapted) to offer at ASI slots, alongside the official list. */
  homebrewFeats?: Feat[];
  ready: boolean;
  choices: Choice[];
  error?: string;
}

export default function LevelBuilder({
  characterId,
  characterName,
  system,
  currentLevel,
  className,
  subclassName,
  aiConfigured,
}: {
  characterId: string;
  characterName: string;
  system: string;
  currentLevel: number;
  className: string;
  subclassName: string;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [target, setTarget] = useState(Math.min(20, currentLevel + 1));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Choice | null>(null);

  const load = useCallback(
    async (to: number) => {
      setBusy(true);
      setErr(null);
      try {
        const u = new URL(`/api/dnd/characters/${characterId}/levels`, window.location.origin);
        u.searchParams.set('to', String(to));
        const r = await fetch(u.toString());
        const j = (await r.json().catch(() => ({}))) as PlanResponse;
        if (!r.ok) { setErr(j?.error || 'Could not load the level plan.'); return; }
        setPlan(j);
      } catch {
        setErr('Could not load the level plan.');
      } finally {
        setBusy(false);
      }
    },
    [characterId],
  );

  useEffect(() => { void load(target); }, [load, target]);

  const current = plan?.outstanding?.[0] ?? null;

  // Reset the draft whenever we move to a different choice.
  useEffect(() => {
    if (!current) { setDraft(null); return; }
    setDraft({ level: current.level, kind: current.kind, ...(current.kind === 'expertise' ? { skills: [] } : {}), ...(current.kind === 'asi' ? { abilities: [] } : {}) });
  }, [current?.level, current?.kind]);

  const save = useCallback(
    async (choice: Choice, opts: { commitLevel?: number } = {}) => {
      // The '__custom__' sentinel means "custom feat picked, name not typed yet" — never record it.
      if (choice.kind === 'asi' && choice.featKey === '__custom__') {
        setErr('Type a name for your custom feat, or pick one from the list.');
        return;
      }
      setBusy(true);
      setErr(null);
      try {
        const r = await fetch(`/api/dnd/characters/${characterId}/levels`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ choice, commitLevel: opts.commitLevel, to: target }),
        });
        const j = (await r.json().catch(() => ({}))) as PlanResponse;
        if (!r.ok) { setErr(j?.error || 'Could not save that choice.'); return; }
        setPlan(j);
        if (opts.commitLevel) router.refresh();
      } catch {
        setErr('Could not save that choice.');
      } finally {
        setBusy(false);
      }
    },
    [characterId, target, router],
  );

  const commit = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/levels`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ commitLevel: target, to: target }),
      });
      const j = (await r.json().catch(() => ({}))) as PlanResponse;
      if (!r.ok) { setErr(j?.error || 'Could not apply the level.'); return; }
      setPlan(j);
      router.refresh();
    } catch {
      setErr('Could not apply the level.');
    } finally {
      setBusy(false);
    }
  }, [characterId, target, router]);

  const canPickAbility = useMemo(() => (draft?.abilities?.length ?? 0) < 2, [draft]);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* ── where the character is ─────────────────────────────────────────── */}
      <section className={styles.framedPanel} style={{ padding: '14px 16px', display: 'grid', gap: 10 }}>
        <div className={styles.framedPanelTop} />
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--hx-teal-1)' }}>Current level</div>
            <div style={{ fontFamily: 'var(--hx-font-display)', fontSize: 30, color: 'var(--hx-gold-2)' }}>{plan?.level ?? currentLevel}</div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--hx-teal-1)' }}>Class</div>
            <div style={{ fontSize: 15, color: 'var(--hx-text)' }}>
              {className || plan?.className || '—'}
              {subclassName ? <span style={{ color: 'var(--hx-muted)' }}> · {subclassName}</span> : null}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <label htmlFor="lvl-target" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--hx-muted)' }}>Build to</label>
            <select
              id="lvl-target"
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
              style={{ padding: '7px 10px', background: 'rgba(1,10,19,0.5)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)' }}
            >
              {Array.from({ length: 20 }, (_, i) => i + 1)
                .filter((n) => n >= (plan?.level ?? currentLevel))
                .map((n) => (
                  <option key={n} value={n}>Level {n}</option>
                ))}
            </select>
          </div>
        </div>

        {plan && !plan.classKnown && (
          <div className={styles.notice}>
            This character has no class from the {system} rulebook attached
            {className ? ` (its sheet says “${className}”)` : ''}, so there is no official level table to walk. You can
            still set the level, and use the AI below to homebrew what it gains.
          </div>
        )}
      </section>

      {err && <div className={styles.error}>{err}</div>}
      {busy && !plan && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--hx-muted)' }}>
          <span className={styles.spinner} /> Loading…
        </div>
      )}

      {/* ── the outstanding-choice walk ────────────────────────────────────── */}
      {plan && plan.outstanding.length > 0 && current && (
        <section className={styles.framedPanel} style={{ padding: '14px 16px', display: 'grid', gap: 12 }}>
          <div className={styles.framedPanelTop} />
          <div>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--hx-gold-2)' }}>
              Choice {1} of {plan.outstanding.length} · level {current.level}
            </div>
            <h2 className={styles.panelTitle} style={{ margin: '2px 0 0' }}>{current.label}</h2>
            <p style={{ color: 'var(--hx-muted)', fontSize: 13, margin: '4px 0 0' }}>{current.detail}</p>
          </div>

          {/* subclass / fighting style / epic boon — a list of options */}
          {current.options && current.options.length > 0 && (
            <div style={{ display: 'grid', gap: 8 }}>
              {current.options.map((o) => (
                <button
                  key={o.key}
                  onClick={() => setDraft({ level: current.level, kind: current.kind, value: o.key })}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    border: `1px solid ${draft?.value === o.key ? 'var(--hx-teal-1)' : 'var(--hx-line)'}`,
                    background: draft?.value === o.key ? 'rgba(10,200,185,0.12)' : 'rgba(1,10,19,0.4)',
                    color: 'var(--hx-text)',
                    cursor: 'pointer',
                  }}
                >
                  <strong style={{ color: 'var(--hx-gold-2)' }}>{o.name}</strong>
                  <div style={{ fontSize: 12.5, color: 'var(--hx-muted)', marginTop: 2 }}>{o.description}</div>
                </button>
              ))}
            </div>
          )}

          {current.options && current.options.length === 0 && (
            <div className={styles.notice}>
              No {current.label.split(' —')[0].toLowerCase()} options are registered for this class yet. Use the AI below
              to homebrew one, or type a name to record your own.
            </div>
          )}

          {/* ASI — two points, or a feat */}
          {current.kind === 'asi' && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ABILITIES.map((a) => {
                  const count = draft?.abilities?.filter((x) => x === a.key).length ?? 0;
                  return (
                    <button
                      key={a.key}
                      disabled={!canPickAbility && count === 0}
                      onClick={() => setDraft((d) => ({ ...(d ?? { level: current.level, kind: 'asi' }), featKey: undefined, abilities: [...(d?.abilities ?? []), a.key as AbilityKey] }))}
                      style={{
                        padding: '8px 12px',
                        border: `1px solid ${count ? 'var(--hx-teal-1)' : 'var(--hx-line)'}`,
                        background: count ? 'rgba(10,200,185,0.14)' : 'rgba(1,10,19,0.4)',
                        color: 'var(--hx-text)',
                        cursor: 'pointer',
                        opacity: !canPickAbility && count === 0 ? 0.45 : 1,
                      }}
                    >
                      {a.label ?? a.key.toUpperCase()} {count ? `+${count}` : ''}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>
                  {(draft?.abilities?.length ?? 0)}/2 points chosen — +2 to one ability, or +1 to two.
                </span>
                {(draft?.abilities?.length ?? 0) > 0 && (
                  <button className={styles.hexBtn} style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setDraft((d) => ({ ...(d ?? { level: current.level, kind: 'asi' }), abilities: [] }))}>
                    Clear
                  </button>
                )}
                <span style={{ color: 'var(--hx-muted)', fontSize: 12 }}>or take a feat instead</span>
                {(() => {
                  const choices = asiFeatChoices(system, current.level, plan?.homebrewFeats ?? []);
                  const known = new Set(choices.map((f) => f.key));
                  // A feat is "custom" when it's set but not one of the rules-legal choices — the
                  // explicit escape hatch, which reveals a free-text name field.
                  const isCustom = !!draft?.featKey && !known.has(draft.featKey) || draft?.featKey === '__custom__';
                  return (
                    <>
                      <select
                        value={draft?.featKey && known.has(draft.featKey) ? draft.featKey : (isCustom ? '__custom__' : '')}
                        onChange={(e) => setDraft((d) => ({ ...(d ?? { level: current.level, kind: 'asi' }), abilities: [], featKey: e.target.value === '' ? undefined : e.target.value === '__custom__' ? '__custom__' : e.target.value }))}
                        style={{ flex: '1 1 220px', padding: '7px 9px', background: 'rgba(1,10,19,0.5)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', fontSize: 13 }}
                      >
                        <option value="">— choose a feat —</option>
                        {choices.map((f) => (
                          <option key={f.key} value={f.key}>{f.name}{prereqHint(f)}</option>
                        ))}
                        {choices.length === 0 && <option value="" disabled>no official feats for this system — use custom</option>}
                        <option value="__custom__">✎ Custom feat…</option>
                      </select>
                      {isCustom && (
                        <input
                          placeholder="custom feat name"
                          value={draft?.featKey === '__custom__' ? '' : (draft?.featKey ?? '')}
                          onChange={(e) => setDraft((d) => ({ ...(d ?? { level: current.level, kind: 'asi' }), abilities: [], featKey: e.target.value || '__custom__' }))}
                          style={{ flex: '1 1 180px', padding: '7px 9px', background: 'rgba(1,10,19,0.5)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', fontSize: 13 }}
                        />
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* expertise — pick from the legal pool */}
          {current.kind === 'expertise' && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(current.from ?? []).map((s) => {
                  const on = draft?.skills?.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() =>
                        setDraft((d) => {
                          const skills = new Set(d?.skills ?? []);
                          if (skills.has(s)) skills.delete(s);
                          else if (skills.size < (current.pick ?? 2)) skills.add(s);
                          return { ...(d ?? { level: current.level, kind: 'expertise' }), skills: [...skills] };
                        })
                      }
                      style={{
                        padding: '7px 11px',
                        border: `1px solid ${on ? 'var(--hx-teal-1)' : 'var(--hx-line)'}`,
                        background: on ? 'rgba(10,200,185,0.14)' : 'rgba(1,10,19,0.4)',
                        color: 'var(--hx-text)',
                        cursor: 'pointer',
                      }}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
              <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>
                {(draft?.skills?.length ?? 0)}/{current.pick ?? 2} chosen — only skills you are proficient in, and never the same one twice.
              </span>
            </div>
          )}

          {/* cantrip / other / a write-in for anything unlisted */}
          {(current.kind === 'cantrip' || current.kind === 'other' || (current.options?.length === 0)) && (
            <input
              placeholder="Type your choice"
              value={draft?.value ?? ''}
              onChange={(e) => setDraft((d) => ({ ...(d ?? { level: current.level, kind: current.kind }), value: e.target.value }))}
              style={{ padding: '9px 11px', background: 'rgba(1,10,19,0.5)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)' }}
            />
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className={styles.hexBtn} disabled={busy || !draft} onClick={() => draft && void save(draft)}>
              {busy ? '…' : 'Save this choice'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>
              {plan.outstanding.length} choice{plan.outstanding.length === 1 ? '' : 's'} left before level {target}.
            </span>
          </div>
        </section>
      )}

      {/* ── ready to apply ─────────────────────────────────────────────────── */}
      {plan && plan.ready && plan.level < target && (
        <section className={styles.framedPanel} style={{ padding: '14px 16px', display: 'grid', gap: 10 }}>
          <div className={styles.framedPanelTop} />
          <h2 className={styles.panelTitle} style={{ margin: 0 }}>Ready for level {target}</h2>
          {plan.gained.length > 0 && (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--hx-teal-1)' }}>What you gain</div>
              {plan.gained.map((f, i) => (
                <div key={i} style={{ borderLeft: '2px solid var(--hx-gold-2)', paddingLeft: 9 }}>
                  <strong style={{ color: 'var(--hx-gold-2)', fontSize: 13.5 }}>
                    {f.name} <span style={{ color: 'var(--hx-muted)', fontWeight: 400 }}>· level {f.level}{f.subclass ? ' · subclass' : ''}</span>
                  </strong>
                  <div style={{ fontSize: 12.5, color: 'var(--hx-muted)', lineHeight: 1.55 }}>{f.body}</div>
                </div>
              ))}
            </div>
          )}
          <div>
            <button className={styles.hexBtnPrimary ?? styles.hexBtn} disabled={busy} onClick={() => void commit()}>
              {busy ? '…' : `Apply level ${target}`}
            </button>
          </div>
        </section>
      )}

      {plan && plan.ready && plan.level >= target && (
        <section className={styles.framedPanel} style={{ padding: '14px 16px' }}>
          <div className={styles.framedPanelTop} />
          <p style={{ margin: 0, color: 'var(--hx-muted)' }}>
            {characterName} is fully built to level {plan.level}. Raise “Build to” above to keep going.
          </p>
        </section>
      )}

      {/* ── AI homebrew for anything the book doesn't cover ─────────────────── */}
      <HomebrewLevel characterId={characterId} level={target} aiConfigured={aiConfigured} system={system} onSaved={() => void load(target)} />
    </div>
  );
}

/** Ask the AI to invent this level's feature when the character is off the rulebook's map. */
function HomebrewLevel({
  characterId,
  level,
  aiConfigured,
  system,
  onSaved,
}: {
  characterId: string;
  level: number;
  aiConfigured: boolean;
  system: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ name: string; body: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (!brief.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/levels/homebrew`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ level, brief, system }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j?.error || 'The AI could not draft that.'); return; }
      setResult({ name: j.name, body: j.body });
    } catch {
      setErr('The AI could not be reached.');
    } finally {
      setBusy(false);
    }
  }, [brief, characterId, level, system]);

  const keep = useCallback(async () => {
    if (!result) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/levels`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ choice: { level, kind: 'other', value: result.name, homebrew: result }, to: level }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j?.error || 'Could not save.'); return; }
      setResult(null);
      setBrief('');
      setOpen(false);
      onSaved();
    } finally {
      setBusy(false);
    }
  }, [characterId, level, result, onSaved]);

  return (
    <section className={styles.framedPanel} style={{ padding: '14px 16px', display: 'grid', gap: 10 }}>
      <div className={styles.framedPanelTop} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h2 className={styles.panelTitle} style={{ margin: 0 }}>Homebrew this level with AI</h2>
          <p style={{ color: 'var(--hx-muted)', fontSize: 12.5, margin: '3px 0 0' }}>
            For a character going somewhere the rulebook doesn’t cover. Anything you keep is flagged as custom content
            and goes to your DM for approval.
          </p>
        </div>
        <button className={styles.hexBtn} onClick={() => setOpen((o) => !o)}>{open ? 'Close' : 'Open'}</button>
      </div>

      {open && (
        <div style={{ display: 'grid', gap: 8 }}>
          {!aiConfigured && <div className={styles.notice}>The AI is offline — no ANTHROPIC_API_KEY is configured.</div>}
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
            disabled={!aiConfigured}
            placeholder={`What should this character gain at level ${level}? e.g. "something that makes his park bench a real weapon"`}
            style={{ padding: '9px 11px', background: 'rgba(1,10,19,0.5)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', fontFamily: 'var(--hx-font-body)', fontSize: 13.5 }}
          />
          <div>
            <button className={styles.hexBtn} disabled={busy || !brief.trim() || !aiConfigured} onClick={() => void generate()}>
              {busy ? '…' : `Draft a level-${level} feature`}
            </button>
          </div>
          {err && <div className={styles.error}>{err}</div>}
          {result && (
            <div style={{ border: '1px solid var(--hx-line)', padding: '10px 12px', background: 'rgba(10,200,185,0.06)' }}>
              <strong style={{ color: 'var(--hx-gold-2)' }}>{result.name}</strong>
              <div style={{ fontSize: 13, color: 'var(--hx-text)', lineHeight: 1.6, marginTop: 4, whiteSpace: 'pre-wrap' }}>{result.body}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className={styles.hexBtn} disabled={busy} onClick={() => void keep()}>Keep it</button>
                <button className={styles.hexBtn} disabled={busy} onClick={() => void generate()}>Try again</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
