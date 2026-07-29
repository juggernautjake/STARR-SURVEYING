// lib/i18n/index.ts — the passthrough (P10-6, audit G-3).
//
// There is no message catalogue anywhere in this repo, and the plan's argument for building one *now* is
// about timing rather than need: **retrofitting after another 100k lines is materially harder.** So this is
// the smallest thing that is not ceremony.
//
// THE KEY IS THE ENGLISH STRING. That single decision is what keeps a passthrough honest:
//
//   · `t('Save')` returns `'Save'` today, with no catalogue, no config and no build step. The default
//     locale is not a lookup that happens to resolve — there is genuinely nothing to look up.
//   · Nobody has to invent `settings.buttons.save.label`. A synthetic key is a second name for a string
//     that already has one, it drifts from the text it names, and it is the tax that makes teams give up
//     on i18n a month in.
//   · A missing translation falls back to the key, which READS CORRECTLY. The failure mode of a synthetic
//     catalogue is `settings.buttons.save.label` rendered on a button; the failure mode of this one is
//     English, which is what the reader was getting anyway.
//   · Adding a locale is adding one map. Nothing else in the app changes.
//
// WHAT THIS DELIBERATELY IS NOT: a retrofit. The ~3,000 user-facing strings already in `app/` stay as they
// are. `npm run scan:untranslated` reports how many there are so the number is known rather than guessed —
// see the note at the foot of this file about what that number means.
//
// It is also not a locale NEGOTIATOR. Detecting a browser language, persisting a preference and switching
// server-rendered output are real work, and every bit of it is wasted until a second locale exists. The
// hook is `setLocale`; the day someone adds `es`, that is where the wiring goes.

/** Locales with a catalogue. `en` is the source language and never has one — its keys are its values. */
export const LOCALES = ['en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/**
 * `locale → (English string → translation)`.
 *
 * Empty, and correctly so: `en` is the source language, so a catalogue for it would be a map of every
 * string to itself. A locale appears here when someone translates one.
 */
export const MESSAGES: Partial<Record<Locale, Record<string, string>>> = {};

let current: Locale = DEFAULT_LOCALE;

/** Swap locale. Exported so the day a second one exists there is one place to call, not a search. */
export function setLocale(locale: Locale): void {
  current = LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
}

export function getLocale(): Locale {
  return current;
}

/**
 * Translate, and interpolate `{named}` placeholders.
 *
 * ```ts
 * t('Save')                                   // 'Save'
 * t('{count} characters', { count: 3 })       // '3 characters'
 * ```
 *
 * Interpolation is NAMED, never positional. `{0}` and `{1}` are unreadable in the source, and worse, a
 * translator reordering a sentence — which is the entire reason word order is a translation problem — has
 * no way to know which is which.
 *
 * An unknown placeholder is left ALONE rather than blanked. `Hello {nmae}` rendering as `Hello {nmae}` is a
 * typo somebody notices; rendering as `Hello ` is a typo that ships.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const table = MESSAGES[current];
  const template = (table && table[key]) || key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    (Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole));
}

/**
 * Plural form. English only until a locale that needs more forms exists.
 *
 * Separate from `t` because plural rules are a per-language problem, not a per-string one — Polish has
 * four forms, Japanese has one — and pretending `t('{n} items')` is translatable is how you end up with
 * "1 items" in production.
 */
export function plural(count: number, one: string, other: string, vars?: Record<string, string | number>): string {
  return t(count === 1 ? one : other, { count, ...vars });
}

/**
 * What the passthrough does NOT do, recorded next to it.
 *
 * Every entry here is real work that is *worthless until a second locale exists*, which is the whole
 * reason this slice is a passthrough rather than an i18n system.
 */
export const I18N_STATUS = {
  locales: LOCALES.length,
  /** True when a locale other than the source language has a catalogue. */
  translated: false,
  retrofitted: false,
  note:
    'A passthrough with natural (English-string) keys. New user-facing strings should go through `t()`; '
    + 'the ~3,000 existing ones are NOT retrofitted, and `npm run scan:untranslated` reports the count so '
    + 'the size of that job is known rather than guessed. Not built, because none of it does anything '
    + 'until a second locale exists: browser-language detection, a persisted preference, server-side '
    + 'locale negotiation, RTL layout, and date/number formatting (use `Intl` directly for those today).',
} as const;
