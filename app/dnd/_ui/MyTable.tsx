// MyTable (Phase P) — the signed-in user's own stuff on the /dnd hub: the campaigns
// they're running (DM) and playing in, plus the characters they own. Server component
// (plain links). Clicking a campaign opens its hub; clicking a character opens the sheet.
import Link from 'next/link';
import styles from './hextech.module.css';
import type { UserProfile } from '@/lib/dnd/campaign-summary';
import NewCampaignButton from './NewCampaignButton';

function CampaignRow({ id, name, tag }: { id: string; name: string; tag: string }) {
  return (
    <Link
      href={`/dnd/campaigns/${id}`}
      className={styles.framedPanel}
      style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px' }}
    >
      <span style={{ fontFamily: 'var(--hx-font-display)', fontSize: 15, color: 'var(--hx-gold-2)' }}>{name}</span>
      <span style={{ fontSize: 10, letterSpacing: '0.12em', color: tag === 'DM' ? 'var(--hx-gold-2)' : 'var(--hx-teal-1)', border: '1px solid currentColor', padding: '1px 6px' }}>{tag}</span>
    </Link>
  );
}

export default function MyTable({ profile }: { profile: UserProfile }) {
  const running = profile.campaigns.filter((c) => c.role === 'dm');
  const playing = profile.campaigns.filter((c) => c.role === 'player');
  const nothing = running.length === 0 && playing.length === 0 && profile.characters.length === 0;

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {/* Anyone signed in can start a campaign (and as many as they like). Becomes theirs to DM. */}
      <NewCampaignButton />

      {/* The Content Studio door (P6-7). The owner asked for "a content builder button on the user page",
          and this is the user page. It sits beside "new campaign" rather than inside a menu because
          authoring content is a top-level thing you DO here, not a setting — and because this project's
          recurring defect is finishing a feature nobody can find. */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link
          href="/dnd/content/new"
          className={`${styles.hexBtn} ${styles.hexBtnPrimary}`}
          style={{ textDecoration: 'none', padding: '10px 16px' }}
          title="Build a class, feat, item, creature or anything else — for any system — and keep it private or share it."
        >
          🔨 Content Builder
        </Link>
        <Link
          href="/dnd/content?tab=mine"
          className={styles.hexBtn}
          style={{ textDecoration: 'none', padding: '10px 16px' }}
          title="Everything you have made."
        >
          My custom content
        </Link>
        <Link
          href="/dnd/content"
          className={styles.hexBtn}
          style={{ textDecoration: 'none', padding: '10px 16px' }}
          title="Browse what everyone has published."
        >
          Browse everyone’s
        </Link>
      </div>

      {/* P4-5. The lobby could START a campaign and BUILD content, but not make a character, reach your
          profile, or open the library — the three things a signed-in player most often wants from the page
          that is supposed to be their home. All three existed; none was linked from the page body.

          A second row rather than one long wrap: the row above is about CONTENT you author, this one is
          about YOU and your characters. Same visual weight, different question. */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link
          href="/dnd/characters/new"
          className={`${styles.hexBtn} ${styles.hexBtnPrimary}`}
          style={{ textDecoration: 'none', padding: '10px 16px' }}
          title="Build a character in any system — guided, manual, or from a file."
        >
          ＋ Character
        </Link>
        <Link
          href="/dnd/characters"
          className={styles.hexBtn}
          style={{ textDecoration: 'none', padding: '10px 16px' }}
          title="Every character you own or play."
        >
          My characters
        </Link>
        <Link
          href="/dnd/library"
          className={styles.hexBtn}
          style={{ textDecoration: 'none', padding: '10px 16px' }}
          title="Rules, classes, spells and conditions for every playable system."
        >
          📖 Rules library
        </Link>
        <Link
          href="/dnd/profile"
          className={styles.hexBtn}
          style={{ textDecoration: 'none', padding: '10px 16px' }}
          title="Your display name, avatar, password and recovery code."
        >
          Profile
        </Link>
      </div>

      {nothing && (
        <p style={{ color: 'var(--hx-muted)', textAlign: 'center', fontSize: 13 }}>
          You&apos;re signed in, but you&apos;re not in any campaigns yet. Start one above, ask your DM to add you, or browse the tables below.
        </p>
      )}

      {running.length > 0 && (
        <section style={{ display: 'grid', gap: 8 }}>
          <h2 className={styles.panelTitle} style={{ margin: 0, fontSize: 13 }}>⚔️ Campaigns you run</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {running.map((c) => <CampaignRow key={c.id} id={c.id} name={c.name} tag="DM" />)}
          </div>
        </section>
      )}

      {playing.length > 0 && (
        <section style={{ display: 'grid', gap: 8 }}>
          <h2 className={styles.panelTitle} style={{ margin: 0, fontSize: 13 }}>🎲 Campaigns you&apos;re in</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {playing.map((c) => <CampaignRow key={c.id} id={c.id} name={c.name} tag="PLAYER" />)}
          </div>
        </section>
      )}

      {profile.characters.length > 0 && (
        <section style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <h2 className={styles.panelTitle} style={{ margin: 0, fontSize: 13 }}>Your characters</h2>
            {/* This grid shows name + portrait only. Anyone with more than a handful needs the real index,
                which is what P4-1 built — and until it existed there was nowhere to send them. */}
            <Link href="/dnd/characters" style={{ fontSize: 12, color: 'var(--hx-teal-1)', textDecoration: 'none' }}>
              See all →
            </Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {profile.characters.map((ch) => (
              <Link
                key={ch.id}
                href={`/dnd/characters/${ch.id}`}
                className={styles.framedPanel}
                style={{ textDecoration: 'none', textAlign: 'center', padding: '16px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
              >
                {ch.portrait ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={styles.portrait} src={ch.portrait} alt="" style={{ width: 72, height: 72 }} />
                ) : (
                  <span className={styles.portrait} style={{ width: 72, height: 72, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)' }}>
                    {(ch.name || '?').charAt(0).toUpperCase()}
                  </span>
                )}
                <span style={{ fontFamily: 'var(--hx-font-display)', fontSize: 14, color: 'var(--hx-gold-2)', wordBreak: 'break-word' }}>{ch.name}</span>
                {ch.campaignName && <span style={{ fontSize: 11, color: 'var(--hx-muted)' }}>{ch.campaignName}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
