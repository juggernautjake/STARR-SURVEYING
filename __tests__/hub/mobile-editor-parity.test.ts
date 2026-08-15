// __tests__/hub/mobile-editor-parity.test.ts
//
// C0n of docs/planning/in-progress/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
//
// Owner: *"Please make sure the widget editing and control is fully fleshed out and complete on
// both pc and mobile."*
//
// ── THE FIVE CAPABILITIES, AND WHY HEIGHT WAS THE ONE MISSING ───────────────────────────────────
//
// A phone gets a different editor: `MobileEditor` replaces the desktop `GridEditor` entirely,
// because an 8-column drag-and-drop grid painter is unusable on a touch screen. Replacing a
// surface wholesale is exactly how a capability goes missing without anyone noticing — nothing
// errors, the sheet looks complete, and the only symptom is a thing you cannot do on a phone.
//
// Four were already there: reorder (dnd-kit vertical sortable with touch sensors), add, remove,
// and configure (`MobileWidgetSettings`, which reuses the same three resolution paths as desktop
// so the panels cannot drift). **Height was not.**
//
// Width legitimately has no phone equivalent — the stack is one column and `mobileSizeOverride`
// forces the rendered width to 2 for the bucket maths regardless. Height is different: it decides
// how much of a widget you actually see, and a phone-only user was stuck with whatever had been
// set at a desk.
//
// A source scan, so it proves the controls are wired, not that a thumb can hit them. C0o drives
// the sheet for real.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const editor = readFileSync(join(process.cwd(), 'lib/hub/components/MobileEditor.tsx'), 'utf8');
const settings = readFileSync(join(process.cwd(), 'lib/hub/components/MobileWidgetSettings.tsx'), 'utf8');
const css = readFileSync(join(process.cwd(), 'lib/hub/components/MobileEditor.css'), 'utf8');

describe('the phone editor can do everything the desktop one can', () => {
  it('reorders, with touch sensors rather than mouse-only drag', () => {
    expect(editor).toMatch(/TouchSensor/);
    expect(editor).toMatch(/arrayMove/);
  });

  it('adds and removes', () => {
    expect(editor).toMatch(/addWidget/);
    expect(editor).toMatch(/removeWidget/);
  });

  it('opens a widget’s own settings', () => {
    expect(editor).toMatch(/MobileWidgetSettings/);
  });

  it('resizes — the capability C0n added', () => {
    expect(editor).toMatch(/function resizeWidget/);
    expect(editor).toMatch(/Make \$\{label\} taller/);
    expect(editor).toMatch(/Make \$\{label\} shorter/);
  });

  it('saves and cancels through the shared store', () => {
    expect(editor).toMatch(/saveDraft/);
    expect(editor).toMatch(/cancelEdit/);
  });
});

describe('resizing on a phone cannot produce a layout the desktop would reject', () => {
  it('clamps to the widget definition’s own min and max height', () => {
    expect(editor).toMatch(/def\?\.minSize\.h/);
    expect(editor).toMatch(/def\?\.maxSize\.h/);
    expect(editor).toMatch(/Math\.max\(min, Math\.min\(max, requestedH\)\)/);
  });

  it('changes ONLY height — x, y and w are the desktop arrangement', () => {
    // The whole reason this sheet exists is that the desktop grid is not editable on a phone.
    // Moving x/y/w here would rearrange a layout the user cannot see to check.
    const fn = editor.match(/function resizeWidget[\s\S]*?\n  \}/)?.[0] ?? '';
    expect(fn).not.toBe('');
    expect(fn).toMatch(/\{ \.\.\.w, h \}/);
    expect(fn).not.toMatch(/\bw:\s/);
    expect(fn).not.toMatch(/\bx:\s/);
    expect(fn).not.toMatch(/\by:\s/);
  });

  it('writes through the same store action the desktop grid uses', () => {
    // Two write paths would let a phone edit and a desk edit disagree about what Save means.
    expect(editor).toMatch(/setDraftWidgets\(widgets\.map/);
  });
});

describe('the controls are reachable on a touch screen', () => {
  it('the height buttons clear the 28px interactive floor', () => {
    const block = css.match(/\.hub-msheet__height-btn\s*\{[\s\S]*?\}/)?.[0] ?? '';
    expect(block).toMatch(/width:\s*32px/);
    expect(block).toMatch(/height:\s*32px/);
  });

  it('a button at the limit is disabled and dimmed, not removed', () => {
    // A control that vanishes at the limit reads as a bug, and its absence gives no clue that a
    // limit is the reason.
    expect(editor).toMatch(/disabled=\{instance\.h <=/);
    expect(editor).toMatch(/disabled=\{instance\.h >=/);
    expect(css).toMatch(/\.hub-msheet__height-btn:disabled/);
  });

  it('the settings sheet reuses the desktop resolution paths rather than a parallel one', () => {
    expect(settings).toMatch(/getWidgetOptionsEntry/);
    expect(settings).toMatch(/SchemaOptionsForm/);
    expect(settings).toMatch(/patchWidgetCustomization/);
  });
});
