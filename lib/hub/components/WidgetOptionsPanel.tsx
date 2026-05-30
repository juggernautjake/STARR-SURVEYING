'use client';
// lib/hub/components/WidgetOptionsPanel.tsx
//
// Slice 11 of employee-hub-overhaul-2026-05-30.md. The in-modal
// per-widget editor that opens when the surveyor clicks the ⚙
// Options button on a painted widget in GridEditor.
//
// Four sections, in order:
//   1. Size     — w/h steppers clamped to the definition envelope.
//   2. Header   — color picker → customization.style.headerColor.
//   3. Title    — text input → customization.layout.titleOverride.
//   4. Options  — host slot rendering definition.SettingsForm (when
//                 defined) writing to customization.content.
//
// Edits route through:
//   - size      → setDraftWidgets (size lives on WidgetInstance.x/y/w/h)
//   - the rest  → patchWidgetCustomization (merges with current
//                 customization in the store)
//
// Renders as a fixed-position centered card with a click-out
// backdrop. Self-contained: reads the live instance from the hub
// store so cancel-on-close (parent unmounts the panel) doesn't need
// any extra wiring.

import React, { useMemo } from 'react';

import { getWidget } from '@/lib/hub/widget-registry';
import { useHubStore } from '@/lib/hub/hub-store';
import { useHubActions } from '@/lib/hub/use-hub-actions';
import type { WidgetCustomization, WidgetInstance } from '@/lib/hub/types';

export interface WidgetOptionsPanelProps {
  /** When true the panel renders. */
  open: boolean;
  /** The painted widget being edited. Null collapses the panel. */
  instanceId: string | null;
  onClose: () => void;
}

export default function WidgetOptionsPanel({
  open,
  instanceId,
  onClose,
}: WidgetOptionsPanelProps) {
  const draftWidgets = useHubStore((s) => s.draftWidgets);
  const { setDraftWidgets, patchWidgetCustomization } = useHubActions();

  const instance = useMemo<WidgetInstance | null>(() => {
    if (!instanceId || !draftWidgets) return null;
    return draftWidgets.find((w) => w.id === instanceId) ?? null;
  }, [draftWidgets, instanceId]);

  if (!open || !instance) return null;

  const definition = getWidget(instance.type);
  if (!definition) {
    return (
      <Backdrop onClose={onClose}>
        <div style={panelStyle} data-testid="widget-options-panel">
          <header style={headerStyle}>
            <h2 style={titleStyle}>Unknown widget</h2>
            <CloseButton onClose={onClose} />
          </header>
          <div style={bodyStyle}>
            <p style={emptyTextStyle}>
              This widget is no longer in the catalog. Remove it from
              your layout or pick a replacement.
            </p>
          </div>
        </div>
      </Backdrop>
    );
  }

  const customization = instance.customization ?? {};
  const titleOverride = customization.layout?.titleOverride ?? '';
  const headerColor = customization.style?.headerColor ?? '#ffffff';

  function commitSize(next: { w: number; h: number }) {
    if (!draftWidgets || !instance) return;
    const w = clamp(next.w, definition!.minSize.w, definition!.maxSize.w);
    const h = clamp(next.h, definition!.minSize.h, definition!.maxSize.h);
    if (w === instance.w && h === instance.h) return;
    setDraftWidgets(
      draftWidgets.map((row) =>
        row.id === instance.id ? { ...row, w, h } : row,
      ),
    );
  }

  function commitCustomization(patch: WidgetCustomization) {
    if (!instance) return;
    patchWidgetCustomization(instance.id, mergeCustomization(customization, patch));
  }

  const SettingsForm = definition.SettingsForm;
  const formValue = (customization.content
    ?? definition.defaultContent) as Record<string, unknown>;

  return (
    <Backdrop onClose={onClose}>
      <div
        style={panelStyle}
        data-testid="widget-options-panel"
        data-widget-id={instance.id}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header style={headerStyle}>
          <h2 style={titleStyle}>{definition.label} options</h2>
          <CloseButton onClose={onClose} />
        </header>
        <div style={bodyStyle}>
          {/* ── Size ────────────────────────────────────────────── */}
          <section
            style={sectionStyle}
            data-testid="widget-options-section-size"
          >
            <span style={sectionLabelStyle}>Size</span>
            <div style={stepperRowStyle}>
              <Stepper
                label="W"
                value={instance.w}
                min={definition.minSize.w}
                max={definition.maxSize.w}
                onChange={(w) => commitSize({ w, h: instance.h })}
                testId="widget-options-w"
              />
              <Stepper
                label="H"
                value={instance.h}
                min={definition.minSize.h}
                max={definition.maxSize.h}
                onChange={(h) => commitSize({ w: instance.w, h })}
                testId="widget-options-h"
              />
            </div>
            <div style={hintStyle}>
              Range {definition.minSize.w}×{definition.minSize.h} – {definition.maxSize.w}×{definition.maxSize.h}
            </div>
          </section>

          {/* ── Header color ──────────────────────────────────────── */}
          <section
            style={sectionStyle}
            data-testid="widget-options-section-header-color"
          >
            <span style={sectionLabelStyle}>Header color</span>
            <div style={stepperRowStyle}>
              <input
                type="color"
                value={headerColor}
                data-testid="widget-options-header-color"
                onChange={(e) => commitCustomization({ style: { headerColor: e.target.value } })}
                style={colorInputStyle}
                aria-label="Header color"
              />
              <button
                type="button"
                data-testid="widget-options-header-color-clear"
                onClick={() => commitCustomization({ style: { headerColor: undefined } })}
                style={textButtonStyle}
              >
                Reset
              </button>
            </div>
          </section>

          {/* ── Title ─────────────────────────────────────────────── */}
          <section
            style={sectionStyle}
            data-testid="widget-options-section-title"
          >
            <span style={sectionLabelStyle}>Title</span>
            <input
              type="text"
              value={titleOverride}
              data-testid="widget-options-title"
              placeholder={definition.label}
              onChange={(e) =>
                commitCustomization({ layout: { titleOverride: e.target.value } })
              }
              style={textInputStyle}
              aria-label="Widget title override"
            />
            <div style={hintStyle}>
              Falls back to the widget&apos;s default label when empty.
            </div>
          </section>

          {/* ── Widget-specific options (per the definition's
                SettingsForm — Slice 12 grows this for the ~13
                widgets that don't ship one). ───────────────────── */}
          <section
            style={sectionStyle}
            data-testid="widget-options-section-content"
          >
            <span style={sectionLabelStyle}>Widget options</span>
            {SettingsForm ? (
              <SettingsForm
                value={formValue}
                onChange={(next) =>
                  commitCustomization({ content: next as Record<string, unknown> })
                }
              />
            ) : (
              <p style={emptyTextStyle}>
                This widget doesn&apos;t have any extra options yet.
              </p>
            )}
          </section>
        </div>
      </div>
    </Backdrop>
  );
}

// ─── Shape helpers ─────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

/** Shallow-merge two customizations one level deep so a patch like
 *  `{ style: { headerColor } }` keeps any pre-existing `style.colorMode`
 *  field around (the Slice-5 normalizer + the Slice-6 reads ignore
 *  unknown fields anyway, but the round-trip stays clean). */
function mergeCustomization(
  current: WidgetCustomization,
  patch: WidgetCustomization,
): WidgetCustomization {
  return {
    ...current,
    layout: { ...current.layout, ...patch.layout },
    style: { ...current.style, ...patch.style },
    content: patch.content ?? current.content,
    interaction: { ...current.interaction, ...patch.interaction },
  };
}

// ─── UI helpers ────────────────────────────────────────────────────────

function Backdrop({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      style={backdropStyle}
      data-testid="widget-options-backdrop"
      onPointerDown={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
      role="presentation"
    >
      {children}
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close widget options"
      style={closeButtonStyle}
      data-testid="widget-options-close"
    >
      ✕
    </button>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  testId: string;
}) {
  return (
    <div style={stepperWrapStyle}>
      <span style={stepperLabelStyle}>{label}</span>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        style={stepperButtonStyle}
        data-testid={`${testId}-dec`}
      >
        −
      </button>
      <span style={stepperValueStyle} data-testid={`${testId}-value`}>{value}</span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        style={stepperButtonStyle}
        data-testid={`${testId}-inc`}
      >
        +
      </button>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 80,
};

const panelStyle: React.CSSProperties = {
  width: 'min(520px, 92vw)',
  maxHeight: '85vh',
  background: 'var(--theme-bg-surface)',
  color: 'var(--theme-fg-primary)',
  borderRadius: 10,
  boxShadow: '0 16px 48px rgba(0, 0, 0, 0.32)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderBottom: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-elevated)',
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1rem',
  fontWeight: 600,
};

const closeButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  fontSize: '1.1rem',
  cursor: 'pointer',
  color: 'var(--theme-fg-secondary)',
  padding: 4,
  lineHeight: 1,
};

const bodyStyle: React.CSSProperties = {
  padding: '12px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  overflow: 'auto',
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--theme-fg-secondary)',
};

const stepperRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
};

const stepperWrapStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

const stepperLabelStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 600,
  width: 14,
};

const stepperButtonStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-elevated)',
  color: 'var(--theme-fg-primary)',
  cursor: 'pointer',
  fontSize: '0.95rem',
  lineHeight: 1,
};

const stepperValueStyle: React.CSSProperties = {
  minWidth: 22,
  textAlign: 'center',
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 600,
};

const colorInputStyle: React.CSSProperties = {
  width: 64,
  height: 32,
  borderRadius: 6,
  border: '1px solid var(--theme-border)',
  padding: 2,
  cursor: 'pointer',
};

const textInputStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-elevated)',
  color: 'var(--theme-fg-primary)',
  fontSize: '0.9rem',
  width: '100%',
};

const textButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid var(--theme-border)',
  background: 'transparent',
  color: 'var(--theme-fg-secondary)',
  cursor: 'pointer',
  fontSize: '0.8rem',
};

const hintStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--theme-fg-muted, var(--theme-fg-secondary))',
};

const emptyTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.85rem',
  color: 'var(--theme-fg-secondary)',
};
