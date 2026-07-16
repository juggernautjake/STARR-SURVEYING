// __tests__/dnd/interactive-sheet.test.ts — AI-generated interactive widgets are parsed,
// keyed safely, and bind to a customFields slot that persists (Phase V, Slice 11).
import { describe, it, expect } from 'vitest';
import { normalizeLayout, layoutHasInteractive, isInteractiveBlock, widgetKey } from '@/lib/dnd/custom-sheet';
import { normalizeCharacter, blankCharacter } from '@/app/dnd/_sheet/data/blank';

describe('interactive sheet widgets (Slice 11)', () => {
  it('parses field / counter / toggle widgets with safe keys', () => {
    const layout = normalizeLayout({
      blocks: [
        { type: 'field', key: 'Focus Points!', label: 'Focus', kind: 'number' },
        { type: 'counter', label: 'Ki', min: 0, max: 10 },
        { type: 'toggle', key: 'is_hidden', label: 'Hidden' },
        { type: 'text', text: 'not interactive' },
      ],
    });
    expect(layout.blocks).toHaveLength(4);
    const field = layout.blocks[0] as { type: string; key: string; kind: string };
    expect(field.type).toBe('field');
    expect(field.key).toBe('focus_points'); // slugged, punctuation dropped
    expect(field.kind).toBe('number');
    const counter = layout.blocks[1] as { key: string; min: number; max: number };
    expect(counter.key).toBe('ki'); // derived from label when no key
    expect(counter.max).toBe(10);
  });

  it('detects interactive layouts vs purely static ones', () => {
    expect(layoutHasInteractive({ blocks: [{ type: 'text', text: 'x' }] })).toBe(false);
    expect(layoutHasInteractive({ blocks: [{ type: 'toggle', label: 'On?' }] })).toBe(true);
    const b = normalizeLayout({ blocks: [{ type: 'counter', label: 'C' }] }).blocks[0];
    expect(isInteractiveBlock(b)).toBe(true);
  });

  it('widgetKey produces a stable, safe slot id', () => {
    expect(widgetKey('Rage Uses')).toBe('rage_uses');
    expect(widgetKey('  --weird--  ')).toBe('weird');
    expect(widgetKey('')).toBe('field');
  });

  it('a widget value round-trips through customFields and survives normalization', () => {
    const c = blankCharacter('Kael');
    c.customFields = { ...(c.customFields ?? {}), focus_points: 3, hidden: true, motto: 'Stand fast' };
    const norm = normalizeCharacter(JSON.parse(JSON.stringify(c)));
    expect(norm.customFields?.focus_points).toBe(3);
    expect(norm.customFields?.hidden).toBe(true);
    expect(norm.customFields?.motto).toBe('Stand fast');
  });

  it('normalization tolerates a junk customFields value', () => {
    const norm = normalizeCharacter({ ...blankCharacter('X'), customFields: 'nope' as unknown as Record<string, never> });
    expect(norm.customFields).toEqual({});
  });
});
