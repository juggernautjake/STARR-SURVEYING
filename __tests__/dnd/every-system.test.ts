// __tests__/dnd/every-system.test.ts — every sheet skin renders for every game system
// without crashing, and NPC-relevant controls are system-agnostic (Phase V, Slice 10).
//
// The engine's tabs iterate a set of arrays/objects on the Character; the `system` is a
// DB column, not part of the sheet data, so a normalized character is structurally
// system-agnostic. This proves the "every sheet works with every system, no broken tabs"
// property at the data layer (a live render check needs the app).
import { describe, it, expect } from 'vitest';
import { GAME_SYSTEMS, SYSTEM_AMBIGUOUS } from '@/lib/dnd/systems';
import { blankCharacter, normalizeCharacter } from '@/app/dnd/_sheet/data/blank';
import { SHEET_REGISTRY, getSheetConfig } from '@/app/dnd/_sheet/registry';
import { SHEET_STYLES } from '@/lib/dnd/sheet-styles';

// The fields the sheet tabs iterate — all must be present (arrays/objects) after
// normalization so no tab throws `undefined.map`.
const TAB_ARRAYS = ['attacks', 'forms', 'inventory', 'progression', 'resources', 'customSkills', 'features'] as const;

describe('every sheet works with every system (Slice 10)', () => {
  const systems = [SYSTEM_AMBIGUOUS, ...GAME_SYSTEMS.map((s) => s.key)];

  it('a normalized character is crash-safe regardless of system', () => {
    for (const sys of systems) {
      // The character data shape is identical across systems (system rides a DB column).
      const c = normalizeCharacter({ ...blankCharacter(`Test ${sys}`), meta: { name: 'X', level: 3 } });
      for (const key of TAB_ARRAYS) {
        expect(Array.isArray((c as unknown as Record<string, unknown>)[key]), `${key} for ${sys}`).toBe(true);
      }
      expect(c.meta).toBeTruthy();
      expect(c.abilities).toBeTruthy();
      expect(c.combat).toBeTruthy();
    }
  });

  it('every registry skin resolves a valid config (no dead modules)', () => {
    for (const key of Object.keys(SHEET_REGISTRY)) {
      const cfg = getSheetConfig(key);
      expect(cfg.label).toBeTruthy();
      expect(Array.isArray(cfg.modules)).toBe(true);
    }
  });

  it('every pickable style is available to any character (incl. NPCs)', () => {
    // NPC parity: the style browser lists these for anyone with write access, so a DM can
    // set any of them on an NPC. Each pickable style maps to a real registry config.
    for (const s of SHEET_STYLES) {
      expect(SHEET_REGISTRY[s.id === 'default' ? 'default' : s.id]).toBeTruthy();
    }
  });
});
