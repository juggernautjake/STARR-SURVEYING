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
import { skinHxVars, shellThemeVars } from '@/lib/dnd/skin-tokens';
import { usePf2Panels } from './pf2/usePf2Panels';
import CodexShell from '@/app/dnd/_sheet/shells/CodexShell';
import DashboardShell from '@/app/dnd/_sheet/shells/DashboardShell';
// The shared FORMAT stylesheets — safe to load here: their rules are scoped under `.sheet-shell`
// (T-SHELL-SCOPE), so they only style a shell this sheet actually renders, and never the Classic view.
import '@/app/dnd/_sheet/styles/codex.css';

export default function PF2Sheet({ pf2, characterId, canEdit, isDM, variantKind = 'vanilla', sheetType, layout }: {
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
}) {
  const { panels, header, nav, banner, roller, overlays, footer } = usePf2Panels({ pf2, characterId, canEdit, isDM, variantKind });
  // Placed by id so the Classic shell reproduces the original DOM exactly — the roller sits between
  // Defenses and Conditions, the modals between Strikes and Feats. Gated panels are simply absent
  // from `panels`, so their `section(...)` renders nothing, matching the old conditional sections.
  const byId = new Map(panels.map((p) => [p.id, p]));
  const section = (id: string) => {
    const p = byId.get(id);
    // Keep the section id anchor + `pf2Section` wrapper so the jump nav still lands on each block.
    return p ? <section id={p.id} className={styles.pf2Section}>{p.render()}</section> : null;
  };

  // ── COLUMN FORMATS: Codex (T-5b) + Dashboard (T-5c) ───────────────────────────────────────────
  // Both arrange the same PF2 panel set around an identity column, differing only in how the body is
  // shown (Codex = a resizable pane rail; Dashboard = a card grid). `.sheet-shell` (NOT `.dnd-sheet`)
  // gives the shell its layout CSS without theme.css's element rules bleeding onto the PF2 panels; the
  // two token sets ride on the root — `skinHxVars` for the PF2 panels' `--hx-*`, `shellThemeVars` for
  // the shell's `--gold`/`--panel-rgb`/… — so the whole thing re-skins together.
  if (layout === 'codex' || layout === 'dashboard') {
    // The left identity column is PF2's own "at a glance": who they are (header) + attributes + the
    // defences/vitals block (AC/HP/saves). The body then holds everything else.
    const identityIds = new Set(['pf2-attributes', 'pf2-defenses']);
    const bodyPanels = panels.filter((p) => !identityIds.has(p.id));
    const identity = (
      <aside className="codex-identity">
        {header}
        {section('pf2-attributes')}
        {section('pf2-defenses')}
      </aside>
    );
    return (
      <div className="sheet-shell" style={{ ...skinHxVars(sheetType), ...shellThemeVars(sheetType), margin: '10px 0' }}>
        {layout === 'codex' ? (
          <CodexShell identity={identity} panels={bodyPanels} roller={roller} above={banner} storageKey={characterId} />
        ) : (
          <DashboardShell identity={identity} panels={bodyPanels} roller={roller} above={banner} />
        )}
        {/* Modals are fixed-position; they live outside the shell grid, same as in the Classic view. */}
        {overlays}
      </div>
    );
  }

  return (
    // The skin's `--hx-*` overrides ride on the sheet's own root, so every var(--hx-…) below re-resolves
    // to the chosen skin (default → {} → unchanged). Spread first so the layout props below still win.
    <div className={styles.framedPanel} style={{ ...skinHxVars(sheetType), margin: '10px 0', padding: '14px 16px', display: 'grid', gap: 16 }}>
      {header}
      {nav}
      {banner}
      {section('pf2-attributes')}
      {section('pf2-defenses')}
      {roller}
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
