'use client'
// MlmPanel — Donata Dime's bespoke "Business" tab (the `mlm` module). Renders her
// downline scoreboard, the Rank=Level career ladder (highlighting her current level),
// the Harmonyte Lattice™ pyramid, and the Product Line™. Read-first flavor that makes
// the pyramid-scheme mechanics part of the sheet. Styled with shared sheet classes so
// the `.skin-donata` treatment carries the look.
import { useChar } from '../state/store'

interface Rung { lvl: number; rank: string; obj: string; raise: string }
const LADDER: Rung[] = [
  { lvl: 1, rank: 'Prospect', obj: 'Sit through one 3-hour “opportunity” Zoom.', raise: 'A tote bag (invoiced to you).' },
  { lvl: 2, rank: 'Sparkler', obj: 'Buy the Founder’s Bundle (999 gp).', raise: 'The title “business owner.”' },
  { lvl: 3, rank: 'Mojo Maker', obj: 'Recruit 1 Maguffin & stay “Active.”', raise: '5% off your own inventory.' },
  { lvl: 4, rank: 'Radiant Rep', obj: '3 recruits + monthly minimum.', raise: 'Your name in the newsletter.' },
  { lvl: 5, rank: 'Bronze Boss Babe', obj: 'Personal Volume 500 gp/mo.', raise: 'A bronze pin. 🥉' },
  { lvl: 6, rank: 'Shimmer Sister', obj: 'Build a team of 10.', raise: '“Leadership retreat” (you fund travel).' },
  { lvl: 7, rank: 'Ruby Recruiter', obj: 'Team of 25.', raise: 'A ruby pin. 💎' },
  { lvl: 8, rank: 'Sapphire Sponsor', obj: 'Team volume 5,000 gp/mo.', raise: 'A shout-out from the stage.' },
  { lvl: 9, rank: 'Emerald Executive', obj: 'Three “legs” of 10 each.', raise: 'Branded scrying-crystal case.' },
  { lvl: 10, rank: 'Diamond Downline', obj: 'Team of 100.', raise: 'A “SIX-FIGURE MINDSET” certificate.' },
  { lvl: 11, rank: 'Double Diamond', obj: '2 Diamonds in your downline.', raise: 'A charm bracelet.' },
  { lvl: 12, rank: 'Platinum Priestess', obj: 'Team volume 25,000 gp/mo.', raise: 'Featured on the podcast. 🎙️' },
  { lvl: 13, rank: 'Crown Crystal', obj: 'Team of 400.', raise: 'The Pink Pterodactyl™ (36-mo lease).' },
  { lvl: 14, rank: 'Harmonyte Highness', obj: '5 Diamond legs.', raise: 'A tiara (rented, tracked).' },
  { lvl: 15, rank: 'Presidential Prism', obj: 'Team volume 100,000 gp/mo.', raise: '“President’s Club” cruise (upsold).' },
  { lvl: 16, rank: 'Ambassador of Abundance', obj: 'Team of 1,000.', raise: 'A keynote slot. 🎤' },
  { lvl: 17, rank: 'Her Serene Diamond Excellency', obj: '10 Diamond legs.', raise: 'A statue in the lobby-cave.' },
  { lvl: 18, rank: 'Galactic Grandmaster', obj: 'Team volume 500,000 gp/mo.', raise: 'A seat on the shared Harmonyte jet.' },
  { lvl: 19, rank: 'Legacy Luminary', obj: 'Personally mint a new Matriarch.', raise: 'An HQ wing named after you.' },
  { lvl: 20, rank: 'Grand Maguffin Matriarch', obj: 'Be Mighty Mojo’s blessed #1 — his call.', raise: 'One rung below the tip. Still under Mojo.' },
]

const TIERS = [
  { n: '✚ MIGHTY MOJO ✚', d: 'Founder-Prophet · owns it all', c: '#3a1f5c' },
  { n: 'Grand Maguffin Matriarch', d: '1 seat (Donata swears it’s hers)', c: 'var(--gold)' },
  { n: 'Presidential Prism', d: 'the “uplines”', c: 'var(--violet)' },
  { n: 'Diamond Downline', d: 'true believers', c: '#a855f7' },
  { n: 'Sapphire / Crystal', d: 'grinding hard', c: 'var(--hotpink)' },
  { n: 'Sparklers', d: 'you & everyone you love', c: '#ff6fb0' },
]

const PRODUCTS: [string, string, string][] = [
  ['Mojo Dust™', '79 gp', '“Activated” Harmonyte glitter. It is glitter.'],
  ['Spark Serum™', '120 gp', 'Roll-on “vibration” oil. “10× your inner Spark.”'],
  ['Harmony Wraps™', '220 gp', 'Contouring body wraps. The tightening is dehydration.'],
  ['Mojo Shake™', '95 gp', 'Meal-replacement. “Gut harmony in a scoop.” Chalk.'],
  ['Lucky Luminites™', '45 gp', 'Collectible charms. Literal MacGuffins (214 to collect).'],
  ['Founder’s Bundle', '999 gp', 'THE buy-in. Where the money goes UP, not down.'],
]

const label: React.CSSProperties = { color: 'var(--gold)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }

export default function MlmPanel() {
  const { char } = useChar()
  const cur = char.meta.level

  return (
    <>
      {/* Downline scoreboard */}
      <section>
        <div className="card">
          <h3 style={label}>My Downline // The Journey So Far</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(96px,1fr))', gap: 10, marginTop: 8 }}>
            {[
              ['Years In', '6', 'and counting!'],
              ['Current Rank', `L${cur}`, LADDER.find((r) => r.lvl === cur)?.rank ?? '—'],
              ['Net Earnings', '−18,400', 'gp (“reinvested”)'],
              ['Recruits Kept', '0', '“not ready”'],
              ['Faith', '100%', 'unshakable 💗'],
            ].map(([k, v, s], i) => (
              <div key={i} style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>{k}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--hotpink)', fontFamily: 'var(--font-mono)' }}>{v}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0' }}>
            Six years in the “business,” stuck at rank <b>{LADDER.find((r) => r.lvl === cur)?.rank ?? '—'}</b>, deeply in the red — and
            <b> completely, radiantly convinced next quarter is her quarter.</b> Her business cards say “Grand Maguffin Matriarch.”
            The company records say otherwise. She has never noticed the gap.
          </p>
        </div>
      </section>

      {/* Rank = Level ladder */}
      <section>
        <div className="card">
          <h3 style={label}>Rank = Level // She levels by climbing the company</h3>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 10px' }}>
            No XP from fighting — she gains a level only when the DM approves a <b>promotion</b>. Rungs 1–{cur} = her real progress; the rest is where she <i>swears</i> she’s headed.
          </p>
          <div style={{ display: 'grid', gap: 6 }}>
            {LADDER.map((r) => {
              const here = r.lvl === cur
              const done = r.lvl < cur
              return (
                <div key={r.lvl} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10,
                  border: here ? '2px solid var(--hotpink)' : '1px solid var(--line)',
                  background: here ? 'rgba(224,20,140,0.10)' : 'var(--panel-2)',
                  opacity: done || here ? 1 : 0.5,
                }}>
                  <span style={{
                    flex: '0 0 auto', width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center',
                    fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 14,
                    background: here ? 'linear-gradient(120deg,var(--hotpink),var(--gold))' : done ? 'linear-gradient(120deg,var(--hotpink),var(--violet))' : 'var(--panel-3)',
                    color: here || done ? '#fff' : 'var(--muted)',
                  }}>{r.lvl}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 800, color: 'var(--ink)' }}>{r.rank}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}><b style={{ color: 'var(--tealbright)' }}>Promotion:</b> {r.obj} · <b style={{ color: 'var(--tealbright)' }}>Raise:</b> {r.raise}</span>
                  </span>
                  {here && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff', background: 'var(--hotpink)', padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>You are here · Yr 6</span>}
                  {done && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--good)', whiteSpace: 'nowrap' }}>✓</span>}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* The pyramid + products */}
      <section>
        <div className="card">
          <h3 style={label}>The Harmonyte Lattice™ // (legally, not a pyramid)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, margin: '8px 0 4px' }}>
            {TIERS.map((t, i) => (
              <div key={i} style={{
                width: `min(${34 + i * 11}ch, ${42 + i * 10}%)`, color: '#fff', fontWeight: 800, textAlign: 'center',
                borderRadius: 9, padding: '9px 8px', background: `linear-gradient(120deg, ${t.c}, color-mix(in srgb, ${t.c} 55%, #000))`,
              }}>
                <span style={{ fontSize: 13.5 }}>{t.n}</span>
                <span style={{ display: 'block', fontSize: 11, opacity: 0.9, fontWeight: 600 }}>{t.d}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--muted)', textAlign: 'center', margin: '6px 0 0' }}>Every tier funnels “commission” upward to Mighty Mojo. The shape is a coincidence.</p>
        </div>
      </section>

      <section>
        <div className="card">
          <h3 style={label}>The Product Line™ // “It basically sells itself.”</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10, marginTop: 8 }}>
            {PRODUCTS.map(([n, p, d], i) => (
              <div key={i} style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontWeight: 800, color: 'var(--ink)' }}>{n}</div>
                <div style={{ color: 'var(--hotpink)', fontWeight: 800, fontFamily: 'var(--font-mono)', margin: '2px 0 4px' }}>{p}</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
