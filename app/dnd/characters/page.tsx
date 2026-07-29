// app/dnd/characters — every character you have (P4-1, audit finding D-1).
//
// There was no such page. The only list of a user's characters was a card grid on the lobby showing name,
// portrait and campaign — **no system, no class, no level** — with no search, filter, sort, duplicate or
// delete. Someone with twenty characters had no way to find one except by scrolling and recognising the
// portrait, and the header menu offered no way here at all.
//
// A SERVER page with `searchParams` filters and no client JavaScript, the same shape as `/dnd/content`:
// the filters are links, the search is a plain GET form, it renders on first paint, and a filtered view is
// a URL you can keep.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import CharacterRowActions from '@/app/dnd/_ui/CharacterRowActions';
import styles from '@/app/dnd/_ui/hextech.module.css';
import { characterCard, characterMatches } from '@/lib/dnd/character-card';
import { availableSystems, SYSTEM_AMBIGUOUS } from '@/lib/dnd/systems';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My Characters | Starr Tabletop' };

interface Row {
  id: string;
  name: string;
  system: string | null;
  data: unknown;
  campaign_id: string | null;
  token_url: string | null;
  art_url: string | null;
  is_npc: boolean | null;
  /** Needed for the per-row Delete gate (P4-1b): only the OWNER may delete, not an assigned player. */
  owner_user_id: string | null;
  updated_at: string | null;
}

function one(sp: Record<string, string | string[] | undefined>, k: string): string {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

export default async function MyCharactersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = getDndSession();
  // A character list is inherently personal — there is no "everyone's characters" view to fall back to.
  if (!session) redirect('/dnd');

  const q = one(searchParams, 'q').trim();
  const systemFilter = one(searchParams, 'system');

  // Owned OR played — the same rule `loadUserProfile` uses, because an assigned player's character is
  // theirs to open even when someone else created it.
  const { data } = await supabaseAdmin
    .from('dnd_characters')
    .select('id, name, system, data, campaign_id, token_url, art_url, is_npc, owner_user_id, updated_at')
    .or(`owner_user_id.eq.${session.userId},played_by_user_id.eq.${session.userId}`)
    .order('updated_at', { ascending: false })
    .limit(300);

  const rows = (data ?? []) as Row[];

  // Campaign names in one batched lookup — the alternative is a query per card.
  const campaignIds = [...new Set(rows.map((r) => r.campaign_id).filter((v): v is string => !!v))];
  const campaignNames = new Map<string, string>();
  if (campaignIds.length) {
    const { data: camps } = await supabaseAdmin.from('dnd_campaigns').select('id, name').in('id', campaignIds);
    for (const c of (camps ?? []) as { id: string; name: string }[]) campaignNames.set(c.id, c.name);
  }

  const cards = rows.map((r) => ({ row: r, card: characterCard(r.data, r.system) }));
  const shown = cards
    .filter(({ card }) => !systemFilter || card.system === systemFilter)
    .filter(({ row, card }) => characterMatches(row.name, card, q));

  // Counts come from the UNFILTERED set, so a chip reading "Pathfinder 2e · 3" stays true while you are
  // looking at a different system.
  const countFor = (key: string) => cards.filter(({ card }) => card.system === key).length;

  const chip = (label: string, href: string, active: boolean) => (
    <Link
      key={href + label}
      href={href}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999,
        fontSize: 12, textDecoration: 'none', fontFamily: 'var(--hx-font-display, inherit)',
        border: active ? '1px solid var(--hx-teal-1)' : '1px solid var(--hx-line)',
        background: active ? 'rgba(10,200,185,0.14)' : 'rgba(255,255,255,0.03)',
        color: active ? 'var(--hx-teal-1)' : 'var(--hx-text)', opacity: active ? 1 : 0.82,
      }}
    >
      {label}
    </Link>
  );

  const withSystem = (key?: string) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (key) p.set('system', key);
    const s = p.toString();
    return s ? `/dnd/characters?${s}` : '/dnd/characters';
  };

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 16 }}>
          <div>
            <Link className={styles.hexBtn} href="/dnd" style={{ marginBottom: 10 }}>← Lobby</Link>
            <h1 className={styles.title} style={{ textAlign: 'left', margin: '8px 0 0' }}>My Characters</h1>
            <p style={{ color: 'var(--hx-muted)', margin: '4px 0 0' }}>
              {cards.length} character{cards.length === 1 ? '' : 's'} — everything you own or play, newest
              first.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Link className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} href="/dnd/characters/new" style={{ textDecoration: 'none' }}>
              ＋ New character
            </Link>
            <form method="GET" action="/dnd/characters" style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              {systemFilter && <input type="hidden" name="system" value={systemFilter} />}
              <input className={styles.input} name="q" defaultValue={q} placeholder="Search by name, class…"
                aria-label="Search your characters" style={{ width: 220, padding: '7px 10px' }} />
              <button className={styles.hexBtn} type="submit" style={{ padding: '7px 14px' }}>Search</button>
            </form>
          </div>

          <section className={styles.framedPanel} style={{ padding: '10px 14px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className={styles.framedPanelTop} />
            <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--hx-gold-2)', minWidth: 62 }}>SYSTEM //</span>
            {chip(`All · ${cards.length}`, withSystem(), !systemFilter)}
            {availableSystems().map((s) => chip(`${s.name} · ${countFor(s.key)}`, withSystem(s.key), systemFilter === s.key))}
            {countFor(SYSTEM_AMBIGUOUS) > 0
              && chip(`No system · ${countFor(SYSTEM_AMBIGUOUS)}`, withSystem(SYSTEM_AMBIGUOUS), systemFilter === SYSTEM_AMBIGUOUS)}
          </section>

          {shown.length === 0 ? (
            <section className={styles.framedPanel} style={{ padding: '22px 18px', textAlign: 'center' }}>
              <div className={styles.framedPanelTop} />
              <p style={{ margin: 0, color: 'var(--hx-muted)', fontSize: 13.5, lineHeight: 1.6 }}>
                {cards.length === 0
                  ? 'You haven’t made a character yet.'
                  : 'Nothing matches those filters.'}
              </p>
            </section>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {shown.map(({ row, card }) => (
                // A DIV wrapping a link, not a link wrapping everything (P4-1b). The card used to be one
                // big <Link>; putting Duplicate / Export / Delete inside it would nest interactive elements
                // inside an anchor — invalid HTML, and a click on "Delete" would also navigate to the sheet.
                <div
                  key={row.id}
                  className={styles.framedPanel}
                  style={{ color: 'inherit', padding: '12px 14px', display: 'grid', gap: 6, alignContent: 'start' }}
                >
                <Link
                  href={`/dnd/characters/${row.id}`}
                  style={{ textDecoration: 'none', color: 'inherit', display: 'grid', gap: 6 }}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {row.token_url || row.art_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className={styles.portrait} src={row.token_url ?? row.art_url ?? ''} alt=""
                        style={{ width: 46, height: 46, flex: '0 0 auto' }} />
                    ) : (
                      <span className={styles.portrait} style={{ width: 46, height: 46, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)', flex: '0 0 auto' }}>
                        {(row.name || '?').charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span style={{ display: 'grid', gap: 1, minWidth: 0 }}>
                      <strong style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)', fontSize: 14.5, wordBreak: 'break-word' }}>
                        {row.name}
                      </strong>
                      {/* The three facts the old lobby grid never showed. */}
                      {card.line && <span style={{ fontSize: 12, color: 'var(--hx-text)', opacity: 0.85 }}>{card.line}</span>}
                    </span>
                  </div>
                  <span style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--hx-teal-1)' }}>
                    {card.systemName}
                    {row.is_npc && <span style={{ color: 'var(--hx-muted)' }}> · NPC</span>}
                  </span>
                  {row.campaign_id && (
                    <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>
                      {campaignNames.get(row.campaign_id) ?? 'In a campaign'}
                    </span>
                  )}
                </Link>
                {/* Manage from here rather than only from inside the sheet (P4-1b). `canDelete` mirrors the
                    server's rule — only the OWNER may delete, not an assigned player — so a player who was
                    handed someone else's character is not shown a button that would refuse them. */}
                <CharacterRowActions id={row.id} name={row.name} canDelete={row.owner_user_id === session.userId} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
