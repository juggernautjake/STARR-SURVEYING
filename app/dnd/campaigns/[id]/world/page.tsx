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
import { readToken, subjectKey, tokenAnchor, tokenFootprint } from '@/lib/dnd/maps/tokens';
import { loadTokenSubjects } from '@/lib/dnd/maps/subjects';
import { breadcrumb, childrenOf, rootsOf } from '@/lib/dnd/maps/tree';
import { tierOf } from '@/lib/dnd/maps/html-world';
import GeneratedMap from '@/app/dnd/_ui/maps/GeneratedMap';
import GridDesigner from '@/app/dnd/_ui/maps/GridDesigner';
import GridOverlay from '@/app/dnd/_ui/maps/GridOverlay';
// M5-2 — the reachable-squares overlay and the loader that asks the sheet how fast the token is.
import ReachOverlay from '@/app/dnd/_ui/maps/ReachOverlay';
import { loadReach, reachSummary } from '@/lib/dnd/maps/reach';
// M5-3 — spell areas, read off the character's own spell list rather than restated here.
import { coneAngleFor, templateCells } from '@/lib/dnd/maps/templates';
// M5-4 — the conditions the sheet is already tracking, shown on the piece.
import TokenConditions, { conditionSuffix } from '@/app/dnd/_ui/maps/TokenConditions';
// M5-5 — whose turn it is, read from the initiative tracker that already exists.
import { isCurrentToken, loadLiveTurn, turnSummary } from '@/lib/dnd/maps/turn';
// M6-4 / M6-5 — the trigger engine, and the DM-side preview of what each one will do.
import { describePlan, preview, readTrigger } from '@/lib/dnd/maps/triggers';
// M6-2 — what the party notices by standing there, no roll required.
import { scanPassive } from '@/lib/dnd/maps/passive-scan';
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
  // M5-2 — `token` is the selected piece, and it is a URL parameter for the same reason `node` is: this
  // whole surface navigates by server-rendered link (M3-2), so the reachable set is computed once on the
  // server rather than shipping a Dijkstra and a character sheet to the browser.
  // M5-3 — `tpl` is a spell area laid from the selected token (`cone:15`), `dir` the direction it faces.
  searchParams: { node?: string; token?: string; tpl?: string; dir?: string };
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
  // M6-1 — which characters' discoveries count for this viewer. A player sees what THEIR characters have
  // found; a DM sees everything anyway and the lookup is skipped.
  let discoveredBy: string[] = [];
  if (!isDm) {
    const { data: mine } = await supabaseAdmin
      .from('dnd_characters').select('id')
      .eq('campaign_id', campaignId)
      .eq('owner_user_id', user.id);
    discoveredBy = ((mine ?? []) as Array<{ id: string }>).map((c) => c.id);
  }
  const objects = await loadMapObjects(nodes.map((n) => n.id), { isDm, discoveredBy });

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

  // M6-4 / M6-5 — the DM's trigger board. Loaded ONLY for the DM: a trigger is the machinery behind a
  // puzzle, and handing a player the `when`/`then` is handing them the answer.
  //
  // Every trigger is PREVIEWED here rather than on demand, so a cycle or a dangling reference is visible
  // the moment the DM opens the map instead of the moment the table walks into it. The plan's own
  // standard: "an untestable trigger is a trap for its author".
  let triggerBoard: Array<{ trigger: ReturnType<typeof readTrigger>; plan: ReturnType<typeof preview> }> = [];
  if (isDm && current) {
    const { data: rows } = await supabaseAdmin
      .from('dnd_map_triggers')
      .select('id, name, fires_when, fires_then, once, armed, fired_at')
      .eq('map_node_id', current.id);
    const all = ((rows ?? []) as Array<Parameters<typeof readTrigger>[0]>).map(readTrigger);
    triggerBoard = all.map((t) => ({ trigger: t, plan: preview(t, all) }));
  }

  // M6-1 — hidden objects the viewer is entitled to see. For a DM that is all of them (they authored the
  // secrets); for a player it is only what `dnd_map_discoveries` says their characters have found, which
  // `loadMapObjects` has already decided. Nothing is filtered here — by the time the objects arrive, the
  // question of who may see what has been answered by the query.
  //
  // Found by the browser pass: the discovery was being WRITTEN and the object was being RETURNED, and the
  // page drew nothing, because it only ever rendered `kind === 'token'`. A secret you successfully find
  // and still cannot see is indistinguishable from one you failed to find.
  const nodeRevealsBase = current
    ? objects.filter((o) => o.map_node_id === current.id && o.kind === 'hidden')
    : [];

  // M5-1b — what each token STANDS FOR: its portrait and its own size, resolved now rather than copied
  // onto the object when it was placed. A player who changes their portrait changes their token; a token
  // carrying a copy would keep the old face for as long as it existed, with nothing saying the two
  // disagree. Same rule that keeps HP off a token.
  const subjects = await loadTokenSubjects(nodeTokens.map(({ t }) => t.subject));

  // M6-2 — passive detection. The plan says "when a token moves within range"; nothing moves tokens yet
  // (drag-to-move is still open), so this asks the same question at the only moment available: the party
  // is standing here, what do they notice? Runs for the viewer's OWN characters only — scanning on the
  // DM's behalf would write discoveries onto sheets nobody was looking at.
  let passiveNoticed: Awaited<ReturnType<typeof scanPassive>> = { notices: [], recorded: 0 };
  if (!isDm && current && discoveredBy.length) {
    const mine = new Set(discoveredBy);
    passiveNoticed = await scanPassive({
      nodeId: current.id,
      rawGrid: current.grid,
      tokens: nodeTokens
        .map(({ o, t }) => ('characterId' in t.subject
          ? { characterId: t.subject.characterId, x: o.x, y: o.y }
          : null))
        .filter((t): t is { characterId: string; x: number; y: number } => t !== null && mine.has(t.characterId)),
      characterIds: discoveredBy,
    });
  }

  // The scan necessarily runs AFTER `loadMapObjects` — it needs the tokens, which come from those
  // objects. So a thing noticed on THIS render is not in `objects`, and without this merge a player would
  // walk in, notice a rune, and see nothing until they reloaded. The notice already carries the label and
  // read-aloud text, so nothing has to be re-queried.
  const nodeReveals = [
    ...nodeRevealsBase,
    ...passiveNoticed.notices
      .filter((n) => !nodeRevealsBase.some((o) => o.id === n.objectId))
      // Deduplicated by object: two characters noticing the same rune is one rune on the map.
      .filter((n, i, all) => all.findIndex((m) => m.objectId === n.objectId) === i)
      // Position comes off the NOTICE, not off `objects` — the object a player just noticed was
      // `visibility: 'dm'` when this render fetched its objects, so it is not in there to look up, and a
      // `?? 0` fallback would draw the marker in the map's corner on the one render that matters.
      .map((n) => ({
        id: n.objectId,
        map_node_id: current!.id,
        kind: 'hidden' as const,
        x: n.x,
        y: n.y,
        label: n.label,
        description: n.description,
      } as (typeof nodeRevealsBase)[number])),
  ];
  // M5-5 — the live encounter, if there is one. Null is the normal state of a map, so nothing about the
  // page depends on it.
  const turn = await loadLiveTurn(campaignId);
  const href = (nid: string) => `/dnd/campaigns/${campaignId}/world?node=${encodeURIComponent(nid)}`;

  // M5-2 — the selected token's reach. Resolved for ONE token, not all of them: this runs the effect
  // ledger over a character sheet, which is far too much work to repeat for every figure on a crowded
  // board when only the selected one is drawn.
  const selected = nodeTokens.find(({ o }) => o.id === searchParams.token) ?? null;
  const reach = selected && current
    ? await loadReach({
        subject: selected.t.subject,
        x: selected.o.x,
        y: selected.o.y,
        rawGrid: current.grid,
        // No system passed: a map node has no ruleset, and the diagonal rule belongs to the CHARACTER's
        // system anyway (a PF2 character alternates diagonals on any battle map). `loadReach` reads it
        // off the character row.
      })
    : null;
  /** Select a token, or clear the selection by clicking it again. */
  const tokenHref = (objectId: string | null) => {
    const p = new URLSearchParams();
    if (current) p.set('node', current.id);
    if (objectId) p.set('token', objectId);
    return `/dnd/campaigns/${campaignId}/world?${p.toString()}`;
  };

  // M5-3 — the spell area laid from the selected token, read off that character's own spell list. The
  // cells are computed here for the same reason the reach is: this page renders on the server, so the
  // geometry never reaches the browser.
  const dirDeg = Number(searchParams.dir ?? 0);
  const tplChoice = reach?.templates.find((t) => t.param === searchParams.tpl) ?? null;
  const template = tplChoice && selected && reach?.grid
    ? templateCells({
        shape: tplChoice.shape,
        sizeFt: tplChoice.sizeFt,
        x: selected.o.x,
        y: selected.o.y,
        grid: reach.grid,
        directionDeg: Number.isFinite(dirDeg) ? dirDeg : 0,
        // The character's own system decides the cone's angle: 5e's is 53°, PF2's a quarter circle.
        coneAngleDeg: coneAngleFor(reach.system),
      })
    : null;
  const tplHref = (param: string | null, dir = dirDeg) => {
    const p = new URLSearchParams();
    if (current) p.set('node', current.id);
    if (searchParams.token) p.set('token', searchParams.token);
    if (param) { p.set('tpl', param); if (dir) p.set('dir', String(dir)); }
    return `/dnd/campaigns/${campaignId}/world?${p.toString()}`;
  };

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
              {/* M5-5 — whose turn it is, ABOVE the map rather than in it. The initiative list, the round
                  counter and the next-turn button already exist in `InitiativeTracker` on the session
                  console; duplicating them here would be a second tracker to keep in sync, and the two
                  would eventually disagree about the same fight. This is a READ: one line, and a link to
                  the tracker that owns the state. */}
              {turn && (
                <section
                  className={styles.framedPanel}
                  style={{ padding: '9px 14px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}
                  data-testid="turn-banner"
                >
                  <div className={styles.framedPanelTop} />
                  <span aria-hidden style={{ color: 'var(--hx-gold-1)' }}>⚔</span>
                  <strong style={{ fontSize: 13 }}>{turnSummary(turn)}</strong>
                  {turn.encounterName && (
                    <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>· {turn.encounterName}</span>
                  )}
                  {!turn.currentCharacterId && turn.currentName && (
                    // Said out loud rather than left as a token that mysteriously does not glow. A
                    // combatant with no character row cannot be matched to a piece — the schema offers no
                    // other link — and a DM should know that is why, not wonder.
                    <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>
                      — not linked to a character, so no token is highlighted
                    </span>
                  )}
                </section>
              )}

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

                  {/* M4-1 — the grid, drawn between the picture and everything standing on it. Inside the
                      transform like the pins, so it is a grid ON the map rather than over the window; and
                      FIRST in the DOM among the overlays, so a token is never crossed by a line meant to
                      be underneath it. Renders nothing at all on a node with no grid, which is every space
                      map and every continent. */}
                  <GridOverlay grid={current.grid} label={`${current.name} grid`} />

                  {/* M5-2 — where the selected token can get to, between the grid and the pieces: over the
                      lines so they read through the wash, under the tokens so a figure is never tinted by
                      its own overlay. Renders nothing at all when no token is selected. */}
                  {reach && (
                    <ReachOverlay
                      grid={reach.grid}
                      squares={reach.squares}
                      hexes={reach.hexes}
                      origin={reach.origin}
                      label={`Reachable squares for ${selected?.t.nickname ?? 'the selected token'}`}
                    />
                  )}

                  {/* M5-3 — the spell area, over the movement wash: a template is what you are about to
                      do, the reach is where you could stand, and the one you are aiming reads on top. */}
                  {template && reach?.grid && (
                    <ReachOverlay
                      grid={reach.grid}
                      squares={template.cells.map((cell) => ({ cell, costFt: 0 }))}
                      hexes={[]}
                      origin={null}
                      tone="template"
                      label={tplChoice ? `${tplChoice.label} area` : 'Spell area'}
                    />
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
                  {/* M6-1 — a hidden thing that has been found (or, for the DM, one they placed). Drawn
                      UNDER the tokens, like the pins: a discovery is part of the room, not a piece on it. */}
                  {nodeReveals.map((o) => (
                    <div
                      key={o.id}
                      title={[o.label, o.description].filter(Boolean).join(' — ') || 'Something hidden'}
                      data-testid="revealed-object"
                      style={{
                        position: 'absolute',
                        left: o.x,
                        top: o.y,
                        // Counter-scaled like a pin: this is a MARKER, and its job is to stay legible at
                        // every zoom rather than to occupy squares the way a token does.
                        transform: 'translate(-50%, -50%) scale(calc(1 / var(--map-scale, 1)))',
                        transformOrigin: 'center',
                        display: 'grid',
                        placeItems: 'center',
                        width: 22,
                        height: 22,
                        borderRadius: 4,
                        border: '1px dashed var(--hx-teal-1)',
                        background: 'rgba(1,10,19,0.72)',
                        color: 'var(--hx-teal-1)',
                        fontSize: 12,
                      }}
                    >
                      <span aria-hidden>◇</span>
                      <span className={styles.srOnly}>
                        {isDm ? 'Hidden object: ' : 'Discovered: '}{o.label ?? 'unnamed'}
                      </span>
                    </div>
                  ))}

                  {/* M5-1 — the pieces on the board. Inside the transformed layer with the pins, so a
                      token stays on its square through pan and zoom.

                      NOT counter-scaled, unlike a pin: a pin is a MARKER whose job is to stay legible at
                      every zoom, but a token occupies squares, and a token that kept its screen size while
                      the map grew would slide off the space it is standing in. Its footprint comes from the
                      node's own grid (tokenFootprint), so a Large creature covers 2×2 and looks it. */}
                  {nodeTokens.map(({ o, t }) => {
                    const subject = subjects.get(subjectKey(t.subject));
                    // The DM's explicit override, else the creature's own size, else medium. "Not stated"
                    // now means ASK rather than "medium", which is why an Ogre stops standing on one square.
                    const size = t.size ?? subject?.size ?? 'medium';
                    const side = tokenFootprint(size, current.grid);
                    // ANCHORED, not just positioned. An even footprint (Large 2×2, Gargantuan 4×4) centres
                    // on a grid VERTEX; an odd one on a cell centre. Centring a 2×2 on a cell centre covers
                    // nine squares partially instead of four completely.
                    const at = tokenAnchor(o.x, o.y, size, current.grid);
                    const label = t.nickname || subject?.name || o.label || 'Token';
                    // `asset_url` is the DM's own override for THIS piece; otherwise the character's round
                    // token art, resolved live from the sheet.
                    const art = o.asset_url ?? subject?.portrait ?? null;
                    // M5-2 — the token is a LINK, so selecting it is a normal navigation like every other
                    // control on this surface, and clicking the selected one clears the selection. A link
                    // rather than a button because it changes the URL: the state is shareable, survives a
                    // refresh, and a DM can send "look at this" to the table.
                    const isSelected = selected?.o.id === o.id;
                    // M5-4 — read from the sheet at render time, never copied onto the token. The words
                    // go in the accessible name; the badges are `aria-hidden`, because a screen reader
                    // announcing "circle, circle, circle" is noise.
                    const conditions = subject?.conditions ?? [];
                    const exhaustion = subject?.exhaustion ?? 0;
                    const status = conditionSuffix(conditions, exhaustion);
                    // M5-5 — matched on the CHARACTER, never the name: a fight with three "Goblin"
                    // entries is the most ordinary encounter there is, and a name match would ring all
                    // three at once.
                    const isTurn = isCurrentToken(turn, t.subject);
                    return (
                      <Link
                        key={o.id}
                        href={tokenHref(isSelected ? null : o.id)}
                        scroll={false}
                        title={`${label}${status}${isSelected ? ' — selected; click to clear' : ' — click to show its movement'}`}
                        aria-label={`${label}${status}${isTurn ? ', current turn' : ''}${isSelected ? ', selected. Clear selection' : '. Show movement range'}`}
                        aria-current={isSelected ? 'true' : undefined}
                        style={{
                          position: 'absolute',
                          left: at.x,
                          top: at.y,
                          width: side,
                          height: side,
                          transform: 'translate(-50%, -50%)',
                          borderRadius: '50%',
                          // PROPORTIONAL TO THE TOKEN, not a pixel count. Inside the transformed layer one
                          // CSS pixel IS one world unit, so the old `2px` ring was 2 of a Medium token's 5
                          // units — 40% of its diameter, and thicker still as the reader zoomed in. A
                          // fraction of the footprint keeps the ring the same weight at every zoom AND at
                          // every size, so a Gargantuan token is not outlined like a hairline.
                          // M5-2 — the selected token takes the teal of its own overlay, so the ring and
                          // the wash read as one thing. Thicker too: colour alone would be the only
                          // signal, and "which token is selected" must not depend on telling gold from
                          // teal at a glance on a busy board.
                          // Three states, and they must stay tellable apart: whose TURN it is (gold glow,
                          // the loudest, because it is the one fact everyone at the table needs), what the
                          // DM has SELECTED (teal, matching its own overlay), and everything else. Turn
                          // outranks selection — a DM inspecting one token has not stopped the fight.
                          border: `${side * (isTurn ? 0.13 : isSelected ? 0.11 : 0.07)}px solid ${isTurn ? 'var(--hx-gold-1)' : isSelected ? 'var(--hx-teal-1)' : 'var(--hx-gold-2)'}`,
                          ...(isTurn ? { boxShadow: `0 0 ${side * 0.5}px ${side * 0.08}px var(--hx-gold-1)` } : {}),
                          background: 'rgba(1,10,19,0.82)',
                          display: 'grid',
                          placeItems: 'center',
                          textDecoration: 'none',
                          color: 'var(--hx-gold-2)',
                          // Scales with the footprint so a Gargantuan token's initial does not stay tiny.
                          fontSize: Math.max(1, side * 0.5),
                          lineHeight: 1,
                          overflow: 'hidden',
                        }}
                      >
                        {art ? (
                          // An <img> rather than a background-image URL. A `background: url(${art})` builds
                          // CSS out of a string the DM supplied, where an unescaped `)` ends the url() and
                          // whatever follows is parsed as more CSS. `src` has no such grammar to escape out
                          // of. `object-fit: cover` fills the circle from any aspect ratio, which is what
                          // makes a rectangular portrait usable as a round token.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={art}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: '50%' }}
                          />
                        ) : (
                          label.slice(0, 1).toUpperCase()
                        )}
                        {/* M5-4 — status pips. Outside the art but inside the link's box, so they ride
                            the token through pan and zoom without becoming their own click target. */}
                        <TokenConditions conditions={conditions} exhaustion={exhaustion} side={side} />
                      </Link>
                    );
                  })}
                </MapViewport>
              </section>

              {/* M5-2 — the numbers behind the wash. The overlay answers "can I get there"; this answers
                  "why that far", which is the question a DM asks the moment the shape surprises them —
                  usually because something is reducing the speed.

                  IT SAYS WHAT IT DOES NOT KNOW. Nothing authors difficult terrain or blockers yet, so the
                  overlay is open-ground only and the panel states that rather than letting a DM read the
                  wash as if it had consulted a terrain layer. The plan's own note on this slice is that
                  building the reader without the writer would repeat a defect it had already caught twice;
                  saying so plainly is the other half of not repeating it. */}
              {reach && selected && (
                <section
                  className={styles.framedPanel}
                  style={{ padding: '10px 14px', display: 'grid', gap: 6 }}
                  data-testid="reach-readout"
                >
                  <div className={styles.framedPanelTop} />
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 13.5 }}>
                      {selected.t.nickname || subjects.get(subjectKey(selected.t.subject))?.name || 'Token'}
                    </strong>
                    <span style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>{reachSummary(reach)}</span>
                    <Link className={styles.hexBtn} href={tokenHref(null)} style={{ marginLeft: 'auto', fontSize: 12 }}>
                      Clear
                    </Link>
                  </div>
                  <p style={{ margin: 0, fontSize: 11.5, color: 'var(--hx-muted)' }}>
                    {reach.squares.length + reach.hexes.length} cells reachable on open ground.{' '}
                    {/* The honest caveat, not a disclaimer: it names what is missing and why the number is
                        still useful. */}
                    <strong>Difficult terrain and blockers are not counted</strong> — nothing on this map
                    authors them yet, so this is the distance across clear ground.
                    {reach.truncated && ' The search stopped early on this grid; the shape shown is incomplete.'}
                  </p>

                  {/* M5-3 — the areas THIS character's spells state, read off the sheet. No list of
                      standard templates to pick from: the point of the slice is that the map cannot
                      disagree with the sheet about a spell's size, and a menu of generic shapes would be
                      exactly that disagreement waiting to happen. A caster with no area spells gets no
                      controls, which is the correct amount. */}
                  {reach.templates.length > 0 && (
                    <div style={{ display: 'grid', gap: 6, marginTop: 2 }} data-testid="template-picker">
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>Areas:</span>
                        {reach.templates.map((t) => (
                          <Link
                            key={t.param}
                            className={styles.hexBtn}
                            href={tplHref(tplChoice?.param === t.param ? null : t.param)}
                            scroll={false}
                            style={{ fontSize: 11.5, padding: '3px 8px' }}
                            aria-current={tplChoice?.param === t.param ? 'true' : undefined}
                            title={t.label}
                          >
                            {t.sizeFt} ft {t.shape}
                          </Link>
                        ))}
                      </div>
                      {/* Aiming. Eight compass points rather than a drag: this page renders on the server,
                          and a link per direction costs no JavaScript while still letting a DM point a
                          cone anywhere that matters on a square grid. */}
                      {tplChoice && (tplChoice.shape === 'cone' || tplChoice.shape === 'line' || tplChoice.shape === 'cube') && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>Aim:</span>
                          {[['E', 0], ['SE', 45], ['S', 90], ['SW', 135], ['W', 180], ['NW', 225], ['N', 270], ['NE', 315]].map(([name, deg]) => (
                            <Link
                              key={String(deg)}
                              className={styles.hexBtn}
                              href={tplHref(tplChoice.param, deg as number)}
                              scroll={false}
                              style={{ fontSize: 11, padding: '3px 7px' }}
                              aria-current={dirDeg === deg ? 'true' : undefined}
                            >
                              {name}
                            </Link>
                          ))}
                        </div>
                      )}
                      {template && (
                        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--hx-muted)' }}>
                          {tplChoice?.label} — <strong>{template.cells.length} squares</strong>
                          {tplChoice?.shape === 'cone' && (
                            <> · {reach.system === 'pathfinder2e' ? 'quarter-circle cone (PF2)' : '53° cone (5e)'}</>
                          )}
                          {template.includesOrigin && ' · includes the caster’s own square'}
                        </p>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* M6-3 — the read-aloud text. A marker on the map says WHERE; this says WHAT, which is the
                  half a player actually needs. `description` is the read-aloud column; `dm_notes` is not
                  selected for a player at all (see `query.ts`), so there is nothing here to filter — the
                  DM's private commentary never crossed the wire. */}
              {nodeReveals.length > 0 && (
                <section className={styles.framedPanel} style={{ padding: '10px 14px', display: 'grid', gap: 8 }} data-testid="reveals-panel">
                  <div className={styles.framedPanelTop} />
                  <h2 style={{ fontSize: 13, margin: 0, fontWeight: 700 }}>
                    {isDm ? 'Hidden here' : 'What you have found'}
                  </h2>
                  {/* M6-2 — said out loud. A thing that simply APPEARS is a thing a player distrusts;
                      "you noticed it without looking" is how passive Perception actually feels at a table,
                      and it also explains why no one rolled. */}
                  {passiveNoticed.notices.length > 0 && (
                    <p style={{ margin: 0, fontSize: 11.5, color: 'var(--hx-teal-1)' }} data-testid="passive-notice">
                      You noticed{' '}
                      {passiveNoticed.notices.length === 1 ? 'something' : `${passiveNoticed.notices.length} things`}{' '}
                      here without looking for it.
                    </p>
                  )}
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                    {nodeReveals.map((o) => (
                      <li key={o.id} style={{ fontSize: 12.5 }}>
                        <strong>{o.label ?? 'Something hidden'}</strong>
                        {o.description && <div style={{ color: 'var(--hx-muted)' }}>{o.description}</div>}
                        {/* DM-only, and only because the DM's own query selected it. */}
                        {isDm && o.dm_notes && (
                          <div style={{ color: 'var(--hx-gold-2)', fontSize: 11.5 }}>DM: {o.dm_notes}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* M6-4 / M6-5 — the DM's trigger board. A dry run of every trigger on this node: what it
                  would do, and what is wrong with it. Nothing here fires anything — `preview` returns a
                  PLAN, and the same resolver builds it that the live path uses, so what the DM reads is
                  what will actually happen rather than a parallel description of it. */}
              {isDm && triggerBoard.length > 0 && (
                <section className={styles.framedPanel} style={{ padding: '10px 14px', display: 'grid', gap: 8 }} data-testid="trigger-board">
                  <div className={styles.framedPanelTop} />
                  <h2 style={{ fontSize: 13, margin: 0, fontWeight: 700 }}>Triggers on this map</h2>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                    {triggerBoard.map(({ trigger, plan }) => (
                      <li key={trigger.id} style={{ fontSize: 12.5 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <strong>{trigger.name ?? 'Unnamed trigger'}</strong>
                          <span style={{ color: 'var(--hx-muted)', fontSize: 11.5 }}>
                            when {trigger.firesWhen.kind ?? '(nothing set)'}
                            {trigger.firesWhen.targetId ? ` · ${trigger.firesWhen.targetId}` : ''}
                          </span>
                          {!trigger.armed && <span style={{ color: 'var(--hx-muted)', fontSize: 11 }}>· disarmed</span>}
                          {trigger.once && trigger.firedAt && <span style={{ color: 'var(--hx-muted)', fontSize: 11 }}>· already fired</span>}
                          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: plan.problems.length ? 'var(--hx-danger)' : 'var(--hx-muted)' }}>
                            {describePlan(plan)}
                          </span>
                        </div>
                        {/* The problems, in full. A cycle prints the path that closed it — "A → B → A"
                            says WHERE the loop is; "cycle detected" says only that there is one. */}
                        {plan.problems.map((p, i) => (
                          <div key={i} style={{ color: 'var(--hx-danger)', fontSize: 11.5, marginTop: 2 }}>
                            ⚠ {p.detail}
                            {/* NAMES, not ids. The path is the whole value of a cycle report — "Alarm
                                bell → Guard summons → Alarm bell" is a sentence a DM can act on, and a
                                chain of three UUIDs is one they have to decode first. Found in the
                                browser: the first cut printed the raw ids. */}
                            {p.path.length > 1 && (
                              <span style={{ color: 'var(--hx-muted)' }}>
                                {' '}({p.path.map((id) => triggerBoard.find((b) => b.trigger.id === id)?.trigger.name ?? id).join(' → ')})
                              </span>
                            )}
                          </div>
                        ))}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* M4-2 — the placing control sits DIRECTLY UNDER the map it writes to, because "click the
                  map" is its second half. Putting it up with WorldAuthor would arm a mode whose target is
                  scrolled off the screen. */}
              {isDm && (
                <section className={styles.framedPanel} style={{ padding: '12px 16px', display: 'grid', gap: 12 }}>
                  <div className={styles.framedPanelTop} />
                  {/* M4-1 — the grid designer sits with the placing control and above it, because the two
                      are one job: a DM lays the grid, then puts pieces on it. It is also the control whose
                      effect is only judgeable against the map directly above. */}
                  <GridDesigner
                    campaignId={campaignId}
                    nodeId={current.id}
                    nodeName={current.name}
                    grid={current.grid}
                  />
                  <PlaceToken
                    campaignId={campaignId}
                    nodeId={current.id}
                    subjects={placeable}
                    // The SAME list the map draws, so a token the DM can see is always a token they can
                    // move — a control listing rows the renderer dropped would offer to move nothing. The
                    // label resolves the same way the token's own does, so the board and this control
                    // cannot call the same piece two different things.
                    placed={nodeTokens.map(({ o, t }) => ({
                      id: o.id,
                      label: t.nickname || subjects.get(subjectKey(t.subject))?.name || o.label || 'Token',
                    }))}
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
