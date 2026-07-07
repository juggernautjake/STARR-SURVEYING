'use client'
// Under-construction banner (Phase M5) — shown above an imported character's generic
// sheet. Surfaces what the AI couldn't map (import_notes), the owner's requested style/
// mechanics, and the saved source files/art — so the owner can review and the site
// owner has everything for the later custom build. Collapsible so it doesn't block the
// sheet.
import { useState } from 'react'
import styles from './hextech.module.css'

interface Upload { url: string; filename: string | null; kind: string }

export default function UnderConstructionBanner({ importNotes, styleNotes, uploads }: { importNotes?: string | null; styleNotes?: string | null; uploads: Upload[] }) {
  const [open, setOpen] = useState(true)
  const sources = uploads.filter((u) => u.kind === 'source')
  const art = uploads.filter((u) => u.kind === 'art')

  return (
    <div style={{ maxWidth: 960, margin: '12px auto 0', padding: '0 12px' }}>
      <div className={styles.framedPanel} style={{ borderColor: 'var(--hx-gold-1)', background: 'rgba(200,155,60,0.08)' }}>
        <button onClick={() => setOpen((o) => !o)} style={{ width: '100%', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 0 }}>
          <span style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)', letterSpacing: '0.06em', fontSize: 15 }}>🚧 Under Construction — generic sheet (a custom sheet is coming)</span>
          <span style={{ color: 'var(--hx-muted)', fontSize: 13 }}>{open ? '▲' : '▼'}</span>
        </button>

        {open && (
          <div style={{ marginTop: 12, display: 'grid', gap: 14 }}>
            {importNotes && (
              <div>
                <div style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--hx-gold-2)', marginBottom: 4 }}>NOT YET ON THE SHEET (from your import)</div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--hx-text)', border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.4)', padding: '8px 10px' }}>{importNotes}</div>
              </div>
            )}
            {styleNotes && (
              <div>
                <div style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--hx-gold-2)', marginBottom: 4 }}>REQUESTED STYLE &amp; MECHANICS</div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--hx-muted)', border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.4)', padding: '8px 10px' }}>{styleNotes}</div>
              </div>
            )}
            {(sources.length > 0 || art.length > 0) && (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {sources.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--hx-gold-2)', marginBottom: 4 }}>SOURCE FILES ({sources.length})</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {sources.map((u, i) => <a key={i} className={styles.hexBtn} style={{ padding: '3px 8px', fontSize: 12 }} href={u.url} target="_blank" rel="noreferrer">{u.filename ?? `file ${i + 1}`}</a>)}
                    </div>
                  </div>
                )}
                {art.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--hx-gold-2)', marginBottom: 4 }}>REFERENCE ART ({art.length})</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {art.map((u, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <a key={i} href={u.url} target="_blank" rel="noreferrer"><img src={u.url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', border: '1px solid var(--hx-line)' }} /></a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {!importNotes && !styleNotes && sources.length === 0 && art.length === 0 && (
              <p style={{ color: 'var(--hx-muted)', fontSize: 13, margin: 0 }}>Everything from your import mapped cleanly onto the sheet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
