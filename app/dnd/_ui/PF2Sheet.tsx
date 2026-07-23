// app/dnd/_ui/PF2Sheet.tsx — the bespoke Pathfinder 2e character sheet (Remaster), as the CLASSIC
// format fed by the PF2 panel set.
//
// The maths and every section now live in `usePf2Panels` (the PF2 SheetPanelSet — see that file and
// the FORMAT = SHELL, SYSTEM = PANELS decision in the planning doc). This file is the thin Classic
// shell: it calls the hook and lays the furniture + panels out in the sheet's original order, so the
// rendered result and every interaction are byte-for-byte what they were before the extraction. The
// same panel set feeds the Codex/Dashboard/Play shells in later slices; this one is the default.
//
// Every derived number is still computed once by the pure rules engine inside the hook
// (`pf2ResolveAll` → `.total`, read by both card and roll) and the sheet remains prop-driven (never
// the 5e store). Styleable: the root re-resolves the skin's `--hx-*` tokens, so the skin picker
// restyles it for free.
'use client';

import styles from './hextech.module.css';
import type { PF2Character } from '@/lib/dnd/systems/pathfinder2e/model';
import { skinHxVars, shellThemeVars, themeToHxVars, themeToShellVars, skinClass } from '@/lib/dnd/skin-tokens';
import { resolveThemeVariant } from '@/app/dnd/_sheet/theme';
import { usePf2Panels } from './pf2/usePf2Panels';
import { useLayoutChoice } from '@/lib/dnd/layoutChoice';
import CodexShell from '@/app/dnd/_sheet/shells/CodexShell';
import DashboardShell from '@/app/dnd/_sheet/shells/DashboardShell';
import PlayShell from '@/app/dnd/_sheet/shells/PlayShell';
import FloatingRoller from '@/app/dnd/_sheet/components/rollers/FloatingRoller';
import SheetPortrait from '@/app/dnd/_sheet/components/SheetPortrait';
// The shared FORMAT stylesheets — safe to load here: their rules are scoped under `.sheet-shell`
// (T-SHELL-SCOPE), so they only style a shell this sheet actually renders, and never the Classic view.
import '@/app/dnd/_sheet/styles/codex.css';
import '@/app/dnd/_sheet/styles/play.css';

export default function PF2Sheet({ pf2, characterId, canEdit, isDM, variantKind = 'vanilla', sheetType, layout, artUrl, name, skinVariant, rollerTemplate, rollerAnim, customSections }: {
  pf2: PF2Character; characterId?: string; canEdit?: boolean;
  isDM?: boolean;
  /** Vanilla characters are held to class and level; custom ones are flagged, not blocked. Defaults
   *  to vanilla — the safe direction, matching the server. */
  variantKind?: 'vanilla' | 'custom';
  /** The character's chosen skin (`character.sheet_type`). Overrides the inherited `--hx-*` tokens on
   *  this sheet's root so the skin picker actually restyles the bespoke PF2 sheet (default → no change). */
  sheetType?: string;
  /** The chosen TEMPLATE (`data.sheetLayout`). 'codex' renders the shared Codex shell fed by the PF2
   *  panel set; anything else (incl. undefined) is the default Classic view. */
  layout?: string;
  /** Uploaded character art (`character.art_url`) — rendered as a portrait in EVERY format so PF2 art is
   *  visible like the 5e sheet's (CX-R4). Absent → no portrait. */
  artUrl?: string | null;
  /** Character name, for the portrait's alt text. */
  name?: string | null;
  /** The chosen colour THEME (`data.skinVariant`, one of the 5 universal themes). When set, its palette
   *  recolours this sheet over the skin, in any format (U-2); unset → the skin's native colours. */
  skinVariant?: string;
  /** The chosen dice-roller template + animation pref (`data.rollerTemplate` / `data.rollerAnim`), so PF2
   *  mounts the same animated roller the 5e sheet does (RO-5). */
  rollerTemplate?: string;
  rollerAnim?: boolean;
  /** Player-authored custom sections (`data.customSections`, D-13). */
  customSections?: import('@/lib/dnd/custom-sections').CustomSection[];
}) {
  // The TEMPLATE is read reactively (CM-1): the SheetChrome chip writes the session cache and pings, so a
  // template pick re-renders this sheet into the new shell instantly — no full reload. Falls back to the
  // saved `layout` prop (and 'classic') until a pick is made, matching the server render.
  const effLayout = useLayoutChoice(characterId, layout);
  const { panels, header, nav, banner, roller, overlays, footer } = usePf2Panels({ pf2, characterId, canEdit, isDM, variantKind, rollerTemplate, rollerAnim, layout: effLayout, customSections });
  // Placed by id so the Classic shell reproduces the original DOM exactly — the roller sits between
  // Defenses and Conditions, the modals between Strikes and Feats. Gated panels are simply absent
  // from `panels`, so their `section(...)` renders nothing, matching the old conditional sections.
  const byId = new Map(panels.map((p) => [p.id, p]));
  const section = (id: string) => {
    const p = byId.get(id);
    // Keep the section id anchor + `pf2Section` wrapper so the jump nav still lands on each block.
    return p ? <section id={p.id} className={styles.pf2Section}>{p.render()}</section> : null;
  };
  // The shell wrapper style for the codex/dashboard/play formats. The `background: var(--hx-navy-0)`
  // is load-bearing: the shell's panels are `rgba(var(--panel-rgb), …)` translucent, so WITHOUT an
  // opaque skin-base behind them they blend with the dark page — which made LIGHT skins (jack/donata)
  // render dark. The base is the skin's own page tone, so every skin reads correctly.
  // The chosen colour theme (U-2), if any: its --hx-* palette layers OVER the skin's so the theme wins,
  // and its shell tokens recolour the format shells the same way. Unset → the skin's native colours.
  const theme = skinVariant ? resolveThemeVariant(sheetType, skinVariant).theme : null;
  const hxVars: React.CSSProperties = { ...skinHxVars(sheetType), ...themeToHxVars(theme) };
  const shellTokens: React.CSSProperties = theme ? themeToShellVars(theme) : shellThemeVars(sheetType);
  const skin = skinClass(sheetType); // the skin-<id> hook for per-skin surface textures (CS-2)
  const shellWrap: React.CSSProperties = {
    ...hxVars,
    ...shellTokens,
    background: 'var(--hx-navy-0)',
    borderRadius: 12,
    padding: '10px 12px',
    margin: '10px 0',
  };

  // ── COLUMN FORMATS: Codex (T-5b) + Dashboard (T-5c) ───────────────────────────────────────────
  // Both arrange the same PF2 panel set around an identity column, differing only in how the body is
  // shown (Codex = a resizable pane rail; Dashboard = a card grid). `.sheet-shell` (NOT `.dnd-sheet`)
  // gives the shell its layout CSS without theme.css's element rules bleeding onto the PF2 panels; the
  // two token sets ride on the root — `skinHxVars` for the PF2 panels' `--hx-*`, `shellThemeVars` for
  // the shell's `--gold`/`--panel-rgb`/… — so the whole thing re-skins together.
  if (effLayout === 'codex' || effLayout === 'dashboard') {
    // The left identity column is PF2's own "at a glance": who they are (header) + attributes + the
    // defences/vitals block (AC/HP/saves). The body then holds everything else.
    // Active conditions ride in the identity column so their penalties are visible at a glance while you
    // play (S7f) — otherwise they'd be one rail tab away. Only when present, so a clean sheet stays clean.
    const hasActiveConditions = (pf2.combat.conditions?.length ?? 0) > 0;
    const identityIds = new Set(['pf2-attributes', 'pf2-defenses', ...(hasActiveConditions ? ['pf2-conditions'] : [])]);
    const bodyPanels = panels.filter((p) => !identityIds.has(p.id));
    const identity = (
      <aside className="codex-identity">
        <SheetPortrait artUrl={artUrl} name={name} />
        {header}
        {section('pf2-attributes')}
        {section('pf2-defenses')}
        {hasActiveConditions && section('pf2-conditions')}
      </aside>
    );
    return (
      <div className={`sheet-shell ${skin}`} style={shellWrap}>
        {effLayout === 'codex' ? (
          <CodexShell identity={identity} panels={bodyPanels} roller={roller} above={banner} storageKey={characterId} />
        ) : (
          <DashboardShell identity={identity} panels={bodyPanels} roller={roller} above={banner} storageKey={characterId} />
        )}
        {/* Modals are fixed-position; they live outside the shell grid, same as in the Classic view. */}
        {overlays}
      </div>
    );
  }

  // ── PLAY (T-5d) ───────────────────────────────────────────────────────────────────────────────
  // Built for the table: the PF2 HERO is what you touch in a fight — the defences/vitals block (AC,
  // HP, saves, class/spell DC) and the Strikes. Everything you only look up (attributes, skills,
  // feats, spells, conditions) folds into the reference drawer. Same `.sheet-shell` + dual token sets.
  if (effLayout === 'play') {
    // Active conditions join the hero (S7f) so combat-critical penalties are visible while fighting, not
    // buried in the closed reference drawer. Only when present.
    const hasActiveConditions = (pf2.combat.conditions?.length ?? 0) > 0;
    const heroIds = new Set(['pf2-defenses', 'pf2-strikes', ...(hasActiveConditions ? ['pf2-conditions'] : [])]);
    const drawerPanels = panels.filter((p) => !heroIds.has(p.id));
    const identity = <div className="play-id"><SheetPortrait artUrl={artUrl} name={name} />{header}</div>;
    const hero = (
      <>
        {section('pf2-defenses')}
        {section('pf2-strikes')}
        {hasActiveConditions && section('pf2-conditions')}
      </>
    );
    return (
      <div className={`sheet-shell ${skin}`} style={shellWrap}>
        <PlayShell
          identity={identity}
          above={banner}
          hero={hero}
          roller={roller}
          storageKey={characterId}
          drawerPanels={drawerPanels}
          drawerHint="attributes · skills · feats · spells"
        />
        {overlays}
      </div>
    );
  }

  return (
    // The skin's `--hx-*` overrides ride on the sheet's own root, so every var(--hx-…) below re-resolves
    // to the chosen skin (default → {} → unchanged). Spread first so the layout props below still win.
    // `shellTokens` (the `--void`/`--gold`/… bridge) rides here too so the floating animated roller — which
    // styles from those 5e tokens — renders correctly on the Classic view; the PF2 panels use `--hx-*`, so
    // these extra vars don't touch them (RO-5 roller-styling fix).
    <div className={`${styles.framedPanel} ${skin}`} style={{ ...hxVars, ...shellTokens, margin: '10px 0', padding: '14px 16px', display: 'grid', gap: 16 }}>
      {/* Portrait beside the header so uploaded PF2 art is visible on the Classic view too (CX-R4). */}
      {artUrl ? (
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ width: 132, flex: 'none' }}><SheetPortrait artUrl={artUrl} name={name} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>{header}</div>
        </div>
      ) : header}
      {nav}
      {banner}
      {section('pf2-attributes')}
      {section('pf2-defenses')}
      {/* The roller floats (R-2) — pinned, movable, resizable, minimizable, remembered per character. */}
      <FloatingRoller characterId={characterId}>{roller}</FloatingRoller>
      {section('pf2-conditions')}
      {section('pf2-skills')}
      {section('pf2-strikes')}
      {overlays}
      {section('pf2-feats')}
      {section('pf2-spells')}
      {footer}
    </div>
  );
}
