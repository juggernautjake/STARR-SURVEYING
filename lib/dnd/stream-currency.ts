// lib/dnd/stream-currency.ts — the streamer-chat currency + super chats (Phase R).
//
// Chat runs on a made-up currency, **NeoNuggets** 🪙. Viewers (and the DM) "super chat"
// NeoNuggets with a message; each super chat pins a highlighted card in the feed showing
// the message + the NeoNugget amount, and adds to the streamer's running stash. The stash
// converts to **notes**, the campaign's base currency (≈ $1 each): 10,000 NeoNuggets = 1
// note. Pure so it's unit-tested + shared by the overlay, the control panel, and the
// donation/convert endpoints.

export const CHAT_CURRENCY = { name: 'NeoNuggets', one: 'NeoNugget', symbol: '🪙', code: 'NN' } as const;

// Conversion: 10,000 NeoNuggets = 1 note (the base currency; a note ≈ $1). A "standard"
// super chat is one note (10,000 NeoNuggets).
export const NUGGETS_PER_NOTE = 10_000;

/** Whole notes a NeoNugget stash converts to (remainder NeoNuggets stay in the stash). */
export function nuggetsToNotes(nuggets: number): number {
  return Math.floor(Math.max(0, Math.floor(nuggets || 0)) / NUGGETS_PER_NOTE);
}
/** NeoNuggets left over after converting to whole notes. */
export function nuggetsRemainder(nuggets: number): number {
  return Math.max(0, Math.floor(nuggets || 0)) % NUGGETS_PER_NOTE;
}
/** Notes → NeoNuggets (for showing a super chat's "worth" in note terms). */
export function notesToNuggets(notes: number): number {
  return Math.max(0, Math.round(notes || 0)) * NUGGETS_PER_NOTE;
}

// Super chat tiers by NeoNugget amount — colour-banded like a real super chat. The tier
// sets the highlight colour + how long it "pins" (bigger = longer). Scaled so one note
// (10,000) is a normal super chat and the big tiers are many notes.
export interface SuperTier { min: number; label: string; color: string; pinMs: number }
export const SUPER_TIERS: readonly SuperTier[] = [
  { min: 1, label: 'Blue', color: '#2b7fff', pinMs: 0 },
  { min: 10_000, label: 'Teal', color: '#00b8a3', pinMs: 8_000 },     // 1 note
  { min: 30_000, label: 'Green', color: '#3fbf5f', pinMs: 15_000 },   // 3 notes
  { min: 100_000, label: 'Gold', color: '#ffca28', pinMs: 30_000 },   // 10 notes
  { min: 300_000, label: 'Orange', color: '#fb8c00', pinMs: 60_000 }, // 30 notes
  { min: 1_000_000, label: 'Magenta', color: '#ff10a0', pinMs: 120_000 }, // 100 notes
  { min: 5_000_000, label: 'Red', color: '#e53935', pinMs: 300_000 }, // 500 notes
];

/** The tier a NeoNugget amount lands in (defaults to the lowest for anything ≥ 1). */
export function superTier(nuggets: number): SuperTier {
  const k = Math.max(1, Math.floor(nuggets || 0));
  let tier = SUPER_TIERS[0];
  for (const t of SUPER_TIERS) if (k >= t.min) tier = t;
  return tier;
}

// DM-set generosity — how freely AMBIENT chat throws NeoNuggets. 'off' (the default) means
// NO donations at all until the DM turns them on. Each level sets a rough donations/min
// and the average + spread of a donation's size (in NeoNuggets).
export type Generosity = 'off' | 'stingy' | 'normal' | 'generous' | 'overgiving';
export interface GenerosityCfg { label: string; perMin: number; avg: number; spread: number; superChance: number }
export const GENEROSITY: Record<Generosity, GenerosityCfg> = {
  off:        { label: 'Off',        perMin: 0,   avg: 0,        spread: 0,       superChance: 0 },
  stingy:     { label: 'Stingy',     perMin: 0.5, avg: 1_500,    spread: 2_000,   superChance: 0.05 },
  normal:     { label: 'Normal',     perMin: 2,   avg: 6_000,    spread: 12_000,  superChance: 0.15 },
  generous:   { label: 'Generous',   perMin: 6,   avg: 25_000,   spread: 60_000,  superChance: 0.3 },
  overgiving: { label: 'Overgiving', perMin: 18,  avg: 120_000,  spread: 400_000, superChance: 0.55 },
};
export const GENEROSITY_LEVELS: Generosity[] = ['off', 'stingy', 'normal', 'generous', 'overgiving'];

/** Roll one ambient donation amount for a generosity level. `rnd`/`rnd2` are caller
 *  randoms in [0,1) so this stays pure/testable. Returns a positive integer NeoNugget
 *  amount (never below 1 when donations are on); 'off' always returns 0. */
export function rollDonationAmount(gen: Generosity, rnd: number, rnd2: number): number {
  const cfg = GENEROSITY[gen] ?? GENEROSITY.off;
  if (cfg.avg <= 0) return 0;
  // Skewed toward small with an occasional whale (superChance → a big multiplier).
  const base = cfg.avg * (0.3 + rnd * 1.4);
  const whale = rnd2 < cfg.superChance ? 3 + rnd * (cfg.spread / Math.max(1, cfg.avg)) : 1;
  return Math.max(1, Math.round(base * whale));
}

/** Format a NeoNugget amount compactly (1.2K, 3.4M …) with the 🪙 symbol. */
export function formatNuggets(n: number): string {
  const v = Math.max(0, Math.floor(n || 0));
  const s = v >= 1e9 ? (v / 1e9).toFixed(1) + 'B'
    : v >= 1e6 ? (v / 1e6).toFixed(1) + 'M'
    : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K'
    : String(v);
  return `${CHAT_CURRENCY.symbol} ${s.replace('.0', '')}`;
}
