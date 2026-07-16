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
  const { char } = useChar()
  const triggers = collectTriggers(char)
  if (!triggers.length) return null

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
                <span className="tag" style={{ color: 'var(--gold)', whiteSpace: 'nowrap' }}>from {t.source}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
