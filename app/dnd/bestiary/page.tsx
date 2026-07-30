// /dnd/bestiary — the creature catalogue, browsable.
//
// SLICE B1-1, and it exists before there is anything in the catalogue on purpose.
//
// The bestiary's model, import transform, taxonomy, variant rules and roll parsing have all been built and tested;
// `dnd_creatures` has existed in the live database, with zero rows and no page, for weeks. That is this repo's
// signature defect in its purest form — everything about the machinery was right and none of it was reachable. So
// the page comes first: three creatures on a real surface tell you whether the taxonomy, the filters and the stat
// block layout are right, while nine hundred rows behind no surface tell you nothing at all.
//
// "MAKE SURE WE CAN ACTUALLY FIND THEM" is the owner's phrasing, so the filters are the substance of this page and
// not decoration: system, category, creature type, challenge band, alignment, and free text — every one applied in
// the database, and every one offering only values that exist in the catalogue.
//
// The filters are LINKS, not a client-side form. That keeps the whole thing a server component with no hydration
// cost, makes every filtered view shareable as a URL, and means the browser's back button works the way a reader
// expects while drilling through categories.
import Link from 'next/link';
import type { Metadata } from 'next';
import styles from '@/app/dnd/_ui/hextech.module.css';
import { loadBestiary, CR_BANDS } from '@/lib/dnd/bestiary/query';
import { PLANES } from '@/lib/dnd/bestiary/planes';
import { TAG_LABELS, type CreatureTag } from '@/lib/dnd/bestiary/taxonomy';
import { GAME_SYSTEMS } from '@/lib/dnd/systems';
import CreatureAura from '@/app/dnd/_ui/bestiary/CreatureAura';

export const metadata: Metadata = { title: 'Bestiary | Starr Tabletop' };

/** Always fresh: the catalogue grows by import, and a cached empty bestiary would look like a broken one. */
export const dynamic = 'force-dynamic';

type Search = { system?: string; tag?: string; type?: string; band?: string; alignment?: string; plane?: string; q?: string; page?: string };

/** How many creatures a page shows. `loadBestiary` caps at 200; 60 fills three or four rows of cards at
 *  desktop widths and keeps the aura count per page well inside what the still-tint renderer is cheap at. */
const PAGE_SIZE = 60;

const systemName = (key: string) => GAME_SYSTEMS.find((s) => s.key === key)?.name ?? key;

/** Build a URL with one filter changed, and that filter cleared if it was already active (click to toggle off). */
function withFilter(current: Search, key: keyof Search, value: string | null): string {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(current)) if (v) next[k] = String(v);
  if (!value || next[key] === value) delete next[key];
  else next[key] = value;
  // Changing a filter always returns to page 1. Keeping the page number would land a reader on "page 7 of
  // 2" — an empty result that reads as "no dragons" rather than "you were past the end".
  if (key !== 'page') delete next.page;
  const qs = new URLSearchParams(next).toString();
  return qs ? `/dnd/bestiary?${qs}` : '/dnd/bestiary';
}

export default async function BestiaryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { creatures, total, facets } = await loadBestiary({
    system: sp.system, tag: sp.tag, type: sp.type, band: sp.band, alignment: sp.alignment,
    plane: sp.plane, q: sp.q,
    limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
  });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const anyFilter = Boolean(sp.system || sp.tag || sp.type || sp.band || sp.alignment || sp.plane || sp.q);

  /** One row of filter chips. Rendered only when the catalogue actually contains more than one value — a lone
   *  option is not a choice, and a filter that cannot change anything is noise. */
  const chips = (label: string, key: keyof Search, options: Array<{ value: string; label: string }>) =>
    options.length < 2 ? null : (
      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--hx-teal-1)', minWidth: 84 }}>
          {label}
        </span>
        {options.map((o) => {
          const on = sp[key] === o.value;
          return (
            <Link
              key={o.value}
              href={withFilter(sp, key, o.value)}
              aria-pressed={on}
              style={{
                fontSize: 11.5, padding: '3px 9px', borderRadius: 999, textDecoration: 'none',
                border: `1px solid ${on ? 'var(--hx-teal-1)' : 'var(--hx-line)'}`,
                background: on ? 'rgba(10,200,185,0.16)' : 'transparent',
                color: on ? 'var(--hx-teal-1)' : 'var(--hx-text)',
                minHeight: 30, display: 'inline-flex', alignItems: 'center',
              }}
            >
              {o.label}
            </Link>
          );
        })}
      </div>
    );

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 16 }}>
          <div>
            <Link className={styles.hexBtn} href="/dnd" style={{ marginBottom: 10 }}>← Lobby</Link>
            <h1 className={styles.title} style={{ textAlign: 'left', margin: '8px 0 0' }}>Bestiary</h1>
            <p style={{ color: 'var(--hx-muted)', margin: '4px 0 0', maxWidth: 720 }}>
              Every creature in the catalogue, from every plane and every alignment, at every difficulty. Open one to
              read its full stat block, roll its attacks, build a stronger or weaker variant, or drop it into a
              campaign.
            </p>
          </div>

          <section className={styles.framedPanel} style={{ padding: '14px 16px', display: 'grid', gap: 10 }}>
            <div className={styles.framedPanelTop} />
            <form method="get" action="/dnd/bestiary" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {/* Carried through the search so typing a name does not silently drop the category you were in. */}
              {(['system', 'tag', 'type', 'band', 'alignment'] as const).map((k) =>
                sp[k] ? <input key={k} type="hidden" name={k} value={sp[k]} /> : null,
              )}
              <input
                name="q"
                defaultValue={sp.q ?? ''}
                placeholder="Search by name or description…"
                aria-label="Search creatures"
                style={{ flex: '1 1 260px', padding: '8px 10px', minHeight: 40, background: 'rgba(1,10,19,0.5)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', fontSize: 13 }}
              />
              <button type="submit" className={styles.hexBtn} style={{ minHeight: 40 }}>Search</button>
              {anyFilter && (
                <Link href="/dnd/bestiary" className={styles.hexBtn} style={{ minHeight: 40 }}>Clear all</Link>
              )}
            </form>

            {chips('System', 'system', facets.systems.map((s) => ({ value: s, label: systemName(s) })))}
            {chips('Category', 'tag', facets.tags.map((t) => ({ value: t, label: TAG_LABELS[t as CreatureTag] ?? t })))}
            {chips('Type', 'type', facets.types.map((t) => ({ value: t, label: t })))}
            {/* CR bands are a fixed list rather than a facet, so they need the catalogue-is-empty guard the others
                get for free — otherwise an empty bestiary offered five challenge filters that could not match
                anything, which is precisely the "no dragons" versus "no dragons imported yet" confusion this page
                is supposed to avoid. `systems` is the proxy: `system` is NOT NULL, so any creature yields one. */}
            {facets.systems.length > 0 && chips('Challenge', 'band', CR_BANDS.map((b) => ({ value: b.id, label: b.label })))}
            {chips('Alignment', 'alignment', facets.alignments.map((a) => ({ value: a, label: a })))}
            {/* PLANE (B5-2, G7). Derived from the creature TYPE, which is the thing that states a plane of
                origin — a fiend IS a native of the Lower Planes, by definition rather than by our reading.
                Offered only for planes the loaded catalogue actually contains, like every other facet, so
                "creatures from every plane" is a filter that works rather than a claim.

                Terrestrial environment — arctic, forest, swamp — is deliberately NOT here: neither source
                publishes it, and prose is not a substitute. See planes.ts. */}
            {chips('Plane', 'plane', PLANES
              .filter((p) => facets.tags.includes(p.tag))
              .map((p) => ({ value: p.key, label: p.label })))}
          </section>

          <section className={styles.framedPanel} style={{ padding: '14px 16px' }}>
            <div className={styles.framedPanelTop} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <h2 className={styles.panelTitle} style={{ margin: 0 }}>
                {total === 0
                  ? 'Creatures'
                  : creatures.length === total
                    ? `${total} creature${total === 1 ? '' : 's'}`
                    // The RANGE, not "60 of 3523". A bare count with a page of results under it gives a
                    // reader no idea where they are in the catalogue or whether they have seen a given
                    // creature already.
                    : `${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + creatures.length} of ${total} creatures`}
              </h2>
              {pageCount > 1 && (
                <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>Page {page} of {pageCount}</span>
              )}
            </div>

            {/* A reader who lands past the end gets told so, rather than the "nothing matches those filters"
                message below — which would send them clearing filters that were working perfectly. */}
            {creatures.length === 0 && total > 0 && (
              <p style={{ color: 'var(--hx-muted)', fontSize: 13.5, margin: '10px 0 0' }}>
                Page {page} is past the end of {total} result{total === 1 ? '' : 's'}.{' '}
                <Link href={withFilter(sp, 'page', null)} style={{ color: 'var(--hx-teal-1)' }}>Back to the first page</Link>.
              </p>
            )}

            {/* THE EMPTY STATE SAYS WHICH KIND OF EMPTY IT IS. "No creatures" reads as a broken page; distinguishing
                "nothing imported yet" from "nothing matches your filters" is the difference between a reader
                clearing a filter and a reader concluding the bestiary does not work. */}
            {total === 0 && (
              <p style={{ color: 'var(--hx-muted)', fontSize: 13.5, margin: '10px 0 0', maxWidth: 640 }}>
                {anyFilter ? (
                  <>
                    Nothing in the catalogue matches those filters.{' '}
                    <Link href="/dnd/bestiary" style={{ color: 'var(--hx-teal-1)' }}>Clear them</Link> to see everything.
                  </>
                ) : (
                  <>
                    The catalogue is empty — no creatures have been imported yet. The stat block model, the category
                    taxonomy and the variant rules are all in place; what is missing is the content, which arrives by
                    import from the freely-licensed sources.
                  </>
                )}
              </p>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12, marginTop: 12 }}>
              {creatures.map((c) => (
                <Link
                  key={c.id}
                  href={`/dnd/bestiary/${c.slug}`}
                  style={{
                    display: 'grid', gap: 6, padding: 10, textDecoration: 'none',
                    border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.4)', color: 'var(--hx-text)',
                  }}
                >
                  {/* The aura is derived from the creature's own type and tags, so every creature gets a fitting
                      treatment on the day it is imported — see CreatureAura. In the list it is a still tint;
                      the detail page animates it. */}
                  <CreatureAura creature={c} size={104} still />
                  <div style={{ fontFamily: 'var(--hx-font-display)', fontSize: 15, color: 'var(--hx-gold-2)' }}>{c.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>
                    {[c.size, c.type, c.alignment].filter(Boolean).join(' · ') || systemName(c.system)}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 11 }}>
                    {c.cr && <span style={{ color: 'var(--hx-teal-1)' }}>CR {c.cr}</span>}
                    {c.tags.slice(0, 3).map((t) => (
                      <span key={t} style={{ color: 'var(--hx-muted)', border: '1px solid var(--hx-line)', borderRadius: 999, padding: '1px 7px' }}>
                        {TAG_LABELS[t as CreatureTag] ?? t}
                      </span>
                    ))}
                  </div>
                </Link>
              ))}
            </div>

            {/* THE PAGER. Its absence was a real defect rather than a missing nicety: `loadBestiary` has
                always taken `limit`/`offset` and the page has always asked for one page, so with 3,523
                creatures catalogued every result past the sixtieth was unreachable by browsing — the
                bestiary reported "60 of 271 dragons" and offered no way to the other 211. G7 is
                "make sure we can actually find them", and a first page is not a catalogue.

                LINKS, not a client control, for the same reason the filters are: the whole page stays a
                server component and every page of every filtered view is a shareable URL. */}
            {pageCount > 1 && (
              <nav
                aria-label="Bestiary pages"
                style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--hx-line)' }}
              >
                {page > 1 ? (
                  <Link className={styles.hexBtn} href={withFilter(sp, 'page', page - 1 === 1 ? null : String(page - 1))}>
                    ← Previous
                  </Link>
                ) : <span />}

                <span style={{ fontSize: 12, color: 'var(--hx-muted)', margin: '0 auto' }}>
                  Page {page} of {pageCount}
                </span>

                {page < pageCount ? (
                  <Link className={styles.hexBtn} href={withFilter(sp, 'page', String(page + 1))}>Next →</Link>
                ) : <span />}

                {/* The last page is one click away even at 59 pages, because "what is the strongest thing
                    in here" is a question a DM actually asks and the list is sorted weakest first. */}
                {page < pageCount && (
                  <Link
                    href={withFilter(sp, 'page', String(pageCount))}
                    style={{ fontSize: 11.5, color: 'var(--hx-muted)', textDecoration: 'none' }}
                  >
                    Last ({pageCount})
                  </Link>
                )}
              </nav>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
