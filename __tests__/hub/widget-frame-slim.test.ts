// __tests__/hub/widget-frame-slim.test.ts
//
// Slice 6 of employee-hub-overhaul-2026-05-30.md. Locks the slimmed
// WidgetFrame contract: the legacy customization-style props
// (colorMode/statusTint/customBg/customFg/borderRadius/shadowDepth)
// + the resolveColors() helper are gone from the file. Only headerColor
// + headerAction + footer + editMode remain. WidgetGrid + SettingsPanel
// no longer forward the dropped props. Source-regex assertions on the
// three live files since the React render path hits the zustand/SSR
// snapshot-caching limitation.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FRAME_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'WidgetFrame.tsx'),
  'utf8',
);

const GRID_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'WidgetGrid.tsx'),
  'utf8',
);

const PANEL_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'SettingsPanel.tsx'),
  'utf8',
);

describe('Slice 6 — WidgetFrameProps: the slim contract', () => {
  it('drops colorMode / statusTint / customBg / customFg / borderRadius / shadowDepth from the props interface', () => {
    const propsMatch = FRAME_SRC.match(/export interface WidgetFrameProps \{[\s\S]*?\n\}/);
    expect(propsMatch).not.toBeNull();
    const props = propsMatch![0];
    expect(props).not.toMatch(/colorMode\?:/);
    expect(props).not.toMatch(/statusTint\?:/);
    expect(props).not.toMatch(/customBg\?:/);
    expect(props).not.toMatch(/customFg\?:/);
    expect(props).not.toMatch(/borderRadius\?:/);
    expect(props).not.toMatch(/shadowDepth\?:/);
  });

  it('keeps the slim props: title + headerColor + headerAction + footer + editMode', () => {
    const propsMatch = FRAME_SRC.match(/export interface WidgetFrameProps \{[\s\S]*?\n\}/);
    const props = propsMatch![0];
    expect(props).toMatch(/title: string;/);
    expect(props).toMatch(/headerColor\?:\s*string;/);
    expect(props).toMatch(/headerAction\?:\s*ReactNode;/);
    expect(props).toMatch(/footer\?:\s*ReactNode;/);
    expect(props).toMatch(/editMode\?:\s*boolean;/);
  });
});

describe('Slice 6 — WidgetFrame.tsx file surface', () => {
  it('drops the resolveColors helper entirely', () => {
    expect(FRAME_SRC).not.toMatch(/function resolveColors/);
    expect(FRAME_SRC).not.toMatch(/export function resolveColors/);
    expect(FRAME_SRC).not.toMatch(/resolveColors\(/);
  });

  it('drops the RADIUS_PX + SHADOWS color-mode maps', () => {
    expect(FRAME_SRC).not.toMatch(/const RADIUS_PX/);
    expect(FRAME_SRC).not.toMatch(/const SHADOWS/);
  });

  it('no longer imports the WidgetColorMode / WidgetStatusTint / WidgetBorderRadius / WidgetShadowDepth types', () => {
    expect(FRAME_SRC).not.toMatch(/WidgetColorMode/);
    expect(FRAME_SRC).not.toMatch(/WidgetStatusTint/);
    expect(FRAME_SRC).not.toMatch(/WidgetBorderRadius/);
    expect(FRAME_SRC).not.toMatch(/WidgetShadowDepth/);
  });

  it('uses fixed theme-driven frame chrome (no per-widget overrides)', () => {
    expect(FRAME_SRC).toMatch(/background:\s*'var\(--theme-bg-surface\)'/);
    expect(FRAME_SRC).toMatch(/color:\s*'var\(--theme-fg-primary\)'/);
  });
});

describe('Slice 6 — WidgetGrid no longer forwards the legacy style props', () => {
  it('only forwards title + headerColor to WidgetFrame for known widgets', () => {
    const knownBlock = GRID_SRC.match(/<WidgetFrame\s+title=\{title\}[\s\S]*?\/?>/);
    expect(knownBlock).not.toBeNull();
    const block = knownBlock![0];
    expect(block).toMatch(/headerColor=\{customization\.style\?\.headerColor\}/);
    expect(block).not.toMatch(/colorMode=/);
    expect(block).not.toMatch(/statusTint=/);
    expect(block).not.toMatch(/customBg=/);
    expect(block).not.toMatch(/customFg=/);
    expect(block).not.toMatch(/borderRadius=\{customization/);
    expect(block).not.toMatch(/shadowDepth=/);
  });

  it('unknown-widget cell drops the warning-tint chrome and uses a fg-color text instead', () => {
    expect(GRID_SRC).not.toMatch(/<WidgetFrame\s+title=\{`Unknown widget[\s\S]*?colorMode=/);
    expect(GRID_SRC).toMatch(/Unknown widget:[\s\S]*?--theme-warning/);
  });
});

describe('Slice 6 — SettingsPanel preview drops the legacy props', () => {
  it('preview WidgetFrame call now only forwards title + headerColor', () => {
    const preview = PANEL_SRC.match(/<WidgetFrame title=\{title\}[\s\S]*?>/);
    expect(preview).not.toBeNull();
    const block = preview![0];
    expect(block).toMatch(/headerColor=\{customization\.style\?\.headerColor\}/);
    expect(block).not.toMatch(/colorMode=/);
    expect(block).not.toMatch(/statusTint=/);
    expect(block).not.toMatch(/customBg=/);
    expect(block).not.toMatch(/customFg=/);
    expect(block).not.toMatch(/borderRadius=\{customization/);
    expect(block).not.toMatch(/shadowDepth=/);
  });

  it('unknown-widget preview no longer paints with colorMode="status" statusTint="warning"', () => {
    expect(PANEL_SRC).not.toMatch(/<WidgetFrame[\s\S]{0,200}colorMode="status"/);
  });
});
