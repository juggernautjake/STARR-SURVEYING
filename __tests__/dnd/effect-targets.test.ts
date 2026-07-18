// __tests__/dnd/effect-targets.test.ts — the effect vocabulary (Slice 10 / Appendix A).
//
// This registry is a contract: the builder picker, the AI tool schema, the ledger and the star
// tooltips are all generated from it. These tests protect the properties that make that safe.
import { describe, it, expect } from 'vitest';
import {
  EFFECT_TARGETS,
  findTarget,
  targetsInGroup,
  isOperationAllowed,
  validateEffect,
  describeEffect,
  TARGET_GROUP_LABELS,
  type TargetGroup,
} from '@/lib/dnd/effects/targets';
import { EFFECT_OPERATIONS } from '@/app/dnd/_sheet/engine/effects';

describe('the registry is well-formed', () => {
  it('has no duplicate keys', () => {
    const keys = EFFECT_TARGETS.map((t) => t.key);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it('every target declares at least one operation', () => {
    const bad = EFFECT_TARGETS.filter((t) => t.ops.length === 0);
    expect(bad.map((t) => t.key)).toEqual([]);
  });

  it('every target belongs to a labelled group', () => {
    for (const t of EFFECT_TARGETS) {
      expect(TARGET_GROUP_LABELS[t.group], `${t.key} has group "${t.group}"`).toBeTruthy();
    }
  });

  // The lesson of this whole codebase: a complete effects engine sits unread because nothing
  // renders it. A target with no home on the sheet is a LIE — the player is told they can burrow
  // and nothing anywhere mentions it. So every target must name where it appears.
  it('every target names where it renders', () => {
    const homeless = EFFECT_TARGETS.filter((t) => !t.rendersAt?.trim());
    expect(homeless.map((t) => t.key), 'these can be granted but appear nowhere').toEqual([]);
  });

  it('every group in the union is actually populated', () => {
    const groups = Object.keys(TARGET_GROUP_LABELS) as TargetGroup[];
    for (const g of groups) {
      expect(targetsInGroup(g).length, `group "${g}" is empty`).toBeGreaterThan(0);
    }
  });
});

describe('the vocabulary covers what was actually asked for', () => {
  // Named explicitly in the request. Each is a target, not an approximation of one.
  it.each([
    ['speed_fly', 'a potion that grants flight'],
    ['speed_burrow', 'a "tunneling speed"'],
    ['grant_sense', 'darkvision from an item'],
    ['grant_feature', 'a pendant granting an ability from another class'],
    ['name', 'an item that changes your name'],
    ['image', 'an item that changes your portrait'],
    ['gender', 'an item that changes your gender'],
    ['profession', 'an item that changes your profession'],
    ['species', 'an item that changes your race'],
    ['class', 'an item that changes your class'],
    ['size', 'an item that changes your size'],
    ['transform', 'a spell that turns you into a bear'],
    ['heal', 'a healing potion'],
    ['proficiency', 'a potion granting proficiency'],
    ['ac', 'armour'],
    ['vulnerability', 'a cursed item with a real downside'],
  ])('%s exists (%s)', (key) => {
    expect(findTarget(key), `${key} must be in the registry`).toBeTruthy();
  });

  it('movement is modelled per-mode, not as one number', () => {
    // A potion of flying is not "+30 speed". A fly speed can exist while walk is 0.
    for (const k of ['speed_walk', 'speed_fly', 'speed_swim', 'speed_climb', 'speed_burrow']) {
      expect(findTarget(k)).toBeTruthy();
    }
  });

  it('keeps the engine\'s existing target names — no parallel vocabulary', () => {
    // apply.ts already resolves these exact strings. Inventing new names here and translating
    // between them would be two sources of truth wearing a trench coat.
    expect(findTarget('dex_saves')).toBeTruthy();
    expect(findTarget('all_saves')).toBeTruthy();
    expect(findTarget('all_skills')).toBeTruthy();
    expect(findTarget('skill.stealth')).toBeTruthy();
    expect(findTarget('spell_save_dc')).toBeTruthy();
  });

  it('offers an honest escape hatch for what it cannot model', () => {
    // An unmodellable effect must be labelled as such, never faked with an authoritative-looking
    // number. This target existing is what makes "never invent a rule" achievable here.
    const note = findTarget('note');
    expect(note).toBeTruthy();
    expect(note!.group).toBe('meta');
  });
});

describe('negative values are first-class (a curse is not a special case)', () => {
  it('numeric targets allow negatives by default', () => {
    expect(validateEffect({ target: 'ability_str', operation: 'add', value: -2 })).toBeNull();
    expect(validateEffect({ target: 'ac', operation: 'add', value: -1 })).toBeNull();
    expect(validateEffect({ target: 'all_saves', operation: 'add', value: -1 })).toBeNull();
  });

  it('describes a penalty as a penalty', () => {
    expect(describeEffect({ target: 'ability_dex', operation: 'add', value: -2 })).toContain('-2');
  });
});

describe('validation refuses rather than coerces', () => {
  it('rejects an unknown target, and says where to look', () => {
    // Silently dropping this is the worst outcome: the player equips the item, believes it works,
    // and plays a character that isn't real.
    const err = validateEffect({ target: 'make_me_win', operation: 'add', value: 1 });
    expect(err).not.toBeNull();
    expect(err!.reason).toMatch(/Unknown effect target/);
    expect(err!.reason).toMatch(/targets\.ts/);
  });

  it('rejects an operation the target does not support', () => {
    // You cannot have "advantage on max HP".
    const err = validateEffect({ target: 'hp_max', operation: 'advantage' });
    expect(err).not.toBeNull();
    expect(err!.reason).toMatch(/not valid/);
    expect(isOperationAllowed('hp_max', 'advantage')).toBe(false);
    expect(isOperationAllowed('hp_max', 'add')).toBe(true);
  });

  it('EVERY target enforces its OWN ops allowlist — the gate is not just spot-checked on hp_max', () => {
    // The check above proves one target refuses one bad op. This proves the gate holds across the WHOLE
    // registry: for every target, an operation it does NOT list is refused by both isOperationAllowed and
    // validateEffect (kept in lockstep). So a target authored with the wrong ops — or a validateEffect
    // regression that only bites some targets — fails here instead of silently accepting a nonsense effect
    // (e.g. "resistance on Strength"). EFFECT_OPERATIONS is the exhaustive roster, so a newly-added
    // operation is swept automatically without touching this test.
    for (const t of EFFECT_TARGETS) {
      const forbidden = EFFECT_OPERATIONS.filter((op) => !t.ops.includes(op));
      expect(forbidden.length, `${t.key} lists every operation — is that really intended?`).toBeGreaterThan(0);
      for (const op of forbidden) {
        expect(isOperationAllowed(t.key, op), `${t.key} should forbid "${op}"`).toBe(false);
        expect(
          validateEffect({ target: t.key, operation: op, value: 1 }),
          `${t.key} must refuse "${op}" (allowed: ${t.ops.join(', ')})`,
        ).not.toBeNull();
      }
    }
  });

  it('rejects a numeric target given a non-number', () => {
    expect(validateEffect({ target: 'ability_str', operation: 'add', value: 'lots' })).not.toBeNull();
    expect(validateEffect({ target: 'ability_str', operation: 'add', value: NaN })).not.toBeNull();
  });

  it('rejects a value-carrying target given nothing', () => {
    expect(validateEffect({ target: 'resistance', operation: 'resistance', value: '' })).not.toBeNull();
    expect(validateEffect({ target: 'resistance', operation: 'resistance', value: 'fire' })).toBeNull();
  });

  it('accepts advantage with no value', () => {
    expect(validateEffect({ target: 'skill.stealth', operation: 'advantage' })).toBeNull();
  });
});

describe('describeEffect is the single renderer for effect prose', () => {
  // The builder preview, the Active Effects panel and the star tooltip all call this. Three
  // renderers would eventually describe the same effect three different ways.
  it('renders each operation in plain English', () => {
    expect(describeEffect({ target: 'ability_str', operation: 'add', value: 2 })).toBe('+2 STR');
    expect(describeEffect({ target: 'ability_str', operation: 'set', value: 29 })).toBe('STR set to 29');
    expect(describeEffect({ target: 'skill.stealth', operation: 'disadvantage' })).toMatch(/Disadvantage on/);
    expect(describeEffect({ target: 'resistance', operation: 'resistance', value: 'fire' })).toBe('Resistance: fire');
    expect(describeEffect({ target: 'proficiency', operation: 'grant_proficiency', value: 'longswords' })).toBe('Proficiency: longswords');
  });

  it('surfaces the gating condition, which changes what the line MEANS', () => {
    expect(describeEffect({ target: 'speed_walk', operation: 'add', value: 10, condition: 'raging' })).toContain('while raging');
  });
});
