// __tests__/dnd/inline-feats.test.ts — writing a feat from inside a class draft (P6-12b).
//
// The split note named the whole problem: this creates a SECOND piece from inside an UNSAVED draft, so
// what happens to the feat if the class is never saved?
//
// **The feat shares the class's fate.** Held in the builder's state, created only after the class row
// exists. The alternative — write it immediately so it survives — is the easier implementation and is wrong
// in a way nobody would ever report: a Studio quietly accumulating orphan feats from every class draft
// somebody opened and closed.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  blankPendingFeat, validatePendingFeat, validatePendingFeats, pendingFeatBody, pendingFeatLevelRow,
  mergePendingFeatRows, featCategoryOptions, PENDING_FEAT_KIND, type PendingFeat,
} from '@/lib/dnd/homebrew/inline-feats';
import { fieldsForKind } from '@/lib/dnd/homebrew/kinds';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const feat = (over: Partial<PendingFeat> = {}): PendingFeat => ({
  ...blankPendingFeat('local-1', 3),
  name: 'Riposte',
  summary: 'React to a miss with a strike of your own.',
  description: 'When a creature misses you with a melee attack, you may use your reaction to attack it.',
  ...over,
});

describe('THE CATEGORY IS NOT GUESSED', () => {
  // The bug this file caught while being written. The first version hardcoded `category: 'class'` on the
  // reasoning that a feat authored in a class studio is obviously a class feat. The registry's options are
  // origin / general / fighting-style / epic-boon — no `class`. That would have failed the feat's own POST
  // AFTER the class row was already written, leaving a saved class referencing a feat that does not exist:
  // the exact failure the validator exists to prevent, arriving through the one door it could not see.
  it('the options come from the registry, not from a list written here', () => {
    const registry = (fieldsForKind('feat').find((f) => f.key === 'category')?.options ?? []).map((o) => o.value);
    expect(featCategoryOptions().map((o) => o.value)).toEqual(registry);
    expect(registry.length).toBeGreaterThan(0);
  });

  it('and "class" is NOT one of them', () => {
    expect(featCategoryOptions().map((o) => o.value)).not.toContain('class');
  });

  it('a blank feat defaults to a real option', () => {
    const allowed = new Set(featCategoryOptions().map((o) => o.value));
    expect(allowed.has(blankPendingFeat('x').category)).toBe(true);
  });

  it('and a category outside the registry is refused', () => {
    expect(validatePendingFeat(feat({ category: 'class' }))).toContain('"Riposte" needs a category.');
    expect(validatePendingFeat(feat({ category: '' }))).toHaveLength(1);
  });
});

describe('validation runs BEFORE the class is written', () => {
  it('a complete feat has no problems', () => {
    expect(validatePendingFeat(feat())).toEqual([]);
  });

  it('every field the feat SCHEMA requires is checked here', () => {
    // A pending feat missing one of these fails its own POST after the class exists, which reads as a
    // partial success and is the worst outcome available.
    const required = fieldsForKind('feat').filter((f) => f.required).map((f) => f.key);
    for (const key of required) {
      const broken = feat({ [key]: '' } as Partial<PendingFeat>);
      expect(validatePendingFeat(broken).length, `missing ${key} must be caught`).toBeGreaterThan(0);
    }
  });

  it('the level must be a real class level', () => {
    expect(validatePendingFeat(feat({ level: 0 }))).toHaveLength(1);
    expect(validatePendingFeat(feat({ level: 21 }))).toHaveLength(1);
    expect(validatePendingFeat(feat({ level: Number.NaN }))).toHaveLength(1);
    expect(validatePendingFeat(feat({ level: 20 }))).toEqual([]);
  });

  it('and two feats with the same name are refused', () => {
    // They would produce two indistinguishable pieces and an ambiguous level row.
    const problems = validatePendingFeats([feat({ id: 'a' }), feat({ id: 'b' })]);
    expect(problems.join(' ')).toMatch(/both called/);
  });

  it('problems are deduplicated across the list', () => {
    const p = validatePendingFeats([feat({ id: 'a', name: '' }), feat({ id: 'b', name: '' })]);
    expect(p.filter((x) => x === 'A feat written here needs a name.')).toHaveLength(1);
  });
});

describe('the pieces it produces', () => {
  it('the POST body is a feat, inheriting the CLASS’s system and visibility', () => {
    // A feat written inside a private draft must not be born public.
    const body = pendingFeatBody(feat(), { system: 'dnd5e-2024', visibility: 'private' });
    expect(body).toMatchObject({
      kind: PENDING_FEAT_KIND,
      system: 'dnd5e-2024',
      visibility: 'private',
      name: 'Riposte',
    });
  });

  it('and it trims, so a trailing space does not become part of the name', () => {
    const body = pendingFeatBody(feat({ name: '  Riposte  ' }), { system: 'any', visibility: 'private' });
    expect(body.name).toBe('Riposte');
  });

  it('THE LEVEL ROW IS WHAT MAKES IT "AVAILABLE AT CERTAIN LEVELS"', () => {
    // Without it the feature is decorative: a feat authored beside a class but never referenced by it is
    // just a feat that happens to have been typed in the same form.
    expect(pendingFeatLevelRow(feat())).toEqual({
      level: 3,
      name: 'Riposte',
      body: 'React to a miss with a strike of your own.',
      choice: '',
    });
  });

  it('and the row is NOT a choice — the class grants it, it does not ask', () => {
    // Marking it 'asi' or 'other' would make the level walker prompt for something already decided.
    expect(pendingFeatLevelRow(feat()).choice).toBe('');
  });
});

describe('merging into the levels list', () => {
  it('adds a row per feat, sorted by level', () => {
    const rows = mergePendingFeatRows([], [feat({ id: 'a', name: 'Late', level: 9 }), feat({ id: 'b', name: 'Early', level: 2 })]);
    expect(rows.map((r) => r.name)).toEqual(['Early', 'Late']);
  });

  it('REPLACES rather than duplicates when a feat is edited twice', () => {
    const first = mergePendingFeatRows([], [feat()]);
    const second = mergePendingFeatRows(first, [feat({ summary: 'Changed.' })], [feat()]);
    expect(second).toHaveLength(1);
    expect(second[0].body).toBe('Changed.');
  });

  it('renaming a feat moves its row rather than leaving the old one behind', () => {
    const first = mergePendingFeatRows([], [feat()]);
    const second = mergePendingFeatRows(first, [feat({ name: 'Parry' })], [feat()]);
    expect(second.map((r) => r.name)).toEqual(['Parry']);
  });

  it('and leaves the author’s own hand-written rows alone', () => {
    const mine = [{ level: 1, name: 'Second Wind', body: 'Heal yourself.', choice: '' }];
    const merged = mergePendingFeatRows(mine, [feat()]);
    expect(merged.map((r) => r.name)).toEqual(['Second Wind', 'Riposte']);
  });
});

describe('THE FEAT SHARES THE DRAFT’S FATE — the decision the split was about', () => {
  const builder = strip(read('app/dnd/_ui/ContentBuilder.tsx'));
  const editor = read('app/dnd/_ui/PendingFeatsEditor.tsx');

  it('pending feats live in builder STATE, not in the saved values', () => {
    // In `values` they would be a field of the class, which they are not — they are separate pieces
    // waiting on the class to exist.
    expect(builder).toContain('const [pendingFeats, setPendingFeats] = useState<PendingFeat[]>([]);');
  });

  it('nothing is POSTed until the class row exists', () => {
    const classPost = builder.indexOf("fetch('/api/dnd/homebrew', {");
    const featPost = builder.indexOf('pendingFeatBody(feat,');
    expect(classPost).toBeGreaterThan(-1);
    expect(featPost).toBeGreaterThan(classPost);
  });

  it('validation happens before the class POST, not after', () => {
    const validate = builder.indexOf('validatePendingFeats(pendingFeats)');
    const classPost = builder.indexOf("fetch('/api/dnd/homebrew', {");
    expect(validate).toBeGreaterThan(-1);
    expect(validate).toBeLessThan(classPost);
  });

  it('a failed feat does not claim the class failed', () => {
    // The class is safely stored; telling the author otherwise would have them redo work that is in the
    // database. Same rule as the image upload directly above it.
    expect(builder).toContain('The class saved, but these feats did not');
  });

  it('and the panel SAYS the feats are unsaved, rather than leaving it to be discovered', () => {
    expect(editor).toMatch(/Nothing is saved until you save/);
    expect(editor).toMatch(/close this without saving/i);
  });
});
