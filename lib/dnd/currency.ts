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

/** The starting currency set for a system's sheet (5e/2014/2024 → 5e coins, PF2 → PF2 coins, else 5e). */
export function defaultCurrencies(system?: string | null): Currency[] {
  const clone = (list: Currency[]) => list.map((c) => ({ ...c }));
  if (system === 'pathfinder2e') return clone(DEFAULT_CURRENCIES_PF2);
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
