// lib/dnd/stream-currency.ts — the streamer-chat currency + donations (Phase R).
//
// Chat runs on a silly made-up currency, **Kibbles** 🐟 (the cat-girl streamer's chat
// throws fish at her). Viewers "superchat" and "donate" Kibbles; the DM can convert a
// character's earned Kibbles into real game gold. Donations are OFF by default — the DM
// turns them on and picks how generous chat is. Pure so it's unit-tested + shared by the
// overlay, the control panel, and the donation endpoint.

export const CHAT_CURRENCY = { name: 'Kibbles', one: 'Kibble', symbol: '🐟', code: 'KIB' } as const;

// Conversion: 100 Kibbles = 1 gold piece. Silly but round; the DM converts a stash of
// chat Kibbles into usable game gold.
export const KIBBLES_PER_GOLD = 100;

/** Whole gold pieces a Kibble stash converts to (remainder Kibbles stay in chat). */
export function kibblesToGold(kibbles: number): number {
  return Math.floor(Math.max(0, Math.floor(kibbles || 0)) / KIBBLES_PER_GOLD);
}
/** Kibbles left over after converting to whole gold. */
export function kibblesRemainder(kibbles: number): number {
  return Math.max(0, Math.floor(kibbles || 0)) % KIBBLES_PER_GOLD;
}
/** Gold → Kibbles (for showing a superchat's "worth" in game terms). */
export function goldToKibbles(gold: number): number {
  return Math.max(0, Math.round(gold || 0)) * KIBBLES_PER_GOLD;
}

// Superchat tiers by Kibble amount — colour-banded like a real superchat. The tier sets
// the highlight colour + how long it "pins" (bigger = longer).
export interface SuperTier { min: number; label: string; color: string; pinMs: number }
export const SUPER_TIERS: readonly SuperTier[] = [
  { min: 1, label: 'Blue', color: '#2b7fff', pinMs: 0 },
  { min: 50, label: 'Teal', color: '#00b8a3', pinMs: 8_000 },
  { min: 200, label: 'Green', color: '#3fbf5f', pinMs: 15_000 },
  { min: 500, label: 'Gold', color: '#ffca28', pinMs: 30_000 },
  { min: 1_000, label: 'Orange', color: '#fb8c00', pinMs: 60_000 },
  { min: 5_000, label: 'Magenta', color: '#ff10a0', pinMs: 120_000 },
  { min: 20_000, label: 'Red', color: '#e53935', pinMs: 300_000 },
];

/** The tier a Kibble amount lands in (defaults to the lowest for anything ≥ 1). */
export function superTier(kibbles: number): SuperTier {
  const k = Math.max(1, Math.floor(kibbles || 0));
  let tier = SUPER_TIERS[0];
  for (const t of SUPER_TIERS) if (k >= t.min) tier = t;
  return tier;
}

// DM-set generosity — how freely AMBIENT chat throws Kibbles. 'off' (the default) means
// NO donations at all until the DM turns them on. Each level sets a rough donations/min
// and the average + spread of a donation's size.
export type Generosity = 'off' | 'stingy' | 'normal' | 'generous' | 'overgiving';
export interface GenerosityCfg { label: string; perMin: number; avg: number; spread: number; superChance: number }
export const GENEROSITY: Record<Generosity, GenerosityCfg> = {
  off:        { label: 'Off',        perMin: 0,   avg: 0,     spread: 0,     superChance: 0 },
  stingy:     { label: 'Stingy',     perMin: 0.5, avg: 15,    spread: 20,    superChance: 0.05 },
  normal:     { label: 'Normal',     perMin: 2,   avg: 60,    spread: 120,   superChance: 0.15 },
  generous:   { label: 'Generous',   perMin: 6,   avg: 250,   spread: 600,   superChance: 0.3 },
  overgiving: { label: 'Overgiving', perMin: 18,  avg: 1_200, spread: 4_000, superChance: 0.55 },
};
export const GENEROSITY_LEVELS: Generosity[] = ['off', 'stingy', 'normal', 'generous', 'overgiving'];

/** Roll one ambient donation amount for a generosity level. `rnd`/`rnd2` are caller
 *  randoms in [0,1) so this stays pure/testable. Returns a positive integer Kibble amount
 *  (never below 1 when donations are on); 'off' always returns 0. */
export function rollDonationAmount(gen: Generosity, rnd: number, rnd2: number): number {
  const cfg = GENEROSITY[gen] ?? GENEROSITY.off;
  if (cfg.avg <= 0) return 0;
  // Skewed toward small with an occasional whale (superChance → a big multiplier).
  const base = cfg.avg * (0.3 + rnd * 1.4);
  const whale = rnd2 < cfg.superChance ? 3 + rnd * (cfg.spread / Math.max(1, cfg.avg)) : 1;
  return Math.max(1, Math.round(base * whale));
}

/** Format a Kibble amount compactly (1.2K, 3.4M …) with the 🐟 symbol. */
export function formatKibbles(k: number): string {
  const n = Math.max(0, Math.floor(k || 0));
  const s = n >= 1e9 ? (n / 1e9).toFixed(1) + 'B'
    : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M'
    : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K'
    : String(n);
  return `${CHAT_CURRENCY.symbol} ${s.replace('.0', '')}`;
}
