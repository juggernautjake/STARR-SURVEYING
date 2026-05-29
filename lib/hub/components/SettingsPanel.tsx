'use client';
// lib/hub/components/SettingsPanel.tsx
//
// Right-rail panel rendered when the user clicks a widget while in
// edit mode. Houses the four customization tabs (Layout / Style /
// Content / Interaction), a live preview at the top, and the standard
// Esc / click-outside dismissers.
//
// The tab body components themselves land in Slices 102-104. This
// slice ships the shell + tab strip + accessibility plumbing so the
// later slices just fill in tab content.
//
// Desktop layout: 360px rail sliding in from the right.
// Mobile layout: full-screen overlay (handled by media query inline).
//
// Slice 101 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useEffect, useState } from 'react';
import { getWidget } from '@/lib/hub/widget-registry';
import { useHubStore } from '@/lib/hub/hub-store';
import type { WidgetCustomization, WidgetInstance } from '@/lib/hub/types';
import WidgetFrame from './WidgetFrame';
import SettingsTabs, { type SettingsTabId } from './SettingsTabs';

export interface SettingsPanelProps {
  /** The widget instance the user clicked. When null, the panel
   *  renders nothing. */
  instanceId: string | null;
  onClose: () => void;
  /** Mobile breakpoint in px; below this the panel renders as a
   *  full-screen overlay. Defaults to 768 to match the grid's tablet
   *  cutoff. */
  mobileBreakpoint?: number;
}

export default function SettingsPanel({ instanceId, onClose, mobileBreakpoint = 768 }: SettingsPanelProps) {
  const draftWidgets = useHubStore((s) => s.draftWidgets);
  const isEditMode = useHubStore((s) => s.isEditMode);
  const patchWidgetCustomization = useHubStore((s) => s.patchWidgetCustomization);

  const [activeTab, setActiveTab] = useState<SettingsTabId>('layout');
  const [viewportPx, setViewportPx] = useState<number>(1280);

  useEffect(() => {
    function tick() { setViewportPx(window.innerWidth); }
    tick();
    window.addEventListener('resize', tick);
    return () => window.removeEventListener('resize', tick);
  }, []);

  // Esc closes the panel.
  useEffect(() => {
    if (!instanceId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [instanceId, onClose]);

  // Reset to the layout tab when the target widget changes.
  useEffect(() => {
    setActiveTab('layout');
  }, [instanceId]);

  if (!instanceId || !isEditMode || !draftWidgets) return null;

  const instance = draftWidgets.find((w) => w.id === instanceId);
  if (!instance) return null;

  const definition = getWidget(instance.type);
  const customization: WidgetCustomization = instance.customization ?? {};
  const isMobile = viewportPx < mobileBreakpoint;
  const hasContentTab = Boolean(definition?.SettingsForm);

  function patch(next: WidgetCustomization) {
    patchWidgetCustomization(instance!.id, next);
  }

  const headingId = `hub-settings-heading-${instance.id}`;

  return (
    <div
      role="dialog"
      aria-modal={isMobile}
      aria-labelledby={headingId}
      style={isMobile ? overlayMobileStyle : overlayDesktopStyle}
      onClick={(e) => {
        // Click on the dim layer closes; click inside the rail does
        // not. The rail is the only child that stops propagation.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        style={isMobile ? railMobileStyle : railDesktopStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <header style={headerStyle}>
          <h2 id={headingId} style={titleStyle}>
            {definition?.label ?? instance.type} — settings
          </h2>
          <button type="button" onClick={onClose} aria-label="Close settings" style={closeButtonStyle}>
            ×
          </button>
        </header>

        <div style={previewWrapperStyle}>
          <PreviewFrame instance={instance} customization={customization} />
        </div>

        <SettingsTabs
          activeTab={activeTab}
          onChange={setActiveTab}
          contentTabEnabled={hasContentTab}
          labelledById={headingId}
        />

        <div style={panelBodyStyle}>
          <section
            id={`hub-settings-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`hub-settings-tab-${activeTab}`}
            style={{ height: '100%' }}
          >
            <TabPlaceholder
              tab={activeTab}
              instance={instance}
              customization={customization}
              onChange={patch}
              hasContentTab={hasContentTab}
            />
          </section>
        </div>
      </aside>
    </div>
  );
}

function PreviewFrame({ instance, customization }: { instance: WidgetInstance; customization: WidgetCustomization }) {
  const definition = getWidget(instance.type);
  if (!definition) {
    return (
      <WidgetFrame title={instance.type} colorMode="status" statusTint="warning">
        <div style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>
          Unknown widget — preview unavailable.
        </div>
      </WidgetFrame>
    );
  }
  const showTitle = customization.layout?.showTitle ?? true;
  const titleOverride = customization.layout?.titleOverride;
  const title = titleOverride && titleOverride.trim().length > 0 ? titleOverride : definition.label;
  return (
    <WidgetFrame
      title={title}
      showTitle={showTitle}
      colorMode={customization.style?.colorMode}
      statusTint={customization.style?.statusTint}
      customBg={customization.style?.customBg}
      customFg={customization.style?.customFg}
      borderRadius={customization.style?.borderRadius}
      shadowDepth={customization.style?.shadowDepth}
    >
      <div style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', color: 'var(--theme-fg-secondary)' }}>
        Preview reflects your customization choices.
      </div>
    </WidgetFrame>
  );
}

/** Until Slices 102-104 land, each tab renders a friendly placeholder
 *  pointing at the planning doc. The Layout tab still wires the
 *  showTitle toggle + custom-title input so the customization
 *  round-trip works today. */
function TabPlaceholder({
  tab,
  instance,
  customization,
  onChange,
  hasContentTab,
}: {
  tab: SettingsTabId;
  instance: WidgetInstance;
  customization: WidgetCustomization;
  onChange: (next: WidgetCustomization) => void;
  hasContentTab: boolean;
}) {
  if (tab === 'layout') {
    return (
      <LayoutTabSeed
        customization={customization}
        onChange={onChange}
      />
    );
  }

  if (tab === 'content') {
    if (!hasContentTab) {
      return (
        <div style={placeholderStyle}>
          This widget doesn&apos;t expose content settings.
        </div>
      );
    }
    const definition = getWidget(instance.type);
    if (!definition?.SettingsForm) return null;
    const SettingsForm = definition.SettingsForm;
    return (
      <SettingsForm
        value={(customization.content ?? definition.defaultContent) as Record<string, unknown>}
        onChange={(next) =>
          onChange({ ...customization, content: next })
        }
      />
    );
  }

  return (
    <div style={placeholderStyle}>
      The {tab} tab will arrive in {tabSliceFor(tab)}.
    </div>
  );
}

function tabSliceFor(tab: SettingsTabId): string {
  switch (tab) {
    case 'style':       return 'Slice 103';
    case 'interaction': return 'Slice 104';
    case 'layout':      return 'this slice'; // unreachable
    case 'content':     return 'this slice';
  }
}

/** Minimal showTitle + custom-title pair shipped in this slice so the
 *  shell can be exercised end-to-end. The full size grid + density
 *  override land in Slice 102. */
function LayoutTabSeed({
  customization,
  onChange,
}: {
  customization: WidgetCustomization;
  onChange: (next: WidgetCustomization) => void;
}) {
  const showTitle = customization.layout?.showTitle ?? true;
  const titleOverride = customization.layout?.titleOverride ?? '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={showTitle}
          onChange={(e) =>
            onChange({
              ...customization,
              layout: { ...customization.layout, showTitle: e.target.checked },
            })
          }
        />
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>
          Show widget title
        </span>
      </label>

      <label>
        <span style={settingsLabelStyle}>Custom title (optional)</span>
        <input
          type="text"
          value={titleOverride}
          onChange={(e) =>
            onChange({
              ...customization,
              layout: { ...customization.layout, titleOverride: e.target.value },
            })
          }
          placeholder="Defaults to the catalog label"
          style={textInputStyle}
        />
      </label>

      <p style={placeholderStyle}>
        Size grid + density override land in Slice 102.
      </p>
    </div>
  );
}

// ─── Style fragments ───────────────────────────────────────────────────

const overlayDesktopStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  justifyContent: 'flex-end',
  background: 'transparent',
  pointerEvents: 'none',
  zIndex: 40,
};

const overlayMobileStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'color-mix(in srgb, var(--theme-bg-page) 70%, transparent)',
  zIndex: 60,
};

const railDesktopStyle: React.CSSProperties = {
  width: 360,
  maxWidth: '100%',
  height: '100%',
  background: 'var(--theme-bg-surface)',
  color: 'var(--theme-fg-primary)',
  borderLeft: '1px solid var(--theme-border)',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '-8px 0 24px rgba(0,0,0,0.12)',
  pointerEvents: 'auto',
};

const railMobileStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'var(--theme-bg-surface)',
  color: 'var(--theme-fg-primary)',
  display: 'flex',
  flexDirection: 'column',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 'var(--hub-spc-3, 12px) var(--hub-spc-4, 16px)',
  borderBottom: '1px solid var(--theme-border)',
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 'var(--hub-font-base, 1rem)',
  fontWeight: 600,
};

const closeButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--theme-fg-secondary)',
  fontSize: 24,
  lineHeight: 1,
  cursor: 'pointer',
  padding: 4,
};

const previewWrapperStyle: React.CSSProperties = {
  padding: 'var(--hub-spc-3, 12px) var(--hub-spc-4, 16px)',
  borderBottom: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-page)',
};

const panelBodyStyle: React.CSSProperties = {
  padding: 'var(--hub-spc-4, 16px)',
  overflowY: 'auto',
  flex: 1,
};

const placeholderStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  color: 'var(--theme-fg-secondary)',
};

const settingsLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 600,
  marginBottom: 4,
};

const textInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-elevated)',
  color: 'var(--theme-fg-primary)',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
};
