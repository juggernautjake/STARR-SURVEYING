'use client';
// lib/hub/components/HubCanvas.tsx
//
// The orchestrator the `/admin/me` page mounts. Ties together:
//
//   - WidgetGrid (Slice 92) — driven by `widgets` (view) or
//     `draftWidgets` (edit)
//   - CustomizeHubButton + EditModeBar (Slice 97)
//   - AddWidgetModal (Slice 100)
//   - SettingsPanel (Slice 101)
//   - MobileBanner (Slice 151)
//
// Edit-mode interactions:
//   - drag → setDraftWidgets(compactedReorderedList)
//   - resize → setDraftWidgets(in-place patch + compactLayout(_, 12))
//   - click a cell → open SettingsPanel against that instance
//   - + Add Widget button → opens AddWidgetModal
//
// The canvas does NOT include the greeting card or the ClockInPill —
// those live in `/admin/me/page.tsx` above the canvas (greeting is
// non-customizable per v2 §5.1).
//
// Slice 185 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useState } from 'react';

import type { UserRole } from '@/lib/auth';
import type { BundleId } from '@/lib/saas/bundles';
import { useHubStore } from '@/lib/hub/hub-store';
import { compactLayout } from '@/lib/hub/grid-math';
import type { GridSize } from '@/lib/hub/grid-resize';

import WidgetGrid from './WidgetGrid';
import { CustomizeHubButton, EditModeBar } from './EditMode';
import AddWidgetModal from './AddWidgetModal';
import SettingsPanel from './SettingsPanel';
import MobileBanner from './MobileBanner';

export interface HubCanvasProps {
  /** Roles for the Add-Widget modal's catalog filter. */
  roles: UserRole[];
  /** Active subscription bundles. `null` skips the gate. */
  activeBundles?: BundleId[] | null;
}

export default function HubCanvas({ roles, activeBundles = null }: HubCanvasProps) {
  const widgets = useHubStore((s) => s.widgets);
  const draftWidgets = useHubStore((s) => s.draftWidgets);
  const isEditMode = useHubStore((s) => s.isEditMode);
  const setDraftWidgets = useHubStore((s) => s.setDraftWidgets);

  const [addOpen, setAddOpen] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  // Rendered widgets follow the draft buffer while editing, otherwise
  // mirror the saved layout.
  const displayWidgets = isEditMode && draftWidgets ? draftWidgets : widgets;

  const handleReorder = useCallback((next: typeof widgets) => {
    // WidgetGrid already runs compactLayout before calling us.
    setDraftWidgets(next);
  }, [setDraftWidgets]);

  const handleResize = useCallback((id: string, next: GridSize) => {
    const source = draftWidgets ?? widgets;
    const updated = source.map((w) => w.id === id ? { ...w, w: next.w, h: next.h } : w);
    setDraftWidgets(compactLayout(updated, 12));
  }, [draftWidgets, widgets, setDraftWidgets]);

  // Event-delegated click: in edit mode, a click anywhere inside a
  // cell opens the SettingsPanel for that widget. `e.preventDefault()`
  // suppresses link navigation so dropping into edit mode doesn't
  // surprise the user with a page change. Widget-internal buttons
  // still fire their own onClick (which is harmless — the panel just
  // opens too).
  const handleGridClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditMode) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const cell = target.closest<HTMLElement>('[data-widget-id]');
    if (!cell) return;
    // Skip drag + resize handles — they shouldn't trigger settings.
    const role = target.getAttribute('aria-label') ?? '';
    if (role.startsWith('Drag to') || role.startsWith('Resize')) return;
    e.preventDefault();
    const id = cell.getAttribute('data-widget-id');
    if (id) setSettingsId(id);
  }, [isEditMode]);

  return (
    <div className="hub-canvas" style={canvasStyle}>
      <MobileBanner />

      <header style={canvasHeaderStyle}>
        <h1 style={canvasTitleStyle}>Your hub</h1>
        <div style={{ display: 'flex', gap: 'var(--hub-spc-2, 8px)' }}>
          {isEditMode && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              style={addButtonStyle}
            >
              + Add widget
            </button>
          )}
          <CustomizeHubButton />
        </div>
      </header>

      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div onClick={handleGridClick}>
        <WidgetGrid
          widgets={displayWidgets}
          editMode={isEditMode}
          onReorder={handleReorder}
          onResize={handleResize}
        />
      </div>

      <EditModeBar />

      <AddWidgetModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        roles={roles}
        activeBundles={activeBundles}
      />

      <SettingsPanel
        instanceId={settingsId}
        onClose={() => setSettingsId(null)}
      />
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

const addButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '6px 12px',
  borderRadius: 6,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-elevated)',
  color: 'var(--theme-fg-primary)',
  cursor: 'pointer',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 500,
};
