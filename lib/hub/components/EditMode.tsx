'use client';
// lib/hub/components/EditMode.tsx
//
// Edit-mode UI: a "Customize Hub" toggle button (canvas top-right) and
// a floating Save / Cancel bar at the bottom of the viewport while
// editing. Drag handles, X buttons, the +Add-Widget tile, and the
// resize handle all land in subsequent slices — this slice ships the
// shell so the rest can hook in.
//
// Slice 97 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useEffect, useState } from 'react';
import { useHubStore } from '@/lib/hub/hub-store';
import { useHubActions } from '@/lib/hub/use-hub-actions';

/** Slice 151 — desktop-only edit mode. Below this px the canvas
 *  becomes read-only (saved layout, single-column stack, no edit
 *  affordances). Matches the breakpoint at which WidgetGrid collapses
 *  to one column. */
export const HUB_EDIT_MODE_BREAKPOINT_PX = 768;

export function useIsMobile(breakpoint: number = HUB_EDIT_MODE_BREAKPOINT_PX): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    function tick() { setMobile(window.innerWidth < breakpoint); }
    tick();
    window.addEventListener('resize', tick);
    return () => window.removeEventListener('resize', tick);
  }, [breakpoint]);
  return mobile;
}

/** Toggle button shown at the canvas top-right. Renders as
 *  "Customize Hub" in view mode and "Editing…" in edit mode. */
export function CustomizeHubButton({ className }: { className?: string }) {
  const isEditMode = useHubStore((s) => s.isEditMode);
  // Slice 200 — actions via getState (stable closures), no wasted subscription.
  const { enterEditMode } = useHubActions();
  const isMobile = useIsMobile();

  // Hide the customize button on mobile — editing is desktop-only.
  if (isMobile) return null;

  if (isEditMode) {
    return (
      <span
        className={className}
        aria-live="polite"
        style={editingBadgeStyle}
      >
        Editing hub…
      </span>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={enterEditMode}
      style={customizeButtonStyle}
    >
      ✏️ Customize Hub
    </button>
  );
}

/** Floating Save / Cancel bar rendered while editing. Pinned to the
 *  bottom-center of the viewport so it stays in view as the user
 *  scrolls the canvas. */
export function EditModeBar() {
  const isEditMode = useHubStore((s) => s.isEditMode);
  const isDirty = useHubStore((s) => s.isDirty);
  const saveStatus = useHubStore((s) => s.saveStatus);
  const saveError = useHubStore((s) => s.saveError);
  // Slice 200 — actions via getState (stable closures), no wasted subscription.
  const { cancelEdit, saveDraft } = useHubActions();

  // Esc cancels editing — matches the modal-style "press Esc to back
  // out" intuition. Only attaches while editing so the global Esc
  // handler isn't perma-listening.
  useEffect(() => {
    if (!isEditMode) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (saveStatus === 'saving') return;
      cancelEdit();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isEditMode, saveStatus, cancelEdit]);

  if (!isEditMode) return null;

  const saving = saveStatus === 'saving';

  return (
    <div role="region" aria-label="Edit hub" style={editBarWrapperStyle}>
      <div style={editBarStyle}>
        <span style={hintStyle}>
          {isDirty ? 'Unsaved changes' : 'No changes yet'}
        </span>
        <div style={{ display: 'flex', gap: 'var(--hub-spc-2, 8px)' }}>
          <button
            type="button"
            onClick={cancelEdit}
            disabled={saving}
            style={secondaryButtonStyle}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={saveDraft}
            disabled={saving || !isDirty}
            style={{
              ...primaryButtonStyle,
              opacity: !isDirty || saving ? 0.6 : 1,
              cursor: !isDirty || saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Save layout'}
          </button>
        </div>
      </div>
      {saveStatus === 'error' && saveError && (
        <div role="alert" style={errorBannerStyle}>
          {saveError}
        </div>
      )}
    </div>
  );
}

// ─── Style fragments ───────────────────────────────────────────────────

const customizeButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  borderRadius: 6,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-elevated)',
  color: 'var(--theme-fg-primary)',
  cursor: 'pointer',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 500,
};

const editingBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  borderRadius: 6,
  background: 'var(--theme-accent)',
  color: 'var(--theme-accent-fg)',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 600,
};

const editBarWrapperStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 'var(--hub-spc-4, 16px)',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 10,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--hub-spc-2, 8px)',
  pointerEvents: 'none',
};

const editBarStyle: React.CSSProperties = {
  pointerEvents: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--hub-spc-3, 12px)',
  padding: 'var(--hub-spc-2, 8px) var(--hub-spc-3, 12px)',
  borderRadius: 8,
  background: 'var(--theme-bg-surface)',
  border: '1px solid var(--theme-border)',
  boxShadow: '0 4px 16px rgba(0,0,0,0.16)',
};

const hintStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  color: 'var(--theme-fg-secondary)',
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 6,
  border: 'none',
  background: 'var(--theme-accent)',
  color: 'var(--theme-accent-fg)',
  fontWeight: 600,
  fontSize: 'var(--hub-font-sm, 0.875rem)',
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 6,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-elevated)',
  color: 'var(--theme-fg-primary)',
  cursor: 'pointer',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
};

const errorBannerStyle: React.CSSProperties = {
  pointerEvents: 'auto',
  padding: 'var(--hub-spc-2, 8px) var(--hub-spc-3, 12px)',
  borderRadius: 6,
  background: 'color-mix(in srgb, var(--theme-danger) 12%, var(--theme-bg-surface))',
  color: 'var(--theme-danger)',
  border: '1px solid var(--theme-danger)',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  maxWidth: 480,
};
