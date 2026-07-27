// __tests__/hub/settings-panel-removal.test.ts
//
// Slice 17 of employee-hub-overhaul-2026-05-30.md (executing the
// Slice 4 cleanup, which was sequenced after Slice 11 moved
// per-widget options into the modal). Locks the removal of the
// SettingsPanel side rail + its supporting tabs / pickers /
// helpers so a future regression can't quietly resurrect them.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.join(__dirname, '..', '..');

const REMOVED_PATHS = [
  'lib/hub/components/SettingsPanel.tsx',
  'lib/hub/components/SettingsTabs.tsx',
  'lib/hub/components/settings/LayoutTab.tsx',
  'lib/hub/components/settings/StyleTab.tsx',
  'lib/hub/components/settings/InteractionTab.tsx',
  'lib/hub/components/settings/SizeGridPicker.tsx',
  'lib/hub/components/settings/CustomColorPicker.tsx',
  'lib/hub/components/settings/components/FilterDropdown.tsx',
  'lib/hub/components/settings/components/MultiSelect.tsx',
  'lib/hub/components/settings/components/NumberStepper.tsx',
  'lib/hub/components/settings/components/RoutePicker.tsx',
  'lib/hub/components/settings/components/ToggleGroup.tsx',
  'lib/hub/widget-color-modes.ts',
];

describe('Slice 17 — SettingsPanel surface is fully removed', () => {
  // ⚑ ANCHOR ADDED 2026-07-27 (slice 75). Every assertion below is `existsSync(...) === false`, which
  // passes for a path that is merely WRONG as readily as for one that is genuinely gone. If REPO_ROOT
  // ever resolved incorrectly, all ten would pass while guarding nothing — the shape slice 74 found in
  // `no-orphan-modules.test.ts`. It was anchored only by accident: a later describe in this file does a
  // `readFileSync` that would throw. Depending on a different block for your anchor is fragile, since
  // deleting that block silently turns this one vacuous. So the anchor is now local and explicit.
  it('REPO_ROOT actually points at the repository', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'package.json')), 'REPO_ROOT is wrong').toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, 'lib/hub/components')), 'hub components moved').toBe(true);
  });

  for (const rel of REMOVED_PATHS) {
    it(`${rel} no longer exists`, () => {
      expect(fs.existsSync(path.join(REPO_ROOT, rel))).toBe(false);
    });
  }
});

describe('Slice 17 — HubCanvas no longer mounts the SettingsPanel', () => {
  const SRC = fs.readFileSync(
    path.join(REPO_ROOT, 'lib', 'hub', 'components', 'HubCanvas.tsx'),
    'utf8',
  );

  it('the SettingsPanel import is gone', () => {
    expect(SRC).not.toMatch(/import SettingsPanel from/);
  });

  it('no <SettingsPanel/> mount remains', () => {
    expect(SRC).not.toMatch(/<SettingsPanel/);
  });

  it('the now-dead settingsId useState is gone', () => {
    expect(SRC).not.toMatch(/settingsId/);
    expect(SRC).not.toMatch(/setSettingsId/);
  });

  it('the now-dead handleGridClick delegation is gone', () => {
    expect(SRC).not.toMatch(/handleGridClick/);
  });

  it('WidgetGrid renders directly without the click-delegation wrapper', () => {
    expect(SRC).toMatch(/<WidgetGrid widgets=\{displayWidgets\}\s*\/>/);
  });
});

describe('Slice 17 — the GridEditor modal is the only mounted editor', () => {
  const SRC = fs.readFileSync(
    path.join(REPO_ROOT, 'lib', 'hub', 'components', 'HubCanvas.tsx'),
    'utf8',
  );

  it('GridEditor still mounts with open={isEditMode}', () => {
    expect(SRC).toMatch(/<GridEditor[\s\S]*?open=\{isEditMode\}/);
  });
});
