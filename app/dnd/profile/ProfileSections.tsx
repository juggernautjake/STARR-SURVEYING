// app/dnd/profile/ProfileSections.tsx — the four panels the profile page was missing (P11-9).
//
// A SERVER component with no client JavaScript: every panel is a list of links, so it renders on first
// paint and needs no hydration. It is passed into `ProfileForm` as a child because that component owns the
// page's `root > screen` wrapper and the sections belong inside it.
//
// Each panel states a COUNT and shows a handful, then links to the full page rather than reimplementing
// it. `/dnd/characters` and `/dnd/content` already do filtering, search and sort properly; a profile that
// tried to be those pages would be a worse copy of both.
import Link from 'next/link';
import styles from '@/app/dnd/_ui/hextech.module.css';
import { relativeTime, type ProfileSummary } from '@/lib/dnd/profile-summary';
import { homebrewKindLabel } from '@/lib/dnd/homebrew/model';

const panel: React.CSSProperties = {
  border: '1px solid var(--hx-line)',
  borderRadius: 10,
  background: 'var(--hx-inset-soft)',
  padding: '14px 16px',
  marginTop: 14,
};
const head: React.CSSProperties = {
  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10,
  flexWrap: 'wrap', marginBottom: 10,
};
const heading: React.CSSProperties = {
  margin: 0, fontFamily: 'var(--hx-font-display)', fontSize: 15, letterSpacing: '0.05em',
  textTransform: 'uppercase', color: 'var(--hx-gold-2)',
};
const link: React.CSSProperties = { fontSize: 12.5, color: 'var(--hx-teal-1)', textDecoration: 'none' };
const row: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
  borderTop: '1px solid var(--hx-line)', minWidth: 0,
};
const rowName: React.CSSProperties = {
  color: 'var(--hx-text)', textDecoration: 'none', fontWeight: 600, fontSize: 13.5,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1,
};
const meta: React.CSSProperties = { fontSize: 11.5, color: 'var(--hx-muted)', flex: 'none' };
const empty: React.CSSProperties = { fontSize: 12.5, color: 'var(--hx-muted)', margin: '2px 0 0' };

function Panel({ title, href, hrefLabel, children }: {
  title: string; href?: string; hrefLabel?: string; children: React.ReactNode;
}) {
  return (
    <section style={panel}>
      <div style={head}>
        <h2 style={heading}>{title}</h2>
        {href && <Link href={href} style={link}>{hrefLabel} →</Link>}
      </div>
      {children}
    </section>
  );
}

export default function ProfileSections({ summary }: { summary: ProfileSummary }) {
  const { characters, campaigns, pieces, activity, counts } = summary;

  return (
    <>
      {/* At a glance. `auto-fit` with a `min()` floor rather than fixed columns, so four tiles become two
          and then one as the screen narrows instead of overflowing — the same shape the hub uses. */}
      <section style={panel}>
        {/* A deliberate 2×2, at every width this column ever gets. The floor is chosen so three tiles can
            never fit: at the 420px cap 3×140+gaps overflows, and at 390px the column is ~358 and it
            overflows harder. Both a 120px and a 92px floor produced a row of THREE with the fourth tile
            stranded underneath, which reads as a wrap accident rather than a set. Four items want 2×2. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))', gap: 8 }}>
          {[
            { n: counts.characters, label: counts.characters === 1 ? 'Character' : 'Characters' },
            { n: counts.campaigns, label: counts.campaigns === 1 ? 'Table' : 'Tables', hint: counts.dmOf ? `DM of ${counts.dmOf}` : undefined },
            { n: counts.pieces, label: counts.pieces === 1 ? 'Homebrew piece' : 'Homebrew pieces' },
            { n: counts.edits, label: counts.edits === 1 ? 'Sheet change' : 'Sheet changes' },
          ].map((t) => (
            <div key={t.label} style={{ textAlign: 'center', padding: '8px 6px', border: '1px solid var(--hx-line)', borderRadius: 8 }}>
              <div style={{ fontFamily: 'var(--hx-font-display)', fontSize: 24, fontWeight: 700, color: 'var(--hx-gold-3)', lineHeight: 1.1 }}>{t.n}</div>
              <div style={{ fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--hx-muted)' }}>{t.label}</div>
              {t.hint && <div style={{ fontSize: 10.5, color: 'var(--hx-teal-1)', marginTop: 2 }}>{t.hint}</div>}
            </div>
          ))}
        </div>
      </section>

      <Panel title="Your characters" href="/dnd/characters" hrefLabel={counts.characters > characters.length ? `All ${counts.characters}` : 'Manage'}>
        {characters.length === 0
          ? <p style={empty}>No characters yet — <Link href="/dnd/characters/new" style={link}>make your first one</Link>.</p>
          : characters.slice(0, 6).map((c) => (
            <div key={c.id} style={row}>
              {c.portrait
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={c.portrait} alt="" width={26} height={26} style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'cover', flex: 'none' }} />
                : <span aria-hidden style={{ width: 26, height: 26, borderRadius: 6, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--hx-inset)', color: 'var(--hx-gold-2)', fontSize: 13 }}>◆</span>}
              <Link href={`/dnd/characters/${c.id}`} style={rowName}>{c.name}</Link>
              <span style={meta}>{c.campaignName ?? 'No table'}</span>
            </div>
          ))}
      </Panel>

      <Panel title="Your tables" href="/dnd" hrefLabel="Portal">
        {campaigns.length === 0
          ? <p style={empty}>Not at a table yet. Join one with an invite code, or start your own from the portal.</p>
          : campaigns.map((c) => (
            <div key={c.id} style={row}>
              <Link href={`/dnd/campaigns/${c.id}`} style={rowName}>{c.name}</Link>
              <span style={{ ...meta, border: '1px solid var(--hx-line)', borderRadius: 999, padding: '1px 7px', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: 10.5, color: c.role === 'dm' ? 'var(--hx-gold-2)' : 'var(--hx-muted)' }}>
                {c.role === 'dm' ? 'DM' : 'Player'}
              </span>
            </div>
          ))}
      </Panel>

      <Panel title="Your content" href="/dnd/content?tab=mine" hrefLabel={counts.pieces > pieces.length ? `All ${counts.pieces}` : 'Browse'}>
        {summary.unavailable.includes('content')
          // "Couldn't load" rather than "you have none" — the two look identical from a `?? 0`, and the
          // wrong one of them is quietly, plausibly false.
          ? <p style={empty}>Your content could not be loaded just now.</p>
          : pieces.length === 0
          ? <p style={empty}>Nothing homebrewed yet — <Link href="/dnd/content/new" style={link}>author a feat, class or item</Link>.</p>
          : pieces.map((p) => (
            <div key={p.id} style={row}>
              <Link href={`/dnd/content/${p.id}`} style={rowName}>{p.name}</Link>
              <span style={meta}>{homebrewKindLabel(p.kind as never)}</span>
              {/* Visibility is worth stating plainly: "did I actually share this" is the question people
                  come to a content list to answer. */}
              <span style={{ ...meta, color: p.isPublic ? 'var(--hx-teal-1)' : 'var(--hx-muted)' }}>{p.isPublic ? 'Public' : 'Private'}</span>
            </div>
          ))}
      </Panel>

      <Panel title="Recent activity">
        {summary.unavailable.includes('activity')
          ? <p style={empty}>Your recent activity could not be loaded just now.</p>
          : activity.length === 0
          ? <p style={empty}>No sheet changes logged yet. Every edit you make is recorded here, and can be undone from the sheet.</p>
          : activity.map((a, i) => (
            <div key={`${a.createdAt}-${i}`} style={{ ...row, alignItems: 'flex-start' }}>
              <span aria-hidden style={{ ...meta, color: a.source === 'ai' ? 'var(--hx-teal-1)' : 'var(--hx-gold-2)', marginTop: 2 }}>
                {a.source === 'ai' ? '✦' : a.source === 'revert' ? '⟲' : '✎'}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--hx-text)' }}>
                {a.summary}
                {a.characterName && (
                  <>
                    {' — '}
                    <Link href={`/dnd/characters/${a.characterId}`} style={link}>{a.characterName}</Link>
                  </>
                )}
              </span>
              <span style={meta}>{relativeTime(a.createdAt)}</span>
            </div>
          ))}
      </Panel>

      {/* No "signed in as a player · Suggest something" line here. It said nothing the page does not
          already show, and the site footer on this very page carries a full Suggestions & Requests
          panel — a second, weaker link to the same place is clutter, not a shortcut. */}
      <div className={styles.divider}><span className={styles.diamond} /></div>
    </>
  );
}
