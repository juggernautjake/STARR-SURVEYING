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
import { supabaseAdmin } from '@/lib/supabase';
import { getDndUser, getCampaignRole } from '@/lib/dnd/auth';
import { loadMapTree, loadMapObjects } from '@/lib/dnd/maps/query';
import { readToken, tokenFootprint } from '@/lib/dnd/maps/tokens';
import { breadcrumb, childrenOf, rootsOf } from '@/lib/dnd/maps/tree';
import { tierOf } from '@/lib/dnd/maps/html-world';
import GeneratedMap from '@/app/dnd/_ui/maps/GeneratedMap';
import MapViewport from '@/app/dnd/_ui/maps/MapViewport';
import WorldAuthor from '@/app/dnd/_ui/maps/WorldAuthor';
import PlaceToken, { type PlaceableSubject } from '@/app/dnd/_ui/maps/PlaceToken';

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
  // M5-1 — what is standing on the map. A SEPARATE QUERY per viewer (G3): a player's never selects
  // `dm_notes` and never matches a `dm`-visibility object, so a secret does not cross the wire and get
  // hidden in React. `dnd_map_objects` shipped applied with M1-3 and had no reader until now.
  const objects = await loadMapObjects(nodes.map((n) => n.id), { isDm });

  // M4-2 — what the DM can put on the board. The campaign's own characters: a token has to stand for
  // SOMETHING (G4), and the party is the set a DM reaches for first. Loaded only for the DM, because a
  // player has nothing to place and the query would be work nobody reads.
  let placeable: PlaceableSubject[] = [];
  if (isDm) {
    const { data: party } = await supabaseAdmin
      .from('dnd_characters').select('id, name')
      .eq('campaign_id', campaignId)
      // `is_library` rows are templates that happen to carry a campaign_id — they are not AT the table.
      .eq('is_library', false)
      .order('name');
    placeable = ((party ?? []) as { id: string; name: string }[])
      .map((c) => ({ kind: 'character' as const, id: c.id, name: c.name }));
  }

  const roots = rootsOf(nodes);
  // An explicit ?node wins; otherwise the first root — which for a normal campaign is the space map.
  const current = (nodeParam && nodes.find((n) => n.id === nodeParam)) || roots[0] || null;

  const trail = current ? breadcrumb(nodes, current.id) : [];
  const children = current ? childrenOf(nodes, current.id) : [];
  const nodePins = current ? pins.filter((p) => p.map_node_id === current.id) : [];
  // Tokens on THIS node, already z-ordered by the query. `readToken` returns null for a row bound to
  // nothing, and those are dropped rather than drawn — a marker pointing at nothing is worse than a gap,
  // because a DM would move it and target it and find it does nothing.
  const nodeTokens = (current ? objects.filter((o) => o.map_node_id === current.id && o.kind === 'token') : [])
    .map((o) => ({ o, t: readToken(o.data) }))
    .filter((x): x is { o: typeof x.o; t: NonNullable<typeof x.t> } => x.t !== null);
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

          {/* The DM's controls sit ABOVE the map and are present in the empty state too — that is where a
              DM starts, and an empty world with no way to create anything is how this stack spent the
              afternoon: schema live, browser working, console wired, and nothing able to make a node. */}
          {isDm && (
            <WorldAuthor
              campaignId={campaignId}
              childCount={children.length}
              current={
                current
                  ? {
                      id: current.id,
                      name: current.name,
                      tier: current.tier,
                      depth: current.depth,
                      blurb: current.blurb,
                      published: current.published,
                      consoleRef: current.console_ref,
                    }
                  : null
              }
            />
          )}

          {!current ? (
            // Distinguish "nothing built yet" from "nothing you can see" — the two need different actions
            // from the reader, and "No maps" reads as broken for both.
            <section className={styles.framedPanel} style={{ padding: '18px 16px' }}>
              <div className={styles.framedPanelTop} />
              <p style={{ color: 'var(--hx-muted)', margin: 0, maxWidth: 640, fontSize: 13.5 }}>
                {isDm
                  ? 'No maps yet. Create a space map above to start — every location you add afterwards nests inside it, up to seven levels deep.'
                  : 'Your DM has not published any maps for this campaign yet.'}
              </p>
            </section>
          ) : (
            <>
              <section className={styles.framedPanel} style={{ padding: 0, overflow: 'hidden' }}>
                <div className={styles.framedPanelTop} />
                {/* M3-1's pan/zoom wraps the map AND its pins in ONE transformed layer, so a pin stays
                    glued to its spot at every zoom instead of sliding across the map.
                    aspect-ratio rather than a fixed height: the frame fills the column at any width, so a
                    360px phone and a desktop get the same picture rather than a letterboxed one. */}
                <MapViewport
                  label={current.name}
                  bounds={{ minX: 0, minY: 0, maxX: 100, maxY: 100 }}
                  style={{ width: '100%', aspectRatio: '16 / 9', background: 'var(--hx-map-void)' }}
                >
                  {current.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={current.image_url}
                      alt={`${current.name} — ${TIER_LABEL[tierOf(current.tier)] ?? current.tier}`}
                      style={{ position: 'absolute', left: 0, top: 0, width: 100, height: 100, objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ position: 'absolute', left: 0, top: 0, width: 100, height: 100 }}>
                      <GeneratedMap nodeId={current.id} tier={current.tier} name={current.name} />
                    </div>
                  )}

                  {/* Pins sit in the map's own 0-100 world space, inside the transform — so they track the
                      map under pan and zoom rather than floating over it. */}
                  {nodePins.map((p) => {
                    const target = p.child_node_id && nodes.find((n) => n.id === p.child_node_id);
                    const label = p.label || (target ? target.name : 'Unmapped location');
                    // M3-3 — what a pin DRAWS follows the zoom. The label is always in the markup and only
                    // its visibility changes with `data-lod`, so it stays in the accessibility tree and
                    // findable by in-page search at every zoom; a conditionally-rendered one would not be.
                    const dot = (
                      <span className={styles.mapPin}>
                        <span
                          className={styles.mapPinDot}
                          style={{
                            display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: '50%',
                            border: '1px solid var(--hx-teal-1)', background: 'rgba(1,10,19,0.72)',
                            color: 'var(--hx-teal-1)', fontSize: 12,
                          }}
                        >
                          {p.icon || '◈'}
                        </span>
                        <span className={styles.mapPinLabel}>{label}</span>
                      </span>
                    );
                    return (
                      <div
                        key={p.id}
                        title={label}
                        style={{
                          position: 'absolute',
                          // WORLD UNITS, not percent. Inside the transformed layer 1px === 1 world unit
                          // (the map is a 100×100 box), so `50%` would resolve against the layer's own
                          // frame-sized box and put every pin in the wrong place.
                          left: p.x,
                          top: p.y,
                          // COUNTER-SCALED so the marker stays the same size on screen at every zoom —
                          // otherwise a pin balloons to fill the frame as you zoom in. `--map-scale` is
                          // published by MapViewport on the transformed layer.
                          transform: 'translate(-50%, -50%) scale(calc(1 / var(--map-scale, 1)))',
                          transformOrigin: 'center',
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
                  {/* M5-1 — the pieces on the board. Inside the transformed layer with the pins, so a
                      token stays on its square through pan and zoom.

                      NOT counter-scaled, unlike a pin: a pin is a MARKER whose job is to stay legible at
                      every zoom, but a token occupies squares, and a token that kept its screen size while
                      the map grew would slide off the space it is standing in. Its footprint comes from the
                      node's own grid (tokenFootprint), so a Large creature covers 2×2 and looks it. */}
                  {nodeTokens.map(({ o, t }) => {
                    const side = tokenFootprint(t.size, current.grid as { size?: number } | null);
                    const label = t.nickname || o.label || 'Token';
                    return (
                      <div
                        key={o.id}
                        title={label}
                        aria-label={label}
                        style={{
                          position: 'absolute',
                          left: o.x,
                          top: o.y,
                          width: side,
                          height: side,
                          transform: 'translate(-50%, -50%)',
                          borderRadius: '50%',
                          border: '2px solid var(--hx-gold-2)',
                          background: o.asset_url ? `center/cover url(${o.asset_url})` : 'rgba(1,10,19,0.82)',
                          display: 'grid',
                          placeItems: 'center',
                          color: 'var(--hx-gold-2)',
                          // Scales with the footprint so a Gargantuan token's initial does not stay tiny.
                          fontSize: Math.max(1, side * 0.5),
                          lineHeight: 1,
                          overflow: 'hidden',
                        }}
                      >
                        {!o.asset_url && label.slice(0, 1).toUpperCase()}
                      </div>
                    );
                  })}
                </MapViewport>
              </section>

              {/* M4-2 — the placing control sits DIRECTLY UNDER the map it writes to, because "click the
                  map" is its second half. Putting it up with WorldAuthor would arm a mode whose target is
                  scrolled off the screen. */}
              {isDm && (
                <section className={styles.framedPanel} style={{ padding: '12px 16px' }}>
                  <div className={styles.framedPanelTop} />
                  <PlaceToken
                    campaignId={campaignId}
                    nodeId={current.id}
                    subjects={placeable}
                    // The SAME list the map draws, so a token the DM can see is always a token they can
                    // move — a control listing rows the renderer dropped would offer to move nothing.
                    placed={nodeTokens.map(({ o, t }) => ({ id: o.id, label: o.label || t.nickname || 'Token' }))}
                  />
                </section>
              )}

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
                        <div style={{ aspectRatio: '16 / 10', overflow: 'hidden', background: 'var(--hx-map-void)' }}>
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
