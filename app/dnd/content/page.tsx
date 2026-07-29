// app/dnd/content/page.tsx — the Content Studio's browse surface (P6-5).
//
// The owner's ask, verbatim: *"We need a way to view all of the custom content."* This is it — every piece
// the viewer may see, filterable by kind and system, searchable, split into what they made and what the
// community published.
//
// A SERVER component with `searchParams`-driven filters and no client JavaScript at all: the filters are
// links and the search is a plain GET form. That is not minimalism for its own sake — it means the page
// works on a first paint, is linkable in the state you filtered it into (a DM can paste "every public
// Pathfinder 2e creature" into their table's chat), and cannot suffer the blank-character flash that cost
// this project a whole slice on the sheet.
//
// It queries Postgres directly rather than fetching its own API. An RSC calling its own route pays a second
// HTTP round trip to re-do work it could do inline, and would need the cookie forwarded to get the viewer
// right. The AUTHORIZATION is shared either way — both paths call `visibleHomebrew` from
// `lib/dnd/homebrew/store.ts`, which is the module with the 27 tests, so the page and the API can never
// disagree about who sees what.
import type { Metadata } from 'next';
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import styles from '@/app/dnd/_ui/hextech.module.css';
import { homebrewKindLabel, homebrewMatchesSearch, isHomebrewKind, type HomebrewKind } from '@/lib/dnd/homebrew/model';
import { rowToHomebrew, visibleHomebrew, type HomebrewRow, type StoredHomebrew } from '@/lib/dnd/homebrew/store';
import { allKindSpecs, kindSpec, KIND_GROUPS } from '@/lib/dnd/homebrew/kinds';
import { availableSystems, systemLabel, normalizeSystem } from '@/lib/dnd/systems';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Custom Content | Starr Tabletop' };

type Tab = 'public' | 'mine';

interface Query { tab: Tab; kind?: HomebrewKind; system?: string; q: string }

function readQuery(sp: Record<string, string | string[] | undefined>): Query {
  // A repeated query param arrives as an array (`?kind=item&kind=feat`); take the first and move on rather
  // than erroring — a duplicated facet is a stray link, not a request worth refusing.
  const one = (k: string): string => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? '';
  };
  const kind = one('kind');
  const system = one('system');
  return {
    tab: one('tab') === 'mine' ? 'mine' : 'public',
    ...(isHomebrewKind(kind) ? { kind } : {}),
    ...(system === 'any' || availableSystems().some((s) => s.key === system) ? { system } : {}),
    q: one('q').trim(),
  };
}

/** Rebuild the URL with one facet changed — how every filter link is produced, so a link can never carry
 *  a facet the page does not read. Passing `undefined` clears that facet. */
function hrefWith(q: Query, patch: Partial<Record<'tab' | 'kind' | 'system' | 'q', string | undefined>>): string {
  const next = new URLSearchParams();
  const merged = { tab: q.tab, kind: q.kind, system: q.system, q: q.q, ...patch };
  for (const [k, v] of Object.entries(merged)) if (v) next.set(k, String(v));
  const s = next.toString();
  return s ? `/dnd/content?${s}` : '/dnd/content';
}

export default async function ContentBrowsePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = getDndSession();
  const viewer = { userId: session?.userId ?? null };
  const query = readQuery(searchParams);
  const mine = query.tab === 'mine' && !!viewer.userId;

  let sel = supabaseAdmin.from('dnd_homebrew').select('*').order('updated_at', { ascending: false }).limit(300);
  if (mine) sel = sel.eq('owner_user_id', viewer.userId!);
  // `'any'`-scoped pieces belong to EVERY system, so a system filter has to include them — otherwise the
  // system-agnostic content vanishes from exactly the lists it was scoped to appear in.
  if (query.system) sel = sel.in('system', [query.system, 'any']);
  if (query.kind) sel = sel.eq('kind', query.kind);

  const { data } = await sel;
  const rows = (data ?? []) as HomebrewRow[];

  // Attribution in one batched lookup; a piece whose author is gone is dropped rather than shown as
  // "Unknown", because the model requires a real creator and inventing one is worse than omitting the row.
  const ids = [...new Set(rows.map((r) => r.owner_user_id))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: users } = await supabaseAdmin.from('dnd_users').select('id, display_name').in('id', ids);
    for (const u of (users ?? []) as { id: string; display_name: string | null }[]) {
      if (u.display_name) names.set(u.id, u.display_name);
    }
  }

  const pieces = rows
    .map((r) => rowToHomebrew(r, names.get(r.owner_user_id) ?? ''))
    .filter((p): p is StoredHomebrew => p !== null);
  const shown = visibleHomebrew(pieces, viewer, { includeOwn: mine })
    .filter((p) => homebrewMatchesSearch(p, query.q));

  const chip = (label: string, href: string, active: boolean, hint?: string) => (
    <Link
      key={href + label}
      href={href}
      title={hint}
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

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 16 }}>
          <div>
            <Link className={styles.hexBtn} href="/dnd" style={{ marginBottom: 10 }}>← Lobby</Link>
            <h1 className={styles.title} style={{ textAlign: 'left', margin: '8px 0 0' }}>Custom Content</h1>
            <p style={{ color: 'var(--hx-muted)', margin: '4px 0 0', maxWidth: 760 }}>
              Everything players have made — classes, feats, items, creatures and more — attributed to whoever
              built it. Anything published here can be read by anyone; whether it is <em>legal at a table</em>
              {' '}is still the DM&apos;s call, campaign by campaign.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Link className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} href="/dnd/content/new" style={{ textDecoration: 'none' }}>
              🔨 Build something
            </Link>
            {/* P12-1. Linked from here because this is where you arrive before authoring: "will my
                Pathfinder feat actually do anything" is a question worth answering BEFORE the form, not
                as a hint you meet halfway down it. A page nothing links to is a page nobody finds — the
                most common defect in this repo. */}
            <Link className={styles.hexBtn} href="/dnd/content/coverage" style={{ textDecoration: 'none' }}>
              ▦ What resolves where
            </Link>
            {viewer.userId && (
              <>
                {chip('Everyone’s', hrefWith(query, { tab: undefined }), query.tab === 'public')}
                {chip('Mine', hrefWith(query, { tab: 'mine' }), query.tab === 'mine')}
              </>
            )}
            {/* A plain GET form — no client JS, and the result is a linkable URL. */}
            <form method="GET" action="/dnd/content" style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              {query.tab === 'mine' && <input type="hidden" name="tab" value="mine" />}
              {query.kind && <input type="hidden" name="kind" value={query.kind} />}
              {query.system && <input type="hidden" name="system" value={query.system} />}
              <input
                className={styles.input} name="q" defaultValue={query.q} placeholder="Search custom content…"
                aria-label="Search custom content" style={{ width: 220, padding: '7px 10px' }}
              />
              <button className={styles.hexBtn} type="submit" style={{ padding: '7px 14px' }}>Search</button>
            </form>
          </div>

          <section className={styles.framedPanel} style={{ padding: '12px 14px', display: 'grid', gap: 10 }}>
            <div className={styles.framedPanelTop} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--hx-gold-2)', minWidth: 62 }}>SYSTEM //</span>
              {chip('All', hrefWith(query, { system: undefined }), !query.system)}
              {availableSystems().map((s) => chip(s.name, hrefWith(query, { system: s.key }), query.system === s.key))}
              {chip('Any system', hrefWith(query, { system: 'any' }), query.system === 'any', 'Content written to work in every system')}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--hx-gold-2)', minWidth: 62, paddingTop: 5 }}>KIND //</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {chip('All', hrefWith(query, { kind: undefined }), !query.kind)}
                {/* Grouped in the registry's own order (Gear → Magic → Character options → World) so the
                    filter row reads the same way the kind picker does. */}
                {KIND_GROUPS.flatMap((g) =>
                  allKindSpecs().filter((k) => k.group === g).map((k) =>
                    chip(`${k.icon} ${homebrewKindLabel(k.kind)}`, hrefWith(query, { kind: k.kind }), query.kind === k.kind, k.blurb),
                  ))}
              </div>
            </div>
          </section>

          {shown.length === 0 ? (
            <section className={styles.framedPanel} style={{ padding: '22px 18px', textAlign: 'center' }}>
              <div className={styles.framedPanelTop} />
              <p style={{ margin: 0, color: 'var(--hx-muted)', fontSize: 13.5, lineHeight: 1.6 }}>
                {query.q || query.kind || query.system
                  ? 'Nothing matches those filters yet.'
                  : mine
                    ? 'You haven’t made anything yet. Build a class, a creature, an item — anything.'
                    : 'No custom content has been published yet. Be the first.'}
              </p>
            </section>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {shown.map((p) => {
                const spec = kindSpec(p.kind);
                const scope = p.system === 'any' ? 'Any system' : systemLabel(normalizeSystem(p.system));
                return (
                  <Link
                    key={p.id}
                    href={`/dnd/content/${p.id}`}
                    className={styles.framedPanel}
                    style={{ textDecoration: 'none', color: 'inherit', padding: '12px 14px', display: 'grid', gap: 6, alignContent: 'start' }}
                  >
                    {p.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 3 }} />
                    )}
                    <span style={{ fontSize: 10.5, letterSpacing: '0.11em', textTransform: 'uppercase', color: 'var(--hx-teal-1)' }}>
                      {spec.icon} {homebrewKindLabel(p.kind)} · {scope}
                    </span>
                    <strong style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)', fontSize: 15.5, lineHeight: 1.25 }}>
                      {p.name}
                    </strong>
                    {p.summary && (
                      <span style={{ fontSize: 12.5, color: 'var(--hx-text)', opacity: 0.85, lineHeight: 1.5 }}>{p.summary}</span>
                    )}
                    <span style={{ fontSize: 11.5, color: 'var(--hx-muted)', display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                      <span>by {p.creator.name}</span>
                      {/* A partial build says so on the card. It is a first-class state, not a failure —
                          the owner's "build to any level and just hit save". */}
                      {p.partialToLevel != null && (
                        <span style={{ color: 'var(--hx-gold-2)' }}>· partial — to level {p.partialToLevel}</span>
                      )}
                      {mine && p.visibility !== 'public' && (
                        <span style={{ color: 'var(--hx-muted)' }}>· {p.visibility}</span>
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
