// __tests__/dnd/system-rules-entries.test.ts — the store entries are a faithful, in-system
// projection of the authoritative catalog (Phase V, system-grounding Slice 4).
import { describe, it, expect } from 'vitest';
import { systemRulesEntries } from '@/lib/dnd/system-rules-entries';
import { rulesForSystem } from '@/lib/dnd/system-rules';
import { GAME_SYSTEMS, SYSTEM_AMBIGUOUS } from '@/lib/dnd/systems';

describe('system rules → store entries (Slice 4)', () => {
  it('derives a real, well-formed entry set per system (and none for ambiguous)', () => {
    for (const s of GAME_SYSTEMS) {
      const entries = systemRulesEntries(s.key);
      const r = rulesForSystem(s.key)!;
      // Core facts + every class + species/skills/conditions/feats lists.
      expect(entries.length).toBeGreaterThanOrEqual(r.content.classes.length + 10);
      for (const e of entries) {
        expect(e.name.trim().length).toBeGreaterThan(0);
        expect((e.body ?? '').trim().length).toBeGreaterThan(0);
        expect(e.source).toBe(r.source);
        expect(['rule', 'class', 'species', 'condition', 'feat']).toContain(e.kind);
      }
      // One class entry per class, named exactly.
      const classNames = new Set(entries.filter((e) => e.kind === 'class').map((e) => e.name));
      for (const c of r.content.classes) expect(classNames.has(c.name), `${s.key} ${c.name}`).toBe(true);
    }
    expect(systemRulesEntries(SYSTEM_AMBIGUOUS)).toEqual([]);
    expect(systemRulesEntries('nonsense')).toEqual([]);
  });

  it('never leaks another system’s facts into an entry set', () => {
    const pf = systemRulesEntries('pathfinder2e');
    const pfClass = new Set(pf.filter((e) => e.kind === 'class').map((e) => e.name));
    expect(pfClass.has('Warlock')).toBe(false); // 5e-only
    expect(pfClass.has('Witch')).toBe(true);    // PF2
    const s14 = systemRulesEntries('dnd5e-2014');
    const s14Class = new Set(s14.filter((e) => e.kind === 'class').map((e) => e.name));
    expect(s14Class.has('Witch')).toBe(false);   // PF2-only
    expect(s14Class.has('Warlock')).toBe(true);  // 5e
  });
});
