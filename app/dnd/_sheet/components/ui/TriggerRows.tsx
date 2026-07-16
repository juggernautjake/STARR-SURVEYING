'use client'
// TriggerRows — the manual builder for event-triggered reactions (Slice 15), the hand path beside
// the AI's `triggers` payload. Same shape (`Trigger`), so a hand-built and an AI-built reaction are
// indistinguishable and both surface the same way. Deliberately compact: pick the event, name it,
// choose what fires, fill the dice/type. A reaction is a PROMPT, so there's no auto-resolution here —
// just what the sheet will offer to roll when the event happens.
import { TRIGGER_EVENT_LABEL, describeTrigger } from '@/lib/dnd/effects/triggers'
import type { Trigger, TriggerEvent, TriggerAction } from '../../types'

const EVENTS = Object.keys(TRIGGER_EVENT_LABEL) as TriggerEvent[]
const ACTION_KINDS: TriggerAction['kind'][] = ['damage', 'heal', 'temp_hp', 'condition', 'effect', 'resource', 'prompt']

const field: React.CSSProperties = { padding: '6px 9px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--panel-2)', color: 'var(--ink)', fontSize: 13 }
const uid = () => `trig-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

export default function TriggerRows({ triggers, onChange }: { triggers: Trigger[]; onChange: (t: Trigger[]) => void }) {
  const set = (i: number, patch: Partial<Trigger>) => onChange(triggers.map((t, j) => (j === i ? { ...t, ...patch } : t)))
  const setAction = (i: number, patch: Partial<TriggerAction>) => set(i, { action: { ...triggers[i].action, ...patch } })
  const dicey = (k: TriggerAction['kind']) => k === 'damage' || k === 'heal' || k === 'temp_hp'

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {triggers.map((t, i) => (
        <div key={t.id || i} style={{ display: 'grid', gap: 4, borderTop: '1px dashed var(--line)', paddingTop: 6 }}>
          <div className="flex" style={{ gap: 6, flexWrap: 'wrap' }}>
            <select style={{ ...field, width: 190 }} value={t.on} onChange={(e) => set(i, { on: e.target.value as TriggerEvent })}>
              {EVENTS.map((ev) => <option key={ev} value={ev}>{TRIGGER_EVENT_LABEL[ev]}</option>)}
            </select>
            <input style={{ ...field, flex: 1, minWidth: 120 }} value={t.label} placeholder="name (Spiked Barbs)" onChange={(e) => set(i, { label: e.target.value })} />
            <button type="button" className="btn tiny danger" onClick={() => onChange(triggers.filter((_, j) => j !== i))}>✕</button>
          </div>
          <div className="flex" style={{ gap: 6, flexWrap: 'wrap' }}>
            <select style={{ ...field, width: 120 }} value={t.action.kind} onChange={(e) => setAction(i, { kind: e.target.value as TriggerAction['kind'] })}>
              {ACTION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            {dicey(t.action.kind) && (
              <input style={{ ...field, width: 80 }} value={t.action.dice ?? ''} placeholder="1d6" onChange={(e) => setAction(i, { dice: e.target.value })} />
            )}
            {t.action.kind === 'damage' && (
              <>
                <input style={{ ...field, width: 100 }} value={t.action.damageType ?? ''} placeholder="piercing" onChange={(e) => setAction(i, { damageType: e.target.value })} />
                <label className="flex" style={{ gap: 4, alignItems: 'center', fontSize: 12, color: 'var(--ink)' }}>
                  <input type="checkbox" checked={!!t.action.attack} onChange={(e) => setAction(i, { attack: e.target.checked })} /> needs attack roll
                </label>
              </>
            )}
            {t.action.kind === 'condition' && (
              <input style={{ ...field, width: 130 }} value={t.action.condition ?? ''} placeholder="Frightened" onChange={(e) => setAction(i, { condition: e.target.value })} />
            )}
            {(t.action.kind === 'prompt' || t.action.kind === 'effect' || t.action.kind === 'resource') && (
              <input style={{ ...field, flex: 1, minWidth: 120 }} value={t.action.note ?? ''} placeholder="what happens (DM adjudicates)" onChange={(e) => setAction(i, { note: e.target.value })} />
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            <strong style={{ color: 'var(--tealbright)' }}>{TRIGGER_EVENT_LABEL[t.on]}</strong> → {describeTrigger(t)}
          </div>
        </div>
      ))}
      <button type="button" className="btn tiny" onClick={() => onChange([...triggers, { id: uid(), on: 'hit_by_melee', label: 'New reaction', action: { kind: 'damage', dice: '1d6', damageType: 'piercing' } }])}>
        + Add reaction
      </button>
    </div>
  )
}
