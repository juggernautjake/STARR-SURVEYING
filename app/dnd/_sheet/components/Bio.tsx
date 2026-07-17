'use client'
import { useState } from 'react'
import { useChar } from '../state/store'
import { useSheetSystem } from '../state/sheetConfig'
import { BACKGROUNDS_2024, findBackground } from '@/lib/dnd/backgrounds/dnd5e-2024'
import { findFeat } from '@/lib/dnd/feats/dnd5e-2024'
import { validateAbilityAssignment, reconcileBackgroundIncreases, type AbilityAssignment } from '@/lib/dnd/backgrounds/apply'
import { SKILLS, ABILITIES, type AbilityKey } from '@/app/dnd/_sheet/rules/dnd'
import { md } from '../lib/inline'
import SectionHead from './ui/SectionHead'

const SKILL_LABEL: Record<string, string> = Object.fromEntries(SKILLS.map((s) => [s.key, s.label]))
const ABILITY_LABEL: Record<string, string> = Object.fromEntries(ABILITIES.map((a) => [a.key, a.label]))
/** A one-line rendering of an applied background spread, e.g. "+2 STR, +1 CON". */
function spreadSummary(a: AbilityAssignment): string {
  return (Object.entries(a) as [AbilityKey, number][])
    .filter(([, v]) => (v ?? 0) > 0)
    .sort((x, y) => y[1] - x[1])
    .map(([k, v]) => `+${v} ${ABILITY_LABEL[k] ?? k.toUpperCase()}`)
    .join(', ')
}

// Story & Roleplay — the character's premade story sections (intro, appearance, personality,
// background, play tips). Each section has its own ✎ Edit button so the DM or the owning
// player can rewrite the text; edits save to char.bio and persist via the sheet autosave.

type StoryKind = 'paragraphs' | 'list' | 'text'

/** How a bio value serialises into a single editable textarea, and back. */
function toText(value: string | string[], kind: StoryKind): string {
  if (kind === 'text') return value as string
  return (value as string[]).join(kind === 'paragraphs' ? '\n\n' : '\n')
}
function fromText(text: string, kind: StoryKind): string | string[] {
  if (kind === 'text') return text
  const sep = kind === 'paragraphs' ? /\n{2,}/ : /\n+/
  return text.split(sep).map((s) => s.trim()).filter(Boolean)
}

function StoryCard({
  title, value, kind, canEdit, onSave,
}: {
  title: React.ReactNode
  value: string | string[]
  kind: StoryKind
  canEdit: boolean
  onSave: (v: string | string[]) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const start = () => { setDraft(toText(value, kind)); setEditing(true) }
  const save = () => { onSave(fromText(draft, kind)); setEditing(false) }

  return (
    <div className="card">
      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {canEdit && !editing && (
          <button className="btn tiny" onClick={start} title="Edit this section">✎ Edit</button>
        )}
      </div>

      {editing ? (
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={kind === 'text' ? 5 : 6}
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--panel-2)', color: 'var(--ink)', fontFamily: 'var(--font-body)', fontSize: 14, resize: 'vertical' }}
          />
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            {kind === 'list' ? 'One bullet per line.' : kind === 'paragraphs' ? 'Separate paragraphs with a blank line.' : 'Markdown-lite: **bold**, *italics*.'}
          </div>
          <div className="btn-row">
            <button className="btn tiny solid" onClick={save}>Save</button>
            <button className="btn tiny" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : kind === 'text' ? (
        <p style={{ marginTop: 8 }}>{md(value as string)}</p>
      ) : kind === 'paragraphs' ? (
        <div style={{ marginTop: 8 }}>{(value as string[]).map((p, i) => <p key={i}>{md(p)}</p>)}</div>
      ) : (
        <ul className="clean" style={{ marginTop: 8 }}>{(value as string[]).map((b, i) => <li key={i}>{md(b)}</li>)}</ul>
      )}
    </div>
  )
}

export default function Bio() {
  const { char, setChar, canWrite, ledger } = useChar()
  const { bio } = char
  const setBio = (patch: Partial<typeof bio>) => setChar((c) => ({ ...c, bio: { ...c.bio, ...patch } }))
  // Use the imposed name (Slice 11) in the card titles too, so a transformed character's story
  // reads as who they currently are — consistent with the Hero header. Base stands when nothing
  // imposes an identity.
  const displayName = ledger.identity('name')?.value ?? char.meta.name

  // Descriptive identity fields (Slice 11): the render home for gender/pronouns/profession. Each is
  // overlayable by an identity effect (a potion that changes your recorded profession), base stands
  // otherwise. Edit them by hand below (canWrite), or the AI sets them via set_meta.
  const detail = (field: 'gender' | 'pronouns' | 'profession') => ledger.identity(field)?.value ?? char.meta[field] ?? ''
  const details: { key: 'gender' | 'pronouns' | 'profession'; label: string }[] = [
    { key: 'gender', label: 'Gender' },
    { key: 'pronouns', label: 'Pronouns' },
    { key: 'profession', label: 'Profession' },
  ]
  const setMeta = (k: 'gender' | 'pronouns' | 'profession', v: string) =>
    setChar((c) => ({ ...c, meta: { ...c.meta, [k]: v } }))

  // Mechanical 2024 background (Slice 4): a pick from the real list that grants ability increases +
  // an Origin feat + skills + tool. Distinct from `bio.background` (narrative prose). Shown as a
  // picker (canWrite) + a legible grants panel; a custom name stays possible (the escape hatch).
  const system = useSheetSystem()
  const is2024 = system === 'dnd5e-2024'
  // Switching (or clearing) the background must first REVERSE whatever spread was applied from the
  // old one — abilities are running totals, so a stale +2/+1 would otherwise be left baked in. The
  // reconcile undoes the applied spread (prev → {}) and we clear the stored spread in the same edit.
  const setBackground = (key: string) => {
    setDraft({}) // a new background starts with no spread assigned
    setChar((c) => ({
      ...c,
      abilities: reconcileBackgroundIncreases(c.abilities, c.meta.backgroundAbilities, {}),
      meta: { ...c.meta, background: key, backgroundAbilities: undefined },
    }))
  }
  const bg = is2024 && char.meta.background ? findBackground(char.meta.background) : undefined
  const bgKnown = !!bg
  const bgIsCustom = is2024 && !!char.meta.background && !bgKnown
  const bgFeatName = bg ? findFeat(bg.originFeat)?.name ?? bg.originFeat : undefined
  const applied: AbilityAssignment = char.meta.backgroundAbilities ?? {}
  // Local draft of the +2/+1 (or +1/+1/+1) spread being assigned; the committed one lives on the
  // character (`meta.backgroundAbilities`). Applying reconciles abilities from applied → draft.
  const [draft, setDraft] = useState<AbilityAssignment>(applied)
  const draftValid = bg ? validateAbilityAssignment(bg, draft).ok : false
  const draftError = bg ? validateAbilityAssignment(bg, draft).error : undefined
  const draftMatchesApplied = bg
    ? bg.abilityScores.every((a) => (draft[a] ?? 0) === (applied[a] ?? 0))
    : false
  const cycle = (a: AbilityKey) =>
    setDraft((d) => ({ ...d, [a]: ((d[a] ?? 0) + 1) % 3 })) // 0 → 1 → 2 → 0
  const applySpread = () => {
    if (!draftValid) return
    setChar((c) => ({
      ...c,
      abilities: reconcileBackgroundIncreases(c.abilities, c.meta.backgroundAbilities, draft),
      meta: { ...c.meta, backgroundAbilities: { ...draft } },
    }))
  }
  const clearSpread = () => {
    setDraft({})
    setChar((c) => ({
      ...c,
      abilities: reconcileBackgroundIncreases(c.abilities, c.meta.backgroundAbilities, {}),
      meta: { ...c.meta, backgroundAbilities: undefined },
    }))
  }

  return (
    <section id="story">
      <SectionHead num="13" title="Story & Roleplay" />

      {/* 2024 mechanical background — the picker + what it grants (ability options, Origin feat,
          skills, tool, equipment). Only for a 2024 sheet; sets meta.background, distinct from the
          narrative Background card below. Applying the ability increases to the sheet is a follow-up. */}
      {is2024 && (char.meta.background || canWrite) && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>Background <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 12 }}>(2024 — grants ability increases + an Origin feat)</span></h3>
            {canWrite && (
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <select
                  className="mono"
                  value={bgKnown ? bg!.key : bgIsCustom ? '__custom__' : ''}
                  onChange={(e) => setBackground(e.target.value === '__custom__' ? (char.meta.background || 'custom') : e.target.value === '' ? '' : e.target.value)}
                  style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 6, padding: '4px 8px', color: 'var(--ink)', fontSize: 14 }}
                >
                  <option value="">— background —</option>
                  {BACKGROUNDS_2024.map((b) => (<option key={b.key} value={b.key}>{b.name}</option>))}
                  <option value="__custom__">✎ Custom…</option>
                </select>
              </span>
            )}
          </div>
          {bg && (
            <div style={{ marginTop: 8, fontSize: 13, display: 'grid', gap: 5 }}>
              <div><b>Ability Scores:</b> {bg.abilityScores.map((a) => a.toUpperCase()).join(', ')} <span style={{ color: 'var(--muted)' }}>(assign +2/+1, or +1/+1/+1)</span></div>

              {/* The spread assignment — click each ability to cycle 0 → +1 → +2, then Apply. Applying
                  reconciles the running ability totals (undo the old spread, add the new) so it's
                  reversible; the applied spread is remembered on the character. */}
              {canWrite ? (
                <div style={{ display: 'grid', gap: 6, padding: '6px 0 2px' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {bg.abilityScores.map((a) => {
                      const v = draft[a] ?? 0
                      return (
                        <button
                          key={a}
                          type="button"
                          onClick={() => cycle(a)}
                          title="Click to cycle 0 / +1 / +2"
                          style={{
                            minWidth: 78, padding: '5px 9px', borderRadius: 7, cursor: 'pointer',
                            fontSize: 13, fontFamily: 'var(--font-mono, monospace)',
                            border: `1px solid ${v > 0 ? 'var(--gold, #c8aa6e)' : 'var(--line)'}`,
                            background: v > 0 ? 'rgba(var(--gold-rgb, 200,170,110), .14)' : 'var(--panel-2)',
                            color: 'var(--ink)',
                          }}
                        >
                          {ABILITY_LABEL[a]} <b>{v > 0 ? `+${v}` : '—'}</b>
                        </button>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={applySpread}
                      disabled={!draftValid || draftMatchesApplied}
                      style={{
                        padding: '5px 12px', borderRadius: 7, fontSize: 13,
                        cursor: !draftValid || draftMatchesApplied ? 'default' : 'pointer',
                        border: '1px solid var(--line)',
                        background: !draftValid || draftMatchesApplied ? 'var(--panel-2)' : 'var(--gold, #c8aa6e)',
                        color: !draftValid || draftMatchesApplied ? 'var(--muted)' : 'var(--panel)',
                        opacity: !draftValid || draftMatchesApplied ? 0.7 : 1,
                      }}
                    >
                      {spreadSummary(applied) && draftMatchesApplied ? '✓ Applied' : 'Apply to sheet'}
                    </button>
                    {spreadSummary(applied) && (
                      <button type="button" onClick={clearSpread} style={{ padding: '5px 10px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer', border: '1px solid var(--line)', background: 'var(--panel-2)', color: 'var(--muted)' }}>Clear</button>
                    )}
                    {!draftValid && draftError && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{draftError}</span>}
                    {draftValid && !draftMatchesApplied && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Applies {spreadSummary(draft)} to your scores.</span>}
                  </div>
                </div>
              ) : spreadSummary(applied) ? (
                <div><b>Ability Increases:</b> {spreadSummary(applied)}</div>
              ) : null}

              <div><b>Origin Feat:</b> {bgFeatName}{bg.spellList ? ` (${bg.spellList})` : ''}</div>
              <div><b>Skill Proficiencies:</b> {bg.skillProficiencies.map((s) => SKILL_LABEL[s] ?? s).join(', ')}</div>
              <div><b>Tool Proficiency:</b> {bg.toolProficiency}</div>
              <div style={{ color: 'var(--muted)' }}><b style={{ color: 'var(--ink)' }}>Equipment:</b> {bg.equipment}</div>
            </div>
          )}
          {bgIsCustom && <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--muted)' }}>Custom background — grants are yours to define.</div>}
        </div>
      )}

      {/* Details line — gender · pronouns · profession, each overlayable by an identity effect. */}
      {(details.some((d) => detail(d.key)) || canWrite) && (
        <div className="card" style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 12 }}>
          {details.map((d) => (
            <div key={d.key}>
              <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>{d.label}</div>
              {canWrite ? (
                <input
                  className="mono"
                  style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 6, padding: '4px 8px', color: 'var(--ink)', fontSize: 14, minWidth: 120 }}
                  value={char.meta[d.key] ?? ''}
                  placeholder="—"
                  onChange={(e) => setMeta(d.key, e.target.value)}
                />
              ) : (
                <div style={{ fontSize: 15, color: 'var(--ink)' }}>{detail(d.key) || '—'}</div>
              )}
            </div>
          ))}
        </div>
      )}

      <StoryCard title={`Who Is ${displayName}?`} value={bio.intro} kind="paragraphs" canEdit={canWrite} onSave={(v) => setBio({ intro: v as string[] })} />

      <div className="two">
        <StoryCard title="Appearance" value={bio.appearance} kind="list" canEdit={canWrite} onSave={(v) => setBio({ appearance: v as string[] })} />
        <StoryCard title="Personality & Hooks" value={bio.personality} kind="list" canEdit={canWrite} onSave={(v) => setBio({ personality: v as string[] })} />
      </div>

      <div className="two">
        <StoryCard title="Background" value={bio.background} kind="text" canEdit={canWrite} onSave={(v) => setBio({ background: v as string })} />
        <StoryCard title={`Playing ${displayName.split(' ')[0]}`} value={bio.playTips} kind="list" canEdit={canWrite} onSave={(v) => setBio({ playTips: v as string[] })} />
      </div>
    </section>
  )
}
