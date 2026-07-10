import { useChar } from '../state/store'

// Editable character descriptions (Phase D3). Appearance / personality / backstory
// / notes, persisted to the `dnd_characters.bio` column via saveDescriptions (which
// PATCHes on change in DB mode). Editable by player and DM alike; this complements
// the bespoke sheet's own story content rather than replacing it.
const FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: 'appearance', label: 'Appearance', placeholder: 'What they look like…' },
  { key: 'personality', label: 'Personality', placeholder: 'Traits, ideals, bonds, flaws…' },
  { key: 'backstory', label: 'Backstory', placeholder: 'Where they came from…' },
  { key: 'notes', label: 'Notes', placeholder: 'Anything else to remember…' },
]

export default function DescriptionsPanel() {
  const { bio, saveDescriptions } = useChar()

  return (
    <section className="card" style={{ marginTop: 14 }}>
      <div className="sec-head">
        <span className="sec-num">✎ {'//'}</span>
        <h2 style={{ display: 'inline', marginLeft: 8 }}>Descriptions</h2>
      </div>
      {FIELDS.map((f) => (
        <label key={f.key} style={{ display: 'block', marginTop: 10 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>{f.label}</span>
          <textarea
            defaultValue={bio[f.key] ?? ''}
            placeholder={f.placeholder}
            rows={3}
            onBlur={(e) => {
              const v = e.target.value
              if (v !== (bio[f.key] ?? '')) saveDescriptions({ [f.key]: v })
            }}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              marginTop: 4,
              // Theme-adaptive field bg (was a hardcoded dark rgba → dark-on-dark on the
              // light skins). --panel-2 is dark on Lazzuh, cream on Donata; --ink flips to match.
              background: 'var(--panel-2)',
              border: '1px solid var(--line)',
              color: 'var(--ink)',
              fontFamily: 'var(--font-body)',
              fontSize: 15,
              padding: '8px 10px',
              borderRadius: 4,
              resize: 'vertical',
            }}
          />
        </label>
      ))}
    </section>
  )
}
