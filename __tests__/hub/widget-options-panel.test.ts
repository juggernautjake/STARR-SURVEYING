// __tests__/hub/widget-options-panel.test.ts
//
// Slice 11 of employee-hub-overhaul-2026-05-30.md. Locks the
// per-widget options surface: the four documented sections (Size /
// Header color / Title / SettingsForm host), the size-stepper clamp
// against the definition envelope, the customization commit shape,
// and the GridEditor wiring (Options button + panel mount). Source-
// regex tests because the panel reads zustand state (SSR-snapshot
// caching limitation applies).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PANEL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'WidgetOptionsPanel.tsx'),
  'utf8',
);

const GRID_EDITOR = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'GridEditor.tsx'),
  'utf8',
);

describe('Slice 11 — WidgetOptionsPanel: four sections', () => {
  it('renders the Size section', () => {
    expect(PANEL).toMatch(/data-testid="widget-options-section-size"/);
  });

  it('renders the Header-color section', () => {
    expect(PANEL).toMatch(/data-testid="widget-options-section-header-color"/);
  });

  it('renders the Title section', () => {
    expect(PANEL).toMatch(/data-testid="widget-options-section-title"/);
  });

  it('renders the Widget-options (SettingsForm host) section', () => {
    expect(PANEL).toMatch(/data-testid="widget-options-section-content"/);
  });
});

describe('Slice 11 — Size steppers clamp against the definition envelope', () => {
  it('reads min/max from the widget definition for both axes', () => {
    expect(PANEL).toMatch(/min=\{definition\.minSize\.w\}/);
    expect(PANEL).toMatch(/max=\{definition\.maxSize\.w\}/);
    expect(PANEL).toMatch(/min=\{definition\.minSize\.h\}/);
    expect(PANEL).toMatch(/max=\{definition\.maxSize\.h\}/);
  });

  it('commits size via setDraftWidgets (NOT patchWidgetCustomization)', () => {
    // Size lives on the WidgetInstance, not the customization bag.
    expect(PANEL).toMatch(
      /function commitSize\([\s\S]*?\) \{[\s\S]*?setDraftWidgets\([\s\S]*?row\.id === instance\.id \? \{ \.\.\.row, w, h \} : row[\s\S]*?\}/,
    );
  });

  it('clamps the w/h before committing so out-of-envelope inputs are safe', () => {
    expect(PANEL).toMatch(
      /const w = clamp\(next\.w, definition!\.minSize\.w, definition!\.maxSize\.w\);/,
    );
    expect(PANEL).toMatch(
      /const h = clamp\(next\.h, definition!\.minSize\.h, definition!\.maxSize\.h\);/,
    );
  });

  it('no-ops when w and h are unchanged', () => {
    expect(PANEL).toMatch(/if \(w === instance\.w && h === instance\.h\) return;/);
  });
});

describe('Slice 11 — Header color → customization.style.headerColor', () => {
  it('the color input writes via commitCustomization with { style: { headerColor } }', () => {
    expect(PANEL).toMatch(
      /onChange=\{\(e\) => commitCustomization\(\{ style: \{ headerColor: e\.target\.value \} \}\)\}/,
    );
  });

  it('the Reset button clears headerColor (undefined)', () => {
    expect(PANEL).toMatch(
      /onClick=\{\(\) => commitCustomization\(\{ style: \{ headerColor: undefined \} \}\)\}/,
    );
  });
});

describe('Slice 11 — Title → customization.layout.titleOverride', () => {
  it('the title input writes via commitCustomization with { layout: { titleOverride } }', () => {
    expect(PANEL).toMatch(
      /onChange=\{\(e\) =>\s*commitCustomization\(\{ layout: \{ titleOverride: e\.target\.value \} \}\)/,
    );
  });

  it('defaults the placeholder to the widget definition label', () => {
    expect(PANEL).toMatch(/placeholder=\{definition\.label\}/);
  });
});

describe('Slice 11 — Hosts the widget definition SettingsForm', () => {
  it('renders <SettingsForm value={formValue} onChange={…content…}/> when defined', () => {
    expect(PANEL).toMatch(/const SettingsForm = definition\.SettingsForm;/);
    expect(PANEL).toMatch(
      /<SettingsForm[\s\S]*?value=\{formValue\}[\s\S]*?onChange=\{\(next\) =>[\s\S]*?commitCustomization\(\{ content: next as Record<string, unknown> \}\)/,
    );
  });

  it('falls back to a friendly empty state when the widget has no SettingsForm', () => {
    expect(PANEL).toMatch(/This widget doesn&apos;t have any extra options yet\./);
  });

  it('reads the form value from customization.content with a defaultContent fallback', () => {
    expect(PANEL).toMatch(
      /const formValue = \(customization\.content\s*\?\?\s*definition\.defaultContent\) as Record<string, unknown>;/,
    );
  });
});

describe('Slice 11 — commitCustomization shallow-merges so unrelated fields survive', () => {
  it('the merge keeps current layout/style/interaction values alongside the patch', () => {
    expect(PANEL).toMatch(
      /function mergeCustomization\([\s\S]*?\{\s*\.\.\.current,[\s\S]*?layout: \{ \.\.\.current\.layout, \.\.\.patch\.layout \},[\s\S]*?style: \{ \.\.\.current\.style, \.\.\.patch\.style \},[\s\S]*?content: patch\.content \?\? current\.content,[\s\S]*?interaction: \{ \.\.\.current\.interaction, \.\.\.patch\.interaction \},[\s\S]*?\}/,
    );
  });

  it('commits through patchWidgetCustomization from useHubActions', () => {
    expect(PANEL).toMatch(
      /const \{ setDraftWidgets, patchWidgetCustomization \} = useHubActions\(\);/,
    );
    expect(PANEL).toMatch(
      /patchWidgetCustomization\(instance\.id, mergeCustomization\(customization, patch\)\);/,
    );
  });
});

describe('Slice 11 — Backdrop close + accessibility', () => {
  it('clicking the backdrop calls onClose', () => {
    expect(PANEL).toMatch(/onPointerDown=\{onClose\}/);
  });

  it('Escape on the backdrop calls onClose (preventDefault + handler)', () => {
    expect(PANEL).toMatch(
      /if \(e\.key === 'Escape'\) \{[\s\S]*?e\.preventDefault\(\);[\s\S]*?onClose\(\);/,
    );
  });

  it('the panel itself stops backdrop clicks via stopPropagation', () => {
    expect(PANEL).toMatch(/onPointerDown=\{\(e\) => e\.stopPropagation\(\)\}/);
  });
});

describe('Slice 11 — GridEditor wiring', () => {
  it('imports WidgetOptionsPanel', () => {
    expect(GRID_EDITOR).toMatch(/import WidgetOptionsPanel from '\.\/WidgetOptionsPanel';/);
  });

  it('declares an optionsForId useState', () => {
    expect(GRID_EDITOR).toMatch(
      /const \[optionsForId, setOptionsForId\] = useState<string \| null>\(null\);/,
    );
  });

  it('renders an ⚙ Options button on the selected painted widget', () => {
    expect(GRID_EDITOR).toMatch(/data-testid="grid-editor-placed-options"/);
  });

  it('clicking the Options button sets optionsForId to that widget id', () => {
    expect(GRID_EDITOR).toMatch(
      /data-testid="grid-editor-placed-options"[\s\S]*?onClick=\{\(e\) => \{[\s\S]*?setOptionsForId\(inst\.id\);[\s\S]*?\}/,
    );
  });

  it('mounts WidgetOptionsPanel with open={optionsForId !== null}', () => {
    expect(GRID_EDITOR).toMatch(
      /<WidgetOptionsPanel[\s\S]*?open=\{optionsForId !== null\}[\s\S]*?instanceId=\{optionsForId\}[\s\S]*?onClose=\{\(\) => setOptionsForId\(null\)\}/,
    );
  });
});
