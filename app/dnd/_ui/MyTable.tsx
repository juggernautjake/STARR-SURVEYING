// MyTable (Phase P) — the signed-in user's own stuff on the /dnd hub: the campaigns
// they're running (DM) and playing in, plus the characters they own. Server component
// (plain links). Clicking a campaign opens its hub; clicking a character opens the sheet.
import Link from 'next/link';
import styles from './hextech.module.css';
import type { UserProfile } from '@/lib/dnd/campaign-summary';
import NewCampaignButton from './NewCampaignButton';

/**
 * One labelled group of hub actions (P11-1).
 *
 * These were two bare `flex-wrap` rows. Flex-wrap gives every button its own intrinsic width, so seven
 * buttons of seven different lengths wrapped into a ragged staircase — four uneven rows on a phone, two
 * lopsided ones on a desktop — and "＋ New campaign" floated on a line of its own above them, orphaned
 * from the actions it belongs with.
 *
 * An auto-fit GRID instead: every button in a group is the same width, the columns reflow by viewport
 * rather than by how long the words happen to be, and the two groups get the headings the old code only
 * described in a comment ("the row above is about CONTENT you author, this one is about YOU"). A reader
 * should not have to infer the grouping from the wrap points.
 */
function ActionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'grid', gap: 7 }}>
      <h2 className={styles.panelTitle} style={{ margin: 0, fontSize: 12 }}>{label}</h2>
      <div style={{
        display: 'grid',
        // 150px keeps two columns on a 390px phone and four on a desktop; `min(…, 100%)` collapses to one
        // column on anything narrower rather than overflowing. A label that still wraps costs a line, not
        // the row's alignment — see the equal-height rule in ActionLink.
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))',
        gap: 8,
      }}>
        {children}
      </div>
    </section>
  );
}

/** Every hub action looks the same and fills its cell — the grid decides the width, not the text. */
function ActionLink({ href, title, primary, children }: { href: string; title: string; primary?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={primary ? `${styles.hexBtn} ${styles.hexBtnPrimary}` : styles.hexBtn}
      title={title}
      style={{
        textDecoration: 'none', padding: '10px 14px', textAlign: 'center',
        // Flex + `height: 100%` so a label that wraps to two lines ("Everyone's content" at 390px) does not
        // make its row ragged again — the whole row grows together and the text stays centred. The grid was
        // only half the fix; equal WIDTH without equal HEIGHT is a different staircase.
        display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%',
        // 44px is the smallest reliable touch target. These are the hub's primary actions on a phone.
        minHeight: 44, lineHeight: 1.25,
      }}
    >
      {children}
    </Link>
  );
}

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
      <ActionGroup label="Start something">
        <NewCampaignButton />
        <ActionLink href="/dnd/characters/new" primary title="Build a character in any system — guided, manual, or from a file.">
          ＋ Character
        </ActionLink>
        <ActionLink href="/dnd/content/new" primary title="Build a class, feat, item, creature or anything else — for any system — and keep it private or share it.">
          🔨 Content Builder
        </ActionLink>
      </ActionGroup>

      <ActionGroup label="Yours">
        <ActionLink href="/dnd/characters" title="Every character you own or play.">My characters</ActionLink>
        <ActionLink href="/dnd/content?tab=mine" title="Everything you have made.">My content</ActionLink>
        <ActionLink href="/dnd/profile" title="Your display name, avatar, password and recovery code.">Profile</ActionLink>
      </ActionGroup>

      <ActionGroup label="Browse">
        <ActionLink href="/dnd/library" title="Rules, classes, spells and conditions for every playable system.">📖 Rules library</ActionLink>
        <ActionLink href="/dnd/content" title="Browse what everyone has published.">Everyone’s content</ActionLink>
      </ActionGroup>

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
