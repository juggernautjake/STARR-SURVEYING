// /dnd/campaigns/[id]/world — drilling down through the map tree (M3-2).
//
// The owner's gesture: *"we can have a space map with worlds, and then we can select a world to zoom in on,
// and then that world can have locations on it that we can click on to load that location's map, and that
// location could have even more locations in it."*
//
// This is the surface that makes M1 and M2 reachable. Before it, the schema was live and the world
// generator was tested and NEITHER could be looked at — which is this repo's signature defect and the
// reason the plan puts a page before content at every phase.
//
// A SERVER COMPONENT WITH LINK-BASED NAVIGATION, deliberately. Drill-down is a URL (`?node=<id>`), so:
// every level is shareable and bookmarkable, the browser's back button walks back UP the hierarchy for
// free, and there is no hydration cost on a page whose job is mostly to draw. M3-1's pan/zoom viewport is
// the client-side layer that goes on top of this; the navigation underneath it stays addressable.
import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import styles from '@/app/dnd/_ui/hextech.module.css';
import { getDndUser, getCampaignRole } from '@/lib/dnd/auth';
import { loadMapTree } from '@/lib/dnd/maps/query';
import { breadcrumb, childrenOf, rootsOf } from '@/lib/dnd/maps/tree';
import { tierOf } from '@/lib/dnd/maps/html-world';
import GeneratedMap from '@/app/dnd/_ui/maps/GeneratedMap';

export const metadata: Metadata = { title: 'World | Starr Tabletop' };
export const dynamic = 'force-dynamic';

const TIER_LABEL: Record<string, string> = {
  space: 'Space', world: 'World', continent: 'Continent', province: 'Province',
  city: 'City', district: 'District', site: 'Site',
};

// Plain (non-Promise) params, matching every sibling campaign route in this app — see `console/page.tsx`
// and `map-studio/page.tsx`. Mixing the two conventions in one directory is how a later Next upgrade turns
// into a scavenger hunt.
export default async function WorldPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { node?: string };
}) {
  const campaignId = params.id;
  const nodeParam = searchParams.node;

  const user = await getDndUser();
  if (!user) redirect('/dnd');
  const role = await getCampaignRole(campaignId);
  if (!role) redirect('/dnd');
  const isDm = role === 'dm';

  // G3: the DM's tree and a player's tree are different QUERIES. A player's rows simply do not contain
  // unpublished nodes, so there is nothing for a client-side mistake to reveal.
  const { nodes, pins } = await loadMapTree(campaignId, { isDm });

  const roots = rootsOf(nodes);
  // An explicit ?node wins; otherwise the first root — which for a normal campaign is the space map.
  const current = (nodeParam && nodes.find((n) => n.id === nodeParam)) || roots[0] || null;

  const trail = current ? breadcrumb(nodes, current.id) : [];
  const children = current ? childrenOf(nodes, current.id) : [];
  const nodePins = current ? pins.filter((p) => p.map_node_id === current.id) : [];
  const href = (nid: string) => `/dnd/campaigns/${campaignId}/world?node=${encodeURIComponent(nid)}`;

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 14 }}>
          <div>
            <Link className={styles.hexBtn} href={`/dnd/campaigns/${campaignId}`}>← Campaign</Link>
            <h1 className={styles.title} style={{ textAlign: 'left', margin: '8px 0 0' }}>
              {current ? current.name : 'World'}
            </h1>
          </div>

          {/* THE BREADCRUMB IS THE NAVIGATION, not decoration — at seven levels deep it is the only way
              back up that does not depend on browser history. Every crumb is a link except the last. */}
          {trail.length > 1 && (
            <nav aria-label="Map hierarchy" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 12.5 }}>
              {trail.map((c, i) => (
                <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {i > 0 && <span aria-hidden="true" style={{ color: 'var(--hx-muted)' }}>/</span>}
                  {c.isCurrent ? (
                    <span aria-current="page" style={{ color: 'var(--hx-gold-2)' }}>{c.name}</span>
                  ) : (
                    <Link href={href(c.id)} style={{ color: 'var(--hx-teal-1)', textDecoration: 'none', minHeight: 30, display: 'inline-flex', alignItems: 'center' }}>
                      {c.name}
                    </Link>
                  )}
                </span>
              ))}
            </nav>
          )}

          {!current ? (
            // Distinguish "nothing built yet" from "nothing you can see" — the two need different actions
            // from the reader, and "No maps" reads as broken for both.
            <section className={styles.framedPanel} style={{ padding: '18px 16px' }}>
              <div className={styles.framedPanelTop} />
              <p style={{ color: 'var(--hx-muted)', margin: 0, maxWidth: 640, fontSize: 13.5 }}>
                {isDm
                  ? 'No maps yet. Create a space map to start — every location you add afterwards nests inside it, up to seven levels deep.'
                  : 'Your DM has not published any maps for this campaign yet.'}
              </p>
            </section>
          ) : (
            <>
              <section className={styles.framedPanel} style={{ padding: 0, overflow: 'hidden' }}>
                <div className={styles.framedPanelTop} />
                {/* aspect-ratio rather than a fixed height: the map fills the column at any width, so the
                    360px phone and the desktop get the same picture rather than a letterboxed one. */}
                <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#02121a' }}>
                  {current.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={current.image_url}
                      alt={`${current.name} — ${TIER_LABEL[tierOf(current.tier)] ?? current.tier}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <GeneratedMap nodeId={current.id} tier={current.tier} name={current.name} />
                  )}

                  {/* Pins sit on the map in its own 0-100 space, so they stay put at any size. */}
                  {nodePins.map((p) => {
                    const target = p.child_node_id && nodes.find((n) => n.id === p.child_node_id);
                    const label = p.label || (target ? target.name : 'Unmapped location');
                    const dot = (
                      <span
                        style={{
                          display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: '50%',
                          border: '1px solid var(--hx-teal-1)', background: 'rgba(1,10,19,0.72)',
                          color: 'var(--hx-teal-1)', fontSize: 12,
                        }}
                      >
                        {p.icon || '◈'}
                      </span>
                    );
                    return (
                      <div
                        key={p.id}
                        title={label}
                        style={{
                          position: 'absolute',
                          left: `${p.x}%`,
                          top: `${p.y}%`,
                          transform: 'translate(-50%, -50%)',
                          // 44px hit area around a 26px dot — G5's touch minimum, met by padding rather
                          // than by making the marker itself ugly.
                          padding: 9,
                        }}
                      >
                        {/* A pin with no child is a place the DM has MARKED but not built. It must render
                            and must not be a dead link — the plan calls that a normal authoring state. */}
                        {target ? (
                          <Link href={href(target.id)} aria-label={`Open ${label}`}>{dot}</Link>
                        ) : (
                          <span aria-label={`${label} (not yet mapped)`} style={{ opacity: 0.55 }}>{dot}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {current.blurb && (
                <p style={{ color: 'var(--hx-muted)', margin: 0, maxWidth: 720, fontSize: 13.5 }}>{current.blurb}</p>
              )}

              <section className={styles.framedPanel} style={{ padding: '14px 16px' }}>
                <div className={styles.framedPanelTop} />
                <h2 className={styles.panelTitle} style={{ margin: '0 0 10px' }}>
                  {children.length ? `Inside ${current.name}` : 'Nothing inside this yet'}
                </h2>
                {children.length === 0 ? (
                  <p style={{ color: 'var(--hx-muted)', fontSize: 13, margin: 0 }}>
                    {current.depth >= 7
                      ? 'This is the deepest level — seven is the limit, so encounters happen here.'
                      : isDm
                        ? 'Add a location inside this one to keep drilling down.'
                        : 'Your DM has not published anything inside this location.'}
                  </p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
                    {children.map((c) => (
                      <Link
                        key={c.id}
                        href={href(c.id)}
                        style={{
                          display: 'grid', gap: 6, padding: 8, textDecoration: 'none',
                          border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.4)', color: 'var(--hx-text)',
                        }}
                      >
                        <div style={{ aspectRatio: '16 / 10', overflow: 'hidden', background: '#02121a' }}>
                          {c.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          ) : (
                            <GeneratedMap nodeId={c.id} tier={c.tier} name={c.name} />
                          )}
                        </div>
                        <div style={{ fontFamily: 'var(--hx-font-display)', fontSize: 14, color: 'var(--hx-gold-2)' }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--hx-muted)' }}>
                          {TIER_LABEL[tierOf(c.tier)] ?? c.tier}
                          {isDm && !c.published ? ' · unpublished' : ''}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
