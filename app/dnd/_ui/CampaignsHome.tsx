// Public campaigns hub (the /dnd home) — a card per campaign showing its setting, DM,
// players, and characters. Clicking a card opens that campaign's lobby. Server component
// (plain links, no client JS).
import Link from 'next/link';
import styles from './hextech.module.css';
import type { CampaignCard } from '@/lib/dnd/campaign-summary';

export default function CampaignsHome({ campaigns }: { campaigns: CampaignCard[] }) {
  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 960, display: 'grid', gap: 20, margin: '0 auto' }}>
          <div style={{ textAlign: 'center' }}>
            <p className={styles.brand}>Starr Tabletop</p>
            <h1 className={styles.title}>Campaigns</h1>
            <p className={styles.subtitle}>Pick a campaign to open its table — players jump into their character sheets, the DM into the control panel.</p>
          </div>

          {campaigns.length === 0 ? (
            <p style={{ color: 'var(--hx-muted)', textAlign: 'center' }}>No campaigns yet.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {campaigns.map((c) => (
                <Link
                  key={c.id}
                  href={`/dnd/campaigns/${c.id}`}
                  className={styles.framedPanel}
                  style={{ textDecoration: 'none', display: 'grid', gap: 10, padding: '18px 16px' }}
                >
                  <div className={styles.framedPanelTop} />
                  <h2 className={styles.panelTitle} style={{ margin: 0 }}>{c.name}</h2>
                  {c.setting && <p style={{ color: 'var(--hx-gold-3)', margin: 0, fontSize: 13, lineHeight: 1.5 }}>{c.setting}</p>}
                  <div style={{ display: 'grid', gap: 4, fontSize: 12.5, color: 'var(--hx-muted)' }}>
                    <div><span style={{ color: 'var(--hx-gold-2)' }}>DM:</span> {c.dmName ?? '—'}</div>
                    <div><span style={{ color: 'var(--hx-teal-1)' }}>Players:</span> {c.playerNames.length ? c.playerNames.join(', ') : '—'}</div>
                    <div><span style={{ color: 'var(--hx-teal-1)' }}>Characters:</span> {c.characterNames.length ? c.characterNames.join(', ') : '—'}</div>
                  </div>
                  <span style={{ marginTop: 4, fontSize: 12, color: 'var(--hx-gold-2)', letterSpacing: '0.08em' }}>Open table →</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
