'use client';
// lib/hub/components/HubCanvas.tsx
//
// The orchestrator the `/admin/me` page mounts. Ties together:
//
//   - WidgetGrid (Slice 92) — driven by `widgets` (view) or
//     `draftWidgets` (edit)
//   - GridEditor modal — the single editor surface (Slice 2 of
//     employee-hub-overhaul-2026-05-30); now houses both layout
//     authoring AND per-widget options (Slice 11) so the previous
//     SettingsPanel side rail is gone.
//   - MobileBanner (Slice 151)
//
// Slice 2 collapsed the previous two editing surfaces — the in-canvas
// drag/resize edit mode + the parallel grid-painter modal — down to the
// single centered modal opened by the one Customize-Hub button. The
// modal owns the whole authoring flow (palette add, place, resize,
// move, options, save/cancel). The old in-header add-widget button, the
// AddWidgetModal mount, and the floating EditModeBar are gone — the
// modal's own footer is the commit surface.
// Slice 17 of employee-hub-overhaul-2026-05-30 retired the SettingsPanel
// side rail (every option lives in the modal now via the Slice-11
// WidgetOptionsPanel), so the click-delegation handler that opened it
// is gone too.
//
// The canvas does NOT include the greeting card or the ClockInPill —
// those live in `/admin/me/page.tsx` above the canvas (greeting is
// non-customizable per v2 §5.1).
//
// Slice 185 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { UserRole } from '@/lib/auth';
import type { BundleId } from '@/lib/saas/bundles';
import { useHubStore } from '@/lib/hub/hub-store';
import { useHubActions } from '@/lib/hub/use-hub-actions';

import WidgetGrid from './WidgetGrid';
import GridEditor from './GridEditor';
import MobileEditor from './MobileEditor';
import { useIsMobile } from './EditMode';
import WelcomeTip from './WelcomeTip';
import PerfOverlay, { isPerfOverlayActive } from './PerfOverlay';

export interface HubCanvasProps {
  /** Roles for the editor's catalog filter. */
  roles: UserRole[];
  /** Active subscription bundles. `null` skips the gate. */
  activeBundles?: BundleId[] | null;
  /** True when the user is rendering the persona-default seed (no
   *  saved layout row yet). Drives the Slice 196 welcome tip. */
  isSeeded?: boolean;
}

export default function HubCanvas({ roles, activeBundles = null, isSeeded = false }: HubCanvasProps) {
  const widgets = useHubStore((s) => s.widgets);
  const draftWidgets = useHubStore((s) => s.draftWidgets);
  const isEditMode = useHubStore((s) => s.isEditMode);
  // Slice 200 — actions read via getState (stable closures) so the
  // canvas only subscribes to data slices that can actually change.
  // Slice 2 (employee-hub-overhaul) — enterEditMode + cancelEdit drive
  // the single modal-editor entry/exit.
  // Fixup 2026-05-30 — modal visibility now == isEditMode, so every
  // path that flips edit mode (the in-canvas button + the AdminTopBar
  // /admin/me?edit=1 deep-link) opens the modal in one click. No
  // parallel local-useState mirror; no second click required.
  // Slice 3 — the canvas's WidgetGrid is view-only now, so setDraftWidgets
  // no longer wires up through it (the modal owns drag/resize commits).
  const { enterEditMode, cancelEdit } = useHubActions();

  // One click on the page button enters edit mode (which now also
  // means "the modal is open" — see the `open={isEditMode}` mount on
  // GridEditor below).
  const openEditor = useCallback(() => {
    enterEditMode();
  }, [enterEditMode]);

  // Closing the modal without an explicit Save/Cancel (backdrop / Esc →
  // onClose) routes through cancelEdit so the store doesn't strand in
  // an editing state with no visible editor. cancelEdit is a no-op
  // once GridEditor's own handleSave / handleCancel already exited.
  const closeEditor = useCallback(() => {
    if (useHubStore.getState().isEditMode) cancelEdit();
  }, [cancelEdit]);

  // Slice 207 — render-count instrumentation under ?debug=hub-perf.
  // The flag is read once on mount so toggling requires a page
  // reload (matches the rest of the debug-flag conventions). The
  // ref ticks on every canvas re-render — when the overlay is off,
  // the ref still increments but the overlay itself doesn't mount
  // so no React subscription pays the cost.
  const [perfActive, setPerfActive] = useState(false);
  useEffect(() => { setPerfActive(isPerfOverlayActive()); }, []);
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  // Rendered widgets follow the draft buffer while editing, otherwise
  // mirror the saved layout. The grid renders the *current* state
  // behind the modal so save-cancel feedback is visible underneath.
  const displayWidgets = isEditMode && draftWidgets ? draftWidgets : widgets;

  // On phones the 8-col drag-and-drop grid painter is unusable, so we
  // swap in MobileEditor (a vertical reorder/add/remove sheet). The
  // breakpoint matches WidgetGrid's single-column collapse.
  const isMobile = useIsMobile();

  return (
    <div className="hub-canvas" style={canvasStyle}>
      <header style={canvasHeaderStyle}>
        <h1 style={canvasTitleStyle}>Your hub</h1>
        <div style={{ display: 'flex', gap: 'var(--hub-spc-2, 8px)' }}>
          {/* Slice 2 (employee-hub-overhaul) — a single on-page entry
              point opens the centered modal editor. The modal owns the
              whole authoring flow (palette add, place, resize, move,
              options, save/cancel), so the old in-header grid-painter +
              add-widget buttons and the in-canvas edit surface are gone.
              Hidden while the editor is already open. */}
          {!isEditMode && (
            <button
              type="button"
              onClick={openEditor}
              style={customizeEntryButtonStyle}
              data-testid="open-grid-editor"
            >
              ✏️ Customize Hub
            </button>
          )}
        </div>
      </header>

      <WelcomeTip show={isSeeded} />

      <WidgetGrid widgets={displayWidgets} />

      {isMobile ? (
        <MobileEditor
          open={isEditMode}
          onClose={closeEditor}
          roles={roles}
          activeBundles={activeBundles}
        />
      ) : (
        <GridEditor
          open={isEditMode}
          onClose={closeEditor}
          roles={roles}
          activeBundles={activeBundles}
        />
      )}

      {perfActive && <PerfOverlay canvasRenderCount={renderCountRef.current} />}
    </div>
  );
}

// ─── Style fragments ───────────────────────────────────────────────────

const canvasStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--hub-spc-3, 12px)',
};

const canvasHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--hub-spc-2, 8px)',
};

const canvasTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 'var(--hub-font-xl, 1.25rem)',
  fontWeight: 700,
  color: 'var(--theme-fg-primary)',
};

/** Slice 2 — the single "Customize Hub" entry button. Accent-tinted so
 *  it reads as the primary action that opens the modal editor. */
const customizeEntryButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 14px',
  borderRadius: 6,
  border: 'none',
  background: 'var(--theme-accent, #3b82f6)',
  color: 'var(--theme-accent-fg, #ffffff)',
  cursor: 'pointer',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 600,
  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
};
