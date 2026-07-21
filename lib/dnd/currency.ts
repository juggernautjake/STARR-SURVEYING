// lib/dnd/currency.ts — a flexible, system-agnostic money model for the character sheet.
//
// The legacy sheet stored money as a FIXED three-key object (credits/harmonyte/scrip). Players wanted
// to define their OWN currencies (rename the coins, add "Guild Marks"), see how much they're worth in
// total, and set + read conversion rates between them. So money is a LIST of named currencies, each with
// an amount and a `rate` = how many BASE units one unit is worth. The base currency has rate 1; every
// other rate is relative to it, which makes cross-conversion a single ratio. Pure + data-only, so the
// sheet UI and the AI sheet-edit vocabulary share one source of truth for the math.

export interface Currency {
  id: string;
  /** Display name, e.g. "Gold", "Guild Marks". */
  name: string;
  /** Optional short symbol/abbreviation, e.g. "gp". */
  abbrev?: string;
  /** How many of this currency the character holds. */
  amount: number;
  /** Value of ONE unit in BASE units. The base currency is rate 1; a coin worth 10× the base is 10. */
  rate: number;
}

/** Standard D&D 5e coins, valued in copper (cp) as the base unit. */
export const DEFAULT_CURRENCIES_5E: Currency[] = [
  { id: 'cp', name: 'Copper', abbrev: 'cp', amount: 0, rate: 1 },
  { id: 'sp', name: 'Silver', abbrev: 'sp', amount: 0, rate: 10 },
  { id: 'ep', name: 'Electrum', abbrev: 'ep', amount: 0, rate: 50 },
  { id: 'gp', name: 'Gold', abbrev: 'gp', amount: 0, rate: 100 },
  { id: 'pp', name: 'Platinum', abbrev: 'pp', amount: 0, rate: 1000 },
];

/** Pathfinder 2e coins (no electrum), valued in copper. */
export const DEFAULT_CURRENCIES_PF2: Currency[] = [
  { id: 'cp', name: 'Copper', abbrev: 'cp', amount: 0, rate: 1 },
  { id: 'sp', name: 'Silver', abbrev: 'sp', amount: 0, rate: 10 },
  { id: 'gp', name: 'Gold', abbrev: 'gp', amount: 0, rate: 100 },
  { id: 'pp', name: 'Platinum', abbrev: 'pp', amount: 0, rate: 1000 },
];

/**
 * Intuitive Games coins. Transcribed from IG_CURRENCY in systems/intuitive-games/items.ts —
 * "10 Pennies (silver) = 1 Coin; 2 Coins = 1 Solidas (gold)" — with the Penny as the base unit, so
 * a Coin is 10 and a Solidas is 20. IG's own equipment prices are quoted in Solidas (an
 * Adventurer's Pack is 8), which is the check that these rates are the right way up.
 */
export const DEFAULT_CURRENCIES_IG: Currency[] = [
  { id: 'penny', name: 'Penny', abbrev: 'p', amount: 0, rate: 1 },
  { id: 'coin', name: 'Coin', abbrev: 'c', amount: 0, rate: 10 },
  { id: 'solidas', name: 'Solidas', abbrev: 's', amount: 0, rate: 20 },
];

/**
 * The starting currency set for a system's sheet.
 *
 * Each system that has its OWN authored money gets an explicit case; the 5e arm is the fallback
 * because 2014 and 2024 genuinely share those coins. Intuitive Games gained a case on 2026-07-21
 * (CX-17 B4): it has always had its own three-coin currency, but fell through to the 5e default,
 * so every IG sheet started with Gold, Platinum and — worst of the three — Electrum, a coin that
 * exists in no edition of IG.
 */
export function defaultCurrencies(system?: string | null): Currency[] {
  const clone = (list: Currency[]) => list.map((c) => ({ ...c }));
  if (system === 'pathfinder2e') return clone(DEFAULT_CURRENCIES_PF2);
  if (system === 'intuitive-games') return clone(DEFAULT_CURRENCIES_IG);
  return clone(DEFAULT_CURRENCIES_5E);
}

const isFiniteNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** The base currency = the lowest positive rate (rate 1 by convention). Falls back to the first entry. */
export function baseCurrency(currencies: Currency[]): Currency | null {
  if (!currencies.length) return null;
  const positive = currencies.filter((c) => isFiniteNum(c.rate) && c.rate > 0);
  if (!positive.length) return currencies[0];
  return positive.reduce((lo, c) => (c.rate < lo.rate ? c : lo), positive[0]);
}

/** Total wealth expressed in BASE units: Σ amount × rate. */
export function totalInBase(currencies: Currency[]): number {
  return currencies.reduce((sum, c) => sum + (isFiniteNum(c.amount) ? c.amount : 0) * (isFiniteNum(c.rate) && c.rate > 0 ? c.rate : 0), 0);
}

/** Convert an amount from one currency to another via their rates: amount × fromRate / toRate. */
export function convert(amount: number, fromRate: number, toRate: number): number {
  if (!isFiniteNum(amount) || !isFiniteNum(fromRate) || !isFiniteNum(toRate) || toRate <= 0) return 0;
  return (amount * fromRate) / toRate;
}

/** How many units of `to` one unit of `from` is worth (fromRate / toRate). The readable "1 gp = 10 sp". */
export function exchangeRate(from: Currency, to: Currency): number {
  return convert(1, from.rate, to.rate);
}

/** Total wealth converted into a chosen currency (default: the base). */
export function totalIn(currencies: Currency[], target?: Currency): number {
  const base = totalInBase(currencies);
  const t = target ?? baseCurrency(currencies);
  if (!t || !isFiniteNum(t.rate) || t.rate <= 0) return base;
  return base / t.rate;
}

/** A readable conversion table: for each currency, its rate against every other. Used for the sheet's
 *  "conversion rates" view so the player can always see what converts to what. */
export interface ConversionRow { from: Currency; rates: { to: Currency; rate: number }[] }
export function conversionTable(currencies: Currency[]): ConversionRow[] {
  return currencies.map((from) => ({
    from,
    rates: currencies.filter((to) => to.id !== from.id).map((to) => ({ to, rate: exchangeRate(from, to) })),
  }));
}

/** Round a converted value for display: whole numbers stay whole; fractional shows up to 2 decimals. */
export function fmtAmount(n: number): string {
  if (!isFiniteNum(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

// ── Notes: the streamer's payout currency ───────────────────────────────────
// NeoNuggets convert into "notes" (the campaign's base currency, ≈ $1 each). The convert
// route used to write them onto the LEGACY fixed-key `currency.credits`, but a sheet that has
// migrated to the flexible `currencies` list renders that list INSTEAD — so the notes landed
// in a field nothing displayed and the payout looked broken (owner report 2026-07-19).
// These helpers put the money wherever the sheet is actually reading from.

/** The id used for the notes currency when we have to create it. */
export const NOTES_CURRENCY_ID = 'notes';

/** The character's notes currency, matched by id or name (case-insensitive), or null. */
export function findNotesCurrency(currencies: Currency[] | undefined): Currency | null {
  if (!currencies?.length) return null;
  return (
    currencies.find((c) => c.id.toLowerCase() === NOTES_CURRENCY_ID) ??
    currencies.find((c) => c.name.trim().toLowerCase() === 'notes') ??
    null
  );
}

/** How many notes the character holds, reading the flexible list first and falling back to the
 *  legacy `currency.credits`. One answer, so the stream bar and the sheet can't disagree. */
export function readNotes(
  currencies: Currency[] | undefined,
  legacyCredits?: number | null,
): number {
  const note = findNotesCurrency(currencies);
  if (note) return Math.max(0, Math.floor(note.amount || 0));
  return Math.max(0, Math.floor(Number(legacyCredits ?? 0)));
}

/** Set the character's notes to an exact amount, returning the updated list. Creates the notes
 *  currency if the sheet has a `currencies` list but no notes entry yet — it enters at the BASE
 *  rate, because notes are the campaign's base currency. Returns null when the sheet has no
 *  flexible list at all, so the caller knows to write the legacy field instead. */
export function writeNotes(currencies: Currency[] | undefined, amount: number): Currency[] | null {
  if (!currencies) return null;
  const next = Math.max(0, Math.floor(amount || 0));
  const existing = findNotesCurrency(currencies);
  if (existing) return currencies.map((c) => (c.id === existing.id ? { ...c, amount: next } : c));
  return [...currencies, { id: NOTES_CURRENCY_ID, name: 'Notes', abbrev: 'n', amount: next, rate: 1 }];
}
