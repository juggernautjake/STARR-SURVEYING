// __tests__/i18n.test.ts — the passthrough (P10-6, audit G-3).
//
// There is no message catalogue anywhere in this repo, and the plan's argument for one is about TIMING:
// "retrofitting after another 100k lines is materially harder."
//
// So the thing worth testing is not that `t('Save') === 'Save'` — that is trivially true of any
// passthrough. It is that the design does not become the tax that makes people abandon i18n: natural keys,
// a fallback that reads correctly, named interpolation, and an honest account of what was not built.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { t, plural, setLocale, getLocale, DEFAULT_LOCALE, LOCALES, MESSAGES, I18N_STATUS } from '@/lib/i18n';
import { countVisibleText, countTranslated } from '@/scripts/scan-untranslated';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

afterEach(() => setLocale(DEFAULT_LOCALE));

describe('THE KEY IS THE ENGLISH STRING', () => {
  it('so the source locale needs no catalogue at all', () => {
    // Not "a lookup that happens to resolve" — there is genuinely nothing to look up. `MESSAGES` is empty
    // and correctly so: a catalogue for the source language is a map of every string to itself.
    expect(MESSAGES[DEFAULT_LOCALE]).toBeUndefined();
    expect(t('Save')).toBe('Save');
    expect(t('A hidden campaign hub — unlisted, reachable by direct link only.'))
      .toBe('A hidden campaign hub — unlisted, reachable by direct link only.');
  });

  it('and a MISSING translation falls back to text that reads correctly', () => {
    // The failure mode of a synthetic catalogue is `settings.buttons.save.label` rendered on a button.
    // The failure mode of this one is English, which is what the reader was getting anyway.
    MESSAGES.en = { Save: 'Save' };
    try {
      expect(t('Some string nobody translated')).toBe('Some string nobody translated');
      expect(t('Some string nobody translated')).not.toMatch(/^[a-z.]+$/);
    } finally {
      delete MESSAGES.en;
    }
  });

  it('a catalogue entry wins when there is one', () => {
    MESSAGES.en = { Save: 'Keep' };
    try {
      expect(t('Save')).toBe('Keep');
    } finally {
      delete MESSAGES.en;
    }
  });
});

describe('interpolation is NAMED', () => {
  it('substitutes by name', () => {
    expect(t('{count} characters', { count: 3 })).toBe('3 characters');
    expect(t('{who} rolled {total}', { who: 'Vex', total: 18 })).toBe('Vex rolled 18');
  });

  it('never positional', () => {
    // `{0}` and `{1}` are unreadable in the source, and a translator reordering a sentence — which is the
    // entire reason word order is a translation problem — has no way to know which is which.
    const src = read('lib/i18n/index.ts').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).toMatch(/\\\{\(\\w\+\)\\\}/);
  });

  it('AN UNKNOWN PLACEHOLDER IS LEFT ALONE, not blanked', () => {
    // `Hello {nmae}` rendering as `Hello {nmae}` is a typo somebody notices. Rendering as `Hello ` is a
    // typo that ships.
    expect(t('Hello {nmae}', { name: 'Vex' })).toBe('Hello {nmae}');
  });

  it('and a template with no vars is returned untouched', () => {
    expect(t('100% {literal}')).toBe('100% {literal}');
  });

  it('substitutes zero and empty string rather than treating them as absent', () => {
    expect(t('{count} left', { count: 0 })).toBe('0 left');
    expect(t('[{s}]', { s: '' })).toBe('[]');
  });
});

describe('plural is its own function, on purpose', () => {
  it('picks the form and passes the count through', () => {
    expect(plural(1, '{count} character', '{count} characters')).toBe('1 character');
    expect(plural(3, '{count} character', '{count} characters')).toBe('3 characters');
    expect(plural(0, '{count} character', '{count} characters')).toBe('0 characters');
  });

  it('and is a SEPARATE function from `t`, because plural rules are per-LANGUAGE', () => {
    // Polish has four forms, Japanese has one. Pretending `t('{n} items')` is translatable is how "1
    // items" reaches production — so the caller has to supply both forms and cannot avoid the question.
    // Asserted by CALLING it, not by matching the comment that explains it: this file has now written
    // that mistake enough times to know better.
    expect(typeof plural).toBe('function');
    expect(plural(1, 'one', 'many')).toBe('one');
    expect(plural(2, 'one', 'many')).toBe('many');
    // `t` alone cannot do it — one string in, one string out, no count anywhere.
    expect(t('{count} character', { count: 2 })).toBe('2 character');
  });
});

describe('locale switching exists but does nothing yet, and says so', () => {
  it('there is exactly one locale, and it is the source language', () => {
    expect(LOCALES).toEqual(['en']);
    expect(getLocale()).toBe('en');
  });

  it('an unknown locale falls back rather than breaking every string', () => {
    setLocale('fr' as never);
    expect(getLocale()).toBe(DEFAULT_LOCALE);
  });

  it('and the status is honest about what was NOT built', () => {
    // Every one of these is real work that is worthless until a second locale exists, which is the whole
    // reason this slice is a passthrough rather than an i18n system.
    expect(I18N_STATUS.translated).toBe(false);
    expect(I18N_STATUS.retrofitted).toBe(false);
    expect(I18N_STATUS.note).toMatch(/not retrofitted/i);
    expect(I18N_STATUS.note).toMatch(/browser-language detection/i);
    expect(I18N_STATUS.note).toMatch(/Intl/);
  });
});

describe('the sizing scan', () => {
  it('counts visible JSX text and skips the noise', () => {
    const src = `<div>Hello there</div><span>·</span><b>{value}</b><i>12</i>`;
    expect(countVisibleText(src)).toBe(1);
  });

  it('and counts what already goes through t()', () => {
    expect(countTranslated(`<p>{t('Save')}</p><p>{t("Cancel")}</p>`)).toBe(2);
  });

  it('IS A SIZING TOOL, NOT A GATE — nothing fails on it', () => {
    // The P10-2 ratchet exists because a hard-coded colour has a concrete cost today. An untranslated
    // string costs nothing until there is a translation to be missing, so this writes no baseline and
    // enforces nothing.
    // Comment-stripped, `//` lines included — the script's own header explains that it writes no
    // baseline, so a raw match finds the explanation rather than the code. Sixth time; the rule holds.
    const script = read('scripts/scan-untranslated.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(script).not.toMatch(/process\.exitCode/);
    expect(script).not.toMatch(/baseline/i);
    expect(script).not.toMatch(/\.writeFileSync/);
  });
});

describe('IT IS ACTUALLY USED — a passthrough nothing calls is a file, not a decision', () => {
  it('at least one real component renders through it', () => {
    const footer = read('app/dnd/_ui/DndFooter.tsx');
    expect(footer).toContain("from '@/lib/i18n'");
    expect(footer).toMatch(/\{t\('A hidden campaign hub/);
  });

  it('and the brand name is deliberately NOT wrapped', () => {
    // A proper noun stays itself in every language, and wrapping one invites a translator to render it.
    const footer = read('app/dnd/_ui/DndFooter.tsx');
    expect(footer).toMatch(/>Starr Tabletop</);
  });
});
