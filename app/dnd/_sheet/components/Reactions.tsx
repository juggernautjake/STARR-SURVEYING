'use client'
// Reactions — the surfacing for event-triggered reactions (Slice 15). Lists every trigger currently
// active on the character (from equipped items + unlocked features), grouped by the event that fires
// it, with a plain-English action line and its source. Triggers are PROMPTS, not automation: this
// says "Spiked Barbs: 1d6 piercing to the attacker when hit by melee" so the player/DM knows to
// resolve it — the sheet never auto-applies damage to a creature it can't see.
//
// A pure READ of `collectTriggers`. Hidden when the character has no triggers (no empty box).
import { useChar } from '../state/store'
import { collectTriggers, describeTrigger, TRIGGER_EVENT_LABEL, type ActiveTrigger } from '@/lib/dnd/effects/triggers'
import type { TriggerEvent } from '../types'

export default function Reactions() {
  const { char, rollDmg, rollExpr } = useChar()
  const triggers = collectTriggers(char)
  if (!triggers.length) return null

  // Resolve a reaction NOW — the player fires it when its event actually happens (the app can't see
  // the enemy that hit you, so this stays player-initiated: the prompt model the request describes).
  // Only dice actions roll; a condition/effect/note is a DM adjudication, shown but not rolled.
  const roll = (t: ActiveTrigger) => {
    const a = t.action
    if (!a.dice) return
    if (a.kind === 'damage') rollDmg(`${t.label} — reaction`, a.dice, { tag: a.damageType || 'reaction' })
    else if (a.kind === 'heal') rollExpr(`${t.label} — heal`, a.dice, 'heal')
    else if (a.kind === 'temp_hp') rollExpr(`${t.label} — temp HP`, a.dice, 'temp')
  }
  const rollable = (t: ActiveTrigger) => !!t.action.dice && ['damage', 'heal', 'temp_hp'].includes(t.action.kind)

  // Group by event so the reader scans "when X happens, these fire".
  const byEvent = new Map<TriggerEvent, ActiveTrigger[]>()
  for (const t of triggers) {
    const list = byEvent.get(t.on) ?? []
    list.push(t)
    byEvent.set(t.on, list)
  }

  return (
    <div className="card ae-card">
      <div className="ae-head">⚡ Reactions &amp; Triggers</div>
      <p className="ae-empty">These fire when their event happens — the sheet surfaces them, you resolve the roll.</p>
      <div style={{ display: 'grid', gap: 10 }}>
        {[...byEvent.entries()].map(([event, list]) => (
          <div key={event}>
            <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>
              {TRIGGER_EVENT_LABEL[event]}
            </div>
            {list.map((t) => (
              <div key={t.id + t.source} className="flex" style={{ justifyContent: 'space-between', gap: 10, alignItems: 'baseline', borderTop: '1px solid var(--line)', paddingTop: 4, marginTop: 4 }}>
                <div>
                  <strong style={{ color: 'var(--ink)' }}>{t.label}</strong>{' '}
                  <span style={{ color: 'var(--tealbright)' }}>{describeTrigger(t)}</span>
                </div>
                <div className="flex" style={{ gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
                  {rollable(t) && (
                    <button className="btn tiny solid" onClick={() => roll(t)} title="Fire this reaction now — rolls into the log">
                      🎲 Roll
                    </button>
                  )}
                  <span className="tag" style={{ color: 'var(--gold)' }}>from {t.source}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
