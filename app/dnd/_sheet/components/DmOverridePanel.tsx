import InlineNumber from './ui/InlineNumber'
import AiSheetEdit from './AiSheetEdit'
import StreamControl from './StreamControl'
import { useChar } from '../state/store'
import type { Character } from '../types'

// DM sheet-control panel (§6.8.1 / Phase C10). Renders only in DM mode. Gives the
// DM a single surface to override the character's core numbers — ability scores,
// HP, AC, save DC, speed, level. It reuses the sheet's existing temp/permanent +
// revert system: each field is an InlineNumber bound to the same `path` the rest
// of the sheet uses, so edits made while Temp mode is on are reversible (⟲), and
// "Revert temp" clears them all. Permanent edits persist to the DB store (C3).
const ABILITIES: { key: keyof Character['abilities']; label: string }[] = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' },
]

export default function DmOverridePanel() {
  const { char, setChar, isDM, tempMode, setTempMode, clearAllOverrides, setLevel, characterId } = useChar()
  if (!isDM) return null

  // Record a DM override to the edit log (C11a). Fire-and-forget; only when the
  // sheet is DB-backed (a characterId exists). The scope follows Temp mode.
  const logEdit = (fieldPath: string, oldValue: number, newValue: number) => {
    if (!characterId || oldValue === newValue) return
    void fetch(`/api/dnd/characters/${characterId}/edits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field_path: fieldPath,
        old_value: oldValue,
        new_value: newValue,
        scope: tempMode ? 'temp' : 'permanent',
      }),
    }).catch(() => {})
  }

  const setAbility = (k: keyof Character['abilities']) => (n: number) => {
    logEdit(`ability.${k}`, char.abilities[k], n)
    setChar((c) => ({ ...c, abilities: { ...c.abilities, [k]: n } }))
  }
  const setCombat = (k: keyof Character['combat'], fieldPath: string) => (n: number) => {
    logEdit(fieldPath, Number(char.combat[k] ?? 0), n)
    setChar((c) => ({ ...c, combat: { ...c.combat, [k]: n } }))
  }

  const cell: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 54 }
  const lab: React.CSSProperties = { fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)' }
  const val: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: 'var(--ink)' }

  return (
    <section className="card dm-panel" style={{ borderColor: 'var(--gold)', marginBottom: 14 }}>
      <div className="sec-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <span className="sec-num" style={{ color: 'var(--gold)' }}>DM {'//'}</span>
          <h2 style={{ display: 'inline', marginLeft: 8 }}>Control</h2>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            className={`btn tiny ${tempMode ? 'on' : ''}`}
            onClick={() => setTempMode(!tempMode)}
            title="When on, edits are reversible (a ⟲ appears on changed fields)"
          >
            {tempMode ? '● Temp edits' : '○ Temp edits'}
          </button>
          <button className="btn tiny" onClick={clearAllOverrides} title="Revert all temporary overrides to their originals">
            ⟲ Revert temp
          </button>
        </div>
      </div>

      <p style={{ ...lab, margin: '2px 0 8px' }}>Double-click any value to override it live.</p>

      {/* Ability scores */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        {ABILITIES.map((a) => (
          <div key={a.key} style={cell}>
            <span style={lab}>{a.label}</span>
            <InlineNumber
              value={char.abilities[a.key]}
              onCommit={setAbility(a.key)}
              path={`ability.${a.key}`}
              min={1}
              max={30}
              className="dm-field"
              display={<span style={val}>{char.abilities[a.key]}</span>}
            />
          </div>
        ))}
      </div>

      {/* Combat + level */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <div style={cell}>
          <span style={lab}>HP</span>
          <span style={val}>
            <InlineNumber value={char.combat.currentHp} onCommit={setCombat('currentHp', 'combat.currentHp')} path="combat.currentHp" min={0} />
            {' / '}
            <InlineNumber value={char.combat.maxHp} onCommit={setCombat('maxHp', 'combat.maxHp')} path="combat.maxHp" min={1} />
          </span>
        </div>
        <div style={cell}>
          <span style={lab}>AC</span>
          <InlineNumber value={char.combat.ac} onCommit={setCombat('ac', 'combat.ac')} path="combat.ac" min={0} display={<span style={val}>{char.combat.ac}</span>} />
        </div>
        <div style={cell}>
          <span style={lab}>Save DC</span>
          <InlineNumber
            value={char.combat.saveDCOverride ?? 0}
            onCommit={setCombat('saveDCOverride', 'combat.saveDC')}
            path="combat.saveDC"
            min={0}
            display={<span style={val}>{char.combat.saveDCOverride ?? '—'}</span>}
          />
        </div>
        <div style={cell}>
          <span style={lab}>Speed</span>
          <InlineNumber value={char.combat.speed} onCommit={setCombat('speed', 'combat.speed')} path="combat.speed" min={0} display={<span style={val}>{char.combat.speed}</span>} />
        </div>
        <div style={cell}>
          <span style={lab}>Level</span>
          {/* Level cascades (HP/rage/etc.), so it uses setLevel and is always permanent. */}
          <InlineNumber
            value={char.meta.level}
            onCommit={(n) => {
              logEdit('meta.level', char.meta.level, n)
              setLevel(n)
            }}
            min={1}
            display={<span style={val}>{char.meta.level}</span>}
          />
        </div>
      </div>

      <AiSheetEdit />
      <StreamControl />
    </section>
  )
}
