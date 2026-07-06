'use client'
// Party roster + gallery (Phase D5) — every party member's token + art at a glance.
// Presentational: takes the members; the container (PartyGallery) fetches them.
// Reuses the D4 Gallery for the combined party art lightbox.
import Gallery, { type GalleryItem } from './Gallery'

export interface PartyMember {
  id: string
  name: string
  artUrl?: string | null
  tokenUrl?: string | null
}

export default function PartyRoster({ members }: { members: PartyMember[] }) {
  const art: GalleryItem[] = members.filter((m) => m.artUrl).map((m) => ({ url: m.artUrl as string, label: m.name }))

  return (
    <section className="card">
      <div className="sec-head">
        <span className="sec-num">◉ {'//'}</span>
        <h2 style={{ display: 'inline', marginLeft: 8 }}>Party</h2>
      </div>

      {members.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>No party members yet.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 12, marginBottom: 14 }}>
          {members.map((m) => (
            <div key={m.id} style={{ textAlign: 'center' }}>
              {m.tokenUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.tokenUrl}
                  alt={`${m.name} token`}
                  style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--violet-2)', boxShadow: '0 0 10px rgba(139,92,246,0.4)' }}
                />
              ) : (
                <div
                  aria-hidden
                  style={{ width: 64, height: 64, margin: '0 auto', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(1,10,19,0.6)', border: '2px solid var(--line)', color: 'var(--muted-2)', fontFamily: 'var(--font-display)', fontSize: 22 }}
                >
                  {m.name.trim().charAt(0).toUpperCase() || '?'}
                </div>
              )}
              <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
            </div>
          ))}
        </div>
      )}

      {/* Combined party art in the shared lightbox. */}
      <Gallery items={art} emptyText="No character art in the party yet." />
    </section>
  )
}
