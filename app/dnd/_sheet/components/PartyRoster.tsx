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
    // HEXTECH, NOT THE 5e SHEET'S CLASSES. This was `className="card"` with `.sec-head`/`.sec-num`, which
    // are `theme.css` classes scoped under `.dnd-sheet`. Its ONLY mount is `CampaignHub` — the campaign
    // page, which is hextech chrome and never a 5e sheet — so none of them ever matched, and `.card` fell
    // through to `globals.css`'s MARKETING rule: `background: white` with a red hover border. That is the
    // white panel with washed-out grey text the owner reported.
    //
    // Third instance today of the marketing stylesheet bleeding into /dnd, after the bare-heading ink and
    // this. The pattern: a component written for the sheet, mounted outside it, inheriting a stylesheet
    // nobody expected to be in scope.
    <section style={{
      border: '1px solid var(--hx-line)', borderRadius: 10, background: 'var(--hx-inset-soft)',
      padding: '14px 16px', marginTop: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <span aria-hidden style={{ color: 'var(--hx-teal-1)', fontSize: 12 }}>◉ {'//'}</span>
        <h2 style={{
          margin: 0, fontFamily: 'var(--hx-font-display)', fontSize: 15, letterSpacing: '0.05em',
          textTransform: 'uppercase', color: 'var(--hx-gold-2)',
        }}>Party</h2>
      </div>

      {members.length === 0 ? (
        <p style={{ color: 'var(--hx-muted)', fontSize: 14 }}>No party members yet.</p>
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
                  style={{ width: 64, height: 64, margin: '0 auto', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(1,10,19,0.6)', border: '2px solid var(--hx-line)', color: 'var(--hx-muted)', fontFamily: 'var(--hx-font-display)', fontSize: 22 }}
                >
                  {m.name.trim().charAt(0).toUpperCase() || '?'}
                </div>
              )}
              <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--hx-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
            </div>
          ))}
        </div>
      )}

      {/* Combined party art in the shared lightbox. */}
      <Gallery items={art} emptyText="No character art in the party yet." />
    </section>
  )
}
