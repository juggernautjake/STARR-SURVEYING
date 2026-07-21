// __tests__/dnd/levelup.test.ts — you cannot level past a choice you haven't made.
//
// The rule: to reach level N, every choice at levels 1..N must be recorded — not just the choices
// at N. A character that skipped its level-4 ASI must resolve it before reaching 5, because later
// levels build on earlier ones.
import { describe, it, expect } from 'vitest';
import {
  planLevelUp,
  canLevelTo,
  nextChoice,
  recordChoice,
  applyAbilityChoices,
  expertiseSkills,
  chosenSubclassKey,
  validateChoice,
  type RecordedChoice,
} from '@/lib/dnd/classes/levelup';
import { buildCustomClass, type CustomClassDraft } from '@/lib/dnd/classes/custom';
import type { SubclassDefinition } from '@/lib/dnd/classes/types';

const DRAFT: CustomClassDraft = {
  name: 'Test Blade',
  system: 'dnd5e-2024',
  description: 'A test class.',
  hitDie: 10,
  primaryAbility: ['str'],
  savingThrows: ['str', 'con'],
  skillChoices: { count: 2, from: ['Athletics', 'Perception', 'Stealth', 'Survival'] },
  armorProficiencies: ['Light armor'],
  weaponProficiencies: ['Simple weapons'],
  subclassLevel: 3,
  subclassLabel: 'Blade Path',
  features: [
    { level: 1, name: 'Opening', body: 'A level 1 feature.' },
    { level: 2, name: 'Expertise', body: 'Pick two skills.', choice: 'expertise' },
    { level: 11, name: 'Capstone-ish', body: 'A late feature.' },
  ],
};

const DEF = buildCustomClass(DRAFT);

const SUBS: SubclassDefinition[] = [
  { key: 'path-a', name: 'Path A', classKey: DEF.key, system: 'dnd5e-2024', description: 'The first path.', features: [{ level: 3, name: 'A3', body: 'x' }, { level: 7, name: 'A7', body: 'y' }] },
  { key: 'path-b', name: 'Path B', classKey: DEF.key, system: 'dnd5e-2024', description: 'The second path.', features: [{ level: 3, name: 'B3', body: 'x' }] },
];

const PROFICIENT = ['Athletics', 'Perception', 'Stealth', 'Survival'];

describe('planLevelUp — the gate', () => {
  it('level 1 owes nothing when there are no level-1 choices', () => {
    const plan = planLevelUp(DEF, { from: 0, to: 1, recorded: [], subclasses: SUBS, proficientSkills: PROFICIENT });
    expect(plan.ready).toBe(true);
    expect(plan.outstanding).toEqual([]);
  });

  it('reaching level 2 owes the Expertise choice', () => {
    const plan = planLevelUp(DEF, { from: 1, to: 2, recorded: [], subclasses: SUBS, proficientSkills: PROFICIENT });
    expect(plan.ready).toBe(false);
    expect(nextChoice(plan)!.kind).toBe('expertise');
    expect(nextChoice(plan)!.pick).toBe(2);
    expect(nextChoice(plan)!.from).toEqual(PROFICIENT);
  });

  it('reaching level 3 offers the subclass options — including homebrew ones', () => {
    const plan = planLevelUp(DEF, { from: 2, to: 3, recorded: [], subclasses: SUBS, proficientSkills: PROFICIENT });
    const sub = plan.outstanding.find((c) => c.kind === 'subclass')!;
    expect(sub.options?.map((o) => o.key)).toEqual(['path-a', 'path-b']);
  });

  it('OWES EARLIER CHOICES TOO — skipping level 4 blocks level 5', () => {
    // Everything done except the level-4 ASI.
    const recorded: RecordedChoice[] = [
      { level: 2, kind: 'expertise', skills: ['Athletics', 'Stealth'] },
      { level: 3, kind: 'subclass', value: 'path-a' },
    ];
    const plan = planLevelUp(DEF, { from: 4, to: 5, recorded, subclasses: SUBS, proficientSkills: PROFICIENT });
    expect(plan.ready).toBe(false);
    expect(nextChoice(plan)!.level).toBe(4);
    expect(nextChoice(plan)!.kind).toBe('asi');
  });

  it('is ready once every choice up to the target is recorded', () => {
    const recorded: RecordedChoice[] = [
      { level: 2, kind: 'expertise', skills: ['Athletics', 'Stealth'] },
      { level: 3, kind: 'subclass', value: 'path-a' },
      { level: 4, kind: 'asi', abilities: ['str', 'con'] },
    ];
    const plan = planLevelUp(DEF, { from: 4, to: 5, recorded, subclasses: SUBS, proficientSkills: PROFICIENT });
    expect(plan.ready).toBe(true);
  });

  it('a HALF-MADE choice does not count as made', () => {
    // An ASI record with no feat and only one ability is incomplete.
    const recorded: RecordedChoice[] = [
      { level: 2, kind: 'expertise', skills: ['Athletics', 'Stealth'] },
      { level: 3, kind: 'subclass', value: 'path-a' },
      { level: 4, kind: 'asi', abilities: ['str'] },
    ];
    const plan = planLevelUp(DEF, { from: 4, to: 5, recorded, subclasses: SUBS, proficientSkills: PROFICIENT });
    expect(plan.ready).toBe(false);
    expect(nextChoice(plan)!.level).toBe(4);
  });

  it('an EMPTY subclass record does not count as made', () => {
    const recorded: RecordedChoice[] = [
      { level: 2, kind: 'expertise', skills: ['Athletics', 'Stealth'] },
      { level: 3, kind: 'subclass', value: '' }, // recorded, but nothing chosen
    ];
    const plan = planLevelUp(DEF, { from: 2, to: 3, recorded, subclasses: SUBS, proficientSkills: PROFICIENT });
    expect(plan.ready).toBe(false);
    expect(nextChoice(plan)!.kind).toBe('subclass');
  });

  it('an expertise record with an empty skill list does not count as made', () => {
    const plan = planLevelUp(DEF, { from: 1, to: 2, recorded: [{ level: 2, kind: 'expertise', skills: [] }], subclasses: SUBS, proficientSkills: PROFICIENT });
    expect(plan.ready).toBe(false);
  });

  it('an ASI satisfied by a FEAT counts as made', () => {
    const recorded: RecordedChoice[] = [
      { level: 2, kind: 'expertise', skills: ['Athletics', 'Stealth'] },
      { level: 3, kind: 'subclass', value: 'path-a' },
      { level: 4, kind: 'asi', featKey: 'tough' },
    ];
    expect(planLevelUp(DEF, { from: 4, to: 5, recorded, subclasses: SUBS, proficientSkills: PROFICIENT }).ready).toBe(true);
  });

  it('lists the features gained across the levels being taken', () => {
    const plan = planLevelUp(DEF, { from: 10, to: 11, recorded: [], subclasses: SUBS, proficientSkills: PROFICIENT });
    expect(plan.gained.map((f) => f.name)).toContain('Capstone-ish');
    expect(plan.gained.map((f) => f.name)).not.toContain('Opening'); // level 1, already had it
  });

  it('includes the chosen subclass’s own later features in what is gained', () => {
    const plan = planLevelUp(DEF, { from: 6, to: 7, recorded: [], subclasses: SUBS, subclass: SUBS[0], proficientSkills: PROFICIENT });
    expect(plan.gained.map((f) => f.name)).toContain('A7');
  });

  it('Expertise builds on itself — a skill already taken is not offered again', () => {
    const wide = buildCustomClass({
      ...DRAFT,
      name: 'Double Expert',
      features: [...DRAFT.features, { level: 6, name: 'More Expertise', body: 'Two more.', choice: 'expertise' }],
    });
    const recorded: RecordedChoice[] = [{ level: 2, kind: 'expertise', skills: ['Athletics', 'Stealth'] }];
    const plan = planLevelUp(wide, { from: 5, to: 6, recorded, subclasses: SUBS, proficientSkills: PROFICIENT });
    const second = plan.outstanding.find((c) => c.kind === 'expertise' && c.level === 6)!;
    expect(second.from).toEqual(['Perception', 'Survival']); // the two already taken are gone
  });
});

describe('canLevelTo — what the sheet’s level control asks', () => {
  it('blocks and reports the first thing owed', () => {
    const r = canLevelTo(DEF, { from: 2, to: 3, recorded: [], subclasses: SUBS, proficientSkills: PROFICIENT });
    expect(r.allowed).toBe(false);
    expect(r.blockedBy!.kind).toBe('expertise'); // level 2 comes before the level 3 subclass
    expect(r.blockedBy!.level).toBe(2);
  });

  it('allows when nothing is owed', () => {
    const recorded: RecordedChoice[] = [
      { level: 2, kind: 'expertise', skills: ['Athletics', 'Stealth'] },
      { level: 3, kind: 'subclass', value: 'path-a' },
    ];
    expect(canLevelTo(DEF, { from: 2, to: 3, recorded, subclasses: SUBS, proficientSkills: PROFICIENT }).allowed).toBe(true);
  });
});

describe('recording + replaying choices', () => {
  it('recordChoice replaces the same level+kind rather than duplicating', () => {
    let rec: RecordedChoice[] = [];
    rec = recordChoice(rec, { level: 3, kind: 'subclass', value: 'path-a' });
    rec = recordChoice(rec, { level: 3, kind: 'subclass', value: 'path-b' });
    expect(rec.length).toBe(1);
    expect(chosenSubclassKey(rec)).toBe('path-b');
  });

  it('ability increases stack across levels and cap at 20', () => {
    const base = { str: 17, dex: 12, con: 14, int: 8, wis: 10, cha: 10 } as const;
    const rec: RecordedChoice[] = [
      { level: 4, kind: 'asi', abilities: ['str', 'str'] }, // 17 → 19
      { level: 8, kind: 'asi', abilities: ['str', 'con'] }, // str 19 → 20, con 14 → 15
      { level: 12, kind: 'asi', abilities: ['str', 'str'] }, // capped at 20
    ];
    const out = applyAbilityChoices({ ...base }, rec);
    expect(out.str).toBe(20);
    expect(out.con).toBe(15);
  });

  it('an ASI taken as a feat grants no ability increase', () => {
    const base = { str: 16, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } as const;
    const out = applyAbilityChoices({ ...base }, [{ level: 4, kind: 'asi', featKey: 'tough', abilities: ['str', 'str'] }]);
    expect(out.str).toBe(16); // the feat wins; the abilities field is ignored
  });

  it('expertiseSkills collects across every level, de-duped', () => {
    const rec: RecordedChoice[] = [
      { level: 2, kind: 'expertise', skills: ['Athletics', 'Stealth'] },
      { level: 6, kind: 'expertise', skills: ['Perception'] },
    ];
    expect(expertiseSkills(rec).sort()).toEqual(['Athletics', 'Perception', 'Stealth']);
  });
});

describe('validateChoice', () => {
  const abilities = { str: 19, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } as const;
  // `system` is REQUIRED on the context since 14-S6b — the feat rules differ by edition, so the
  // compiler makes every call site say which one it means rather than inheriting 2024 by default.
  const D2024 = { system: 'dnd5e-2024' };

  it('requires exactly two points of ability increase', () => {
    expect(validateChoice({ level: 4, kind: 'asi', abilities: ['str'] }, D2024).ok).toBe(false);
    expect(validateChoice({ level: 4, kind: 'asi', abilities: ['str', 'con'] }, D2024).ok).toBe(true);
  });

  it('refuses an increase that would exceed 20', () => {
    const r = validateChoice({ level: 4, kind: 'asi', abilities: ['str', 'str'] }, { ...D2024, abilities: { ...abilities } });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/exceed the maximum of 20/);
  });

  it('allows a General feat at an ASI slot, but rejects an Origin feat there', () => {
    // A General feat is what an ASI slot may grant (level 4+ met).
    expect(validateChoice({ level: 4, kind: 'asi', featKey: 'resilient' }, D2024).ok).toBe(true);
    // 'lucky' is an ORIGIN feat — it comes from a Background, not an ASI. Rules-legal builders reject it.
    const bad = validateChoice({ level: 4, kind: 'asi', featKey: 'lucky' }, D2024);
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/Origin feat/);
  });

  it('enforces a feat\'s own prerequisites (ability, level) at the ASI slot', () => {
    // Grappler needs STR 13. A STR-8 character can't take it...
    expect(validateChoice({ level: 4, kind: 'asi', featKey: 'grappler' }, { ...D2024, abilities: { ...abilities, str: 8 } }).ok).toBe(false);
    // ...but the STR-19 fixture can.
    expect(validateChoice({ level: 4, kind: 'asi', featKey: 'grappler' }, { ...D2024, abilities: { ...abilities } }).ok).toBe(true);
  });

  it('treats an unknown feat key as custom/homebrew and allows it (the escape hatch)', () => {
    expect(validateChoice({ level: 4, kind: 'asi', featKey: 'my-homebrew-feat' }, D2024).ok).toBe(true);
  });

  it('refuses duplicate or non-proficient expertise', () => {
    expect(validateChoice({ level: 2, kind: 'expertise', skills: ['Athletics', 'Athletics'] }, D2024).ok).toBe(false);
    const r = validateChoice({ level: 2, kind: 'expertise', skills: ['Arcana'] }, { ...D2024, legalSkills: PROFICIENT });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/proficient in Arcana/);
  });

  it('refuses an option that is not on the list', () => {
    const r = validateChoice({ level: 3, kind: 'subclass', value: 'not-real' }, { ...D2024, legalOptions: ['path-a', 'path-b'] });
    expect(r.ok).toBe(false);
  });
});
