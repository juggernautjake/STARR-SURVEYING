// app/dnd/_ui/IGSheet.tsx — the bespoke Intuitive Games character sheet, as the CLASSIC format fed by the
// IG panel set.
//
// The maths and every section now live in `useIgPanels` (the IG SheetPanelSet — see that file and the
// FORMAT = SHELL, SYSTEM = PANELS decision in the planning doc). This file is the thin Classic shell: it
// calls the hook and lays the furniture + panels out in the sheet's original order, so the rendered result
// and every interaction are byte-for-byte what they were before the extraction. The same panel set will feed
// the Codex/Dashboard/Play shells in later slices; this one is the default.
//
// Every derived number is still computed once by the pure rules engine inside the hook (igDerived +
// igInPlayState, read by both card and roll) and the sheet stays prop-driven (never the 5e store). Styleable:
// the root re-resolves the skin's `--hx-*` tokens, so the skin picker restyles it for free. IG has NO AC by
// design — the Vitals panel leads with HP, the three saves (Fortitude/Reflex/Will) and Proficiency, unchanged.
//
// LAYOUT (2026-07-21 restyle, preserved): a stack of clearly-headed <Section> cards with a sticky in-sheet
// jump-nav and a prominent Vitals strip. The active STANCE gets a "Currently in: X" banner, and the
// three-action economy carries consistent cost glyphs. All of that now lives in the panel set; this shell
// only injects the `.igs-root`-scoped interactivity CSS and places the pieces.
'use client';

import { Fragment } from 'react';
import styles from './hextech.module.css';
import type { IGCharacter } from '@/lib/dnd/systems/intuitive-games/model';
import { skinHxVars, shellThemeVars, themeToHxVars, themeToShellVars } from '@/lib/dnd/skin-tokens';
import { resolveThemeVariant } from '@/app/dnd/_sheet/theme';
import { useIgPanels, type Tagged } from './ig/useIgPanels';
import CodexShell from '@/app/dnd/_sheet/shells/CodexShell';
import DashboardShell from '@/app/dnd/_sheet/shells/DashboardShell';
import PlayShell from '@/app/dnd/_sheet/shells/PlayShell';
import FloatingRoller from '@/app/dnd/_sheet/components/rollers/FloatingRoller';
import SheetPortrait from '@/app/dnd/_sheet/components/SheetPortrait';
// Shared FORMAT stylesheets — scoped under `.sheet-shell` (T-SHELL-SCOPE), so they only style a shell
// this sheet actually renders and never the Classic view.
import '@/app/dnd/_sheet/styles/codex.css';
import '@/app/dnd/_sheet/styles/play.css';

// Interactivity + motion (req 3), kept in ONE injected <style> so the whole IG restyle stays local: the
// shared hextech.module.css holds a sibling PF2 pass, and touching it would collide. Every hover cue is
// driven through `transform` / `box-shadow` / `outline` — properties the panels never set inline — so the
// rules ALWAYS win over the inline base styles without needing `!important`. The one place a class must
// repaint an inline value (the tile fill on hover) is handled by giving the tile its background from
// `.igs-tile` (not inline) so the `:hover` rule can legitimately override it by specificity. Every colour is
// a `var(--hx-*)` token so all five skins stay correct; the neutral drop-shadow is a shadow (not a themed
// hue), so it reads on light and dark alike. `prefers-reduced-motion` removes the movement AND the transition
// but keeps the shadow/outline affordance, so tappable things still look tappable without motion.
const IGS_STYLES = `
.igs-root .igs-int { transition: transform .12s ease, box-shadow .12s ease, background-color .12s ease, border-color .12s ease; }
.igs-root .igs-int:hover { transform: translateY(-1px); box-shadow: 0 0 0 1px var(--hx-gold-1), 0 6px 16px rgba(0,0,0,.32); }
.igs-root .igs-int:active { transform: translateY(0); }
.igs-root .igs-int:focus-visible { outline: 2px solid var(--hx-gold-1); outline-offset: 2px; }
.igs-root .igs-tile { background: var(--hx-inset); }
.igs-root .igs-tile.igs-int:hover { background: var(--hx-inset-strong); }
.igs-root .igs-row { transition: background-color .12s ease; }
.igs-root .igs-row:hover { background: var(--hx-inset-soft); }
.igs-root .igs-row:focus-visible { outline: 2px solid var(--hx-gold-1); outline-offset: -2px; }
.igs-root .igs-link { transition: color .12s ease, text-decoration-color .12s ease; }
.igs-root .igs-link:hover { text-decoration: underline; text-underline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  .igs-root .igs-int, .igs-root .igs-int:hover, .igs-root .igs-int:active { transition: none; transform: none; }
}
`;

export default function IGSheet({ ig, elements, canEdit, characterId, isDM, variantKind = 'vanilla', sheetType, layout, artUrl, name, skinVariant, rollerTemplate, rollerAnim, customSections }: {
  ig: IGCharacter; elements: Tagged[]; canEdit?: boolean; characterId?: string;
  isDM?: boolean;
  /** Vanilla characters are held to their class; custom ones are flagged, not blocked. Defaults to
   *  vanilla — the safe direction, matching the server. */
  variantKind?: 'vanilla' | 'custom';
  /** The character's chosen skin (`character.sheet_type`). Overrides the inherited `--hx-*` tokens on
   *  this sheet's root so the skin picker actually restyles the bespoke IG sheet (default → no change). */
  sheetType?: string;
  /** The chosen TEMPLATE (`data.sheetLayout`) — codex/dashboard/play render the shared shells fed by
   *  the IG panel set; anything else (incl. undefined) is the default Classic view. */
  layout?: string;
  /** Uploaded character art (`character.art_url`) — rendered as a portrait in EVERY format so IG art is
   *  visible like the 5e sheet's (CX-R4). Absent → no portrait. */
  artUrl?: string | null;
  /** Character name, for the portrait's alt text. */
  name?: string | null;
  /** The chosen colour THEME (`data.skinVariant`) — its palette recolours this sheet over the skin, in
   *  any format (U-2); unset → the skin's native colours. */
  skinVariant?: string;
  /** The chosen dice-roller template + animation pref (`data.rollerTemplate` / `data.rollerAnim`), so IG
   *  mounts the same animated roller the 5e sheet does (RO-5). */
  rollerTemplate?: string;
  rollerAnim?: boolean;
  /** Player-authored custom sections (`data.customSections`, D-13). */
  customSections?: import('@/lib/dnd/custom-sections').CustomSection[];
}) {
  const { panels, header, nav, banner, roller, overlays } = useIgPanels({ ig, elements, canEdit, characterId, isDM, variantKind, rollerTemplate, rollerAnim, layout, customSections });
  const byId = new Map(panels.map((p) => [p.id, p]));
  const render = (id: string) => byId.get(id)?.render() ?? null;
  // Both token sets ride on the shell root: `skinHxVars` for the IG panels' `--hx-*`, `shellThemeVars`
  // for the shell's `--gold`/`--panel-rgb`/…. `.sheet-shell` gives the shell layout without theme.css
  // bleed; `.igs-root` keeps the IG panels' own scoped interactivity CSS working inside the shell.
  // `background: var(--hx-navy-0)` is load-bearing: the shell's panels are `rgba(var(--panel-rgb), …)`
  // translucent, so without an opaque skin-base behind them they blend with the dark page — which made
  // LIGHT skins render dark. The base is the skin's own page tone, so every skin reads correctly.
  // The chosen colour theme (U-2), if any: its --hx-* palette layers OVER the skin's, and its shell tokens
  // recolour the format shells the same way. Unset → the skin's native colours.
  const theme = skinVariant ? resolveThemeVariant(sheetType, skinVariant).theme : null;
  const hxVars: React.CSSProperties = { ...skinHxVars(sheetType), ...themeToHxVars(theme) };
  const shellTokens: React.CSSProperties = theme ? themeToShellVars(theme) : shellThemeVars(sheetType);
  const shellStyle = {
    ...hxVars,
    ...shellTokens,
    background: 'var(--hx-navy-0)',
    borderRadius: 12,
    padding: '10px 12px',
    margin: '10px 0',
  } as React.CSSProperties;

  // ── COLUMN FORMATS: Codex (T-6b) + Dashboard (T-6c) ───────────────────────────────────────────
  // IG's "at a glance" identity column is who they are (header) + Vitals (HP + Fort/Ref/Will + Prof —
  // NO AC, IG has none by design) + Abilities. The body holds everything else.
  if (layout === 'codex' || layout === 'dashboard') {
    const identityIds = new Set(['ig-vitals', 'ig-abilities']);
    const bodyPanels = panels.filter((p) => !identityIds.has(p.id));
    const identity = (
      <aside className="codex-identity">
        <SheetPortrait artUrl={artUrl} name={name} />
        {header}
        {render('ig-vitals')}
        {render('ig-abilities')}
      </aside>
    );
    return (
      <div className="sheet-shell igs-root" style={shellStyle}>
        <style dangerouslySetInnerHTML={{ __html: IGS_STYLES }} />
        {layout === 'codex' ? (
          <CodexShell identity={identity} panels={bodyPanels} roller={roller} above={banner} storageKey={characterId} />
        ) : (
          <DashboardShell identity={identity} panels={bodyPanels} roller={roller} above={banner} storageKey={characterId} />
        )}
        {overlays}
      </div>
    );
  }

  // ── PLAY (T-6d) ───────────────────────────────────────────────────────────────────────────────
  // The IG hero is the table-facing pair: Vitals (HP + saves) and Combat. The rest folds into the
  // reference drawer.
  if (layout === 'play') {
    const heroIds = new Set(['ig-vitals', 'ig-combat']);
    const drawerPanels = panels.filter((p) => !heroIds.has(p.id));
    const identity = <div className="play-id"><SheetPortrait artUrl={artUrl} name={name} />{header}</div>;
    const hero = (
      <>
        {render('ig-vitals')}
        {render('ig-combat')}
      </>
    );
    return (
      <div className="sheet-shell igs-root" style={shellStyle}>
        <style dangerouslySetInnerHTML={{ __html: IGS_STYLES }} />
        <PlayShell
          identity={identity}
          above={banner}
          hero={hero}
          roller={roller}
          storageKey={characterId}
          drawerPanels={drawerPanels}
          drawerHint="abilities · skills · powers · feats"
        />
        {overlays}
      </div>
    );
  }

  return (
    // The main column deliberately leaves its top open (overlays/banner → header → jump-nav → Vitals). The
    // skin's `--hx-*` overrides ride on the sheet's own root, so every var(--hx-…) below re-resolves to the
    // chosen skin (default → {} → unchanged). Spread first so the layout props below still win. Panels render
    // in order as direct grid children (each returns its own `<Section id=…>` wrapper, so the jump-nav anchors
    // still land), reproducing the monolith's DOM exactly.
    <div className={`${styles.framedPanel} igs-root`} style={{ ...hxVars, ...shellTokens, margin: '10px 0', padding: '14px 16px', display: 'grid', gap: 14 }}>
      {/* Scoped interactivity CSS (req 3). Injected once at the top of this component's own subtree; every
          selector is prefixed `.igs-root` so it cannot leak into the PF2 sheet or the rest of the page. */}
      <style dangerouslySetInnerHTML={{ __html: IGS_STYLES }} />
      {overlays}
      {banner}
      {/* Portrait beside the header so uploaded IG art is visible on the Classic view too (CX-R4). */}
      {artUrl ? (
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ width: 132, flex: 'none' }}><SheetPortrait artUrl={artUrl} name={name} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>{header}</div>
        </div>
      ) : header}
      {nav}
      {panels.map((p) => <Fragment key={p.id}>{p.render()}</Fragment>)}
      {/* The roller floats (R-2) — pinned, movable, resizable, minimizable, remembered per character. */}
      <FloatingRoller characterId={characterId}>{roller}</FloatingRoller>
    </div>
  );
}
