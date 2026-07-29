// Public campaigns hub (the /dnd home) — a card per campaign showing its setting, DM,
// players, and characters. Clicking a card opens that campaign. Server component (plain
// links, no client JS). `embedded` renders just the section (no page chrome) so the hub
// page can stack it under the sign-in + "my table" panels.
import Link from 'next/link';
import styles from './hextech.module.css';
import type { CampaignCard } from '@/lib/dnd/campaign-summary';

function CampaignGrid({ campaigns, heading }: { campaigns: CampaignCard[]; heading?: string }) {
  return (
    <section style={{ display: 'grid', gap: 10 }}>
      {heading && <h2 className={styles.panelTitle} style={{ margin: 0, fontSize: 13 }}>{heading}</h2>}
      {campaigns.length === 0 ? (
        // NOT "No campaigns yet." (P11-1). This grid is the PUBLIC index — since P2-5 it lists public,
        // non-archived tables only, and every existing campaign was backfilled to `unlisted`. So a signed-in
        // player with a campaign of their own, listed two inches higher under "Campaigns you're in", read
        // "All campaigns — No campaigns yet." directly beneath it. Both halves were wrong: it is not "all",
        // and they plainly do have one. The heading is fixed below; this says what is actually true.
        <p style={{ color: 'var(--hx-muted)', textAlign: 'center', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          No public tables right now. Campaigns are <strong>unlisted</strong> by default — yours are above,
          and a DM can list one from its manage page.
        </p>
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
    </section>
  );
}

export default function CampaignsHome({ campaigns, embedded = false }: { campaigns: CampaignCard[]; embedded?: boolean }) {
  if (embedded) return <CampaignGrid campaigns={campaigns} heading="Public tables" />;

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 960, display: 'grid', gap: 20, margin: '0 auto' }}>
          <div style={{ textAlign: 'center' }}>
            <p className={styles.brand}>Starr Tabletop</p>
            <h1 className={styles.title}>Campaigns</h1>
            <p className={styles.subtitle}>Pick a campaign to open its table — players jump into their character sheets, the DM into the control panel.</p>
          </div>
          <CampaignGrid campaigns={campaigns} />
        </div>
      </div>
    </div>
  );
}
