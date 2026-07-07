// lib/dnd/stream-names.ts — procedural chat username generator for the streamer-chat
// feature (Phase J1). Combines word lists with style variants to yield thousands of
// distinct Twitch-flavored handles, each with a deterministic color and occasional
// badges. Pure + deterministic (no server deps) so it's unit-tested AND safe to import
// into the client chat overlay. The AI-themed variant lives in stream-names-ai.ts.
const ADJ = [
  'Epic', 'Salty', 'Toxic', 'Based', 'Cracked', 'Sweaty', 'Grim', 'Shadow', 'Pixel', 'Noob',
  'Pro', 'Dark', 'Mega', 'Ultra', 'Turbo', 'Lil', 'Big', 'Old', 'Mad', 'Sir',
  'Lord', 'Captain', 'Silent', 'Frost', 'Blaze', 'Iron', 'Golden', 'Crimson', 'Void', 'Feral',
];
const NOUN = [
  'Gamer', 'Slayer', 'Wizard', 'Goblin', 'Knight', 'Dragon', 'Sniper', 'Warrior', 'Bard', 'Rogue',
  'Mage', 'Orc', 'Wolf', 'Raven', 'Ghost', 'Viking', 'Ninja', 'Potato', 'Cheese', 'Waffle',
  'Toast', 'Wizard420', 'Kobold', 'Lich', 'Paladin', 'Druid', 'Gremlin', 'Yeti', 'Phoenix', 'Kraken',
];
const SUFFIX = ['', '69', '420', '_TV', 'XD', '_YT', '99', '007', '2000', '_gg', 'Live', 'HD', '_', 'xoxo', '1337'];
const COLORS = ['#ff4d4d', '#4da3ff', '#4dff88', '#ffd24d', '#c14dff', '#ff4dbb', '#4dfff0', '#ff884d', '#8cff4d', '#4d6bff'];
const LEET: Record<string, string> = { a: '4', e: '3', o: '0', i: '1', s: '5' };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const pick = <T>(arr: T[], n: number): T => arr[Math.abs(n) % arr.length];

export interface ChatUser {
  name: string;
  color: string;
  badges: string[]; // e.g. ['sub'], ['mod','sub'], ['vip']
}

/** Deterministic color + badges for any name (shared by procedural + AI names). */
export function styleForName(name: string): { color: string; badges: string[] } {
  const color = pick(COLORS, hash(name));
  const roll = hash(name) % 100;
  const badges: string[] = [];
  if (roll < 6) badges.push('mod');
  if (roll % 3 === 0) badges.push('sub');
  else if (roll > 92) badges.push('vip');
  if (roll % 17 === 0) badges.push('prime');
  return { color, badges };
}

/** Deterministically build one chat user from a seed. */
export function makeUsername(seed: number): ChatUser {
  const adj = pick(ADJ, seed);
  const noun = pick(NOUN, Math.floor(seed / ADJ.length) + seed * 7);
  const suffix = pick(SUFFIX, Math.floor(seed / 11) + seed * 13);
  const style = seed % 5;

  let core = `${adj}${noun}`;
  if (style === 1) core = `${adj}_${noun}`;
  else if (style === 2) core = `xX${adj}${noun}Xx`;
  else if (style === 3) core = core.replace(/[aeios]/gi, (c) => LEET[c.toLowerCase()] ?? c);
  else if (style === 4) core = `${adj}The${noun}`;

  const name = `${core}${suffix}`;
  return { name, ...styleForName(name) };
}

/** Generate `count` DISTINCT chat users starting at `startSeed`. */
export function makeUsernames(count: number, startSeed = 0): ChatUser[] {
  const out: ChatUser[] = [];
  const seen = new Set<string>();
  let seed = startSeed;
  const cap = startSeed + count * 20; // safety bound against pathological dedupe loops
  while (out.length < count && seed < cap) {
    const u = makeUsername(seed);
    if (!seen.has(u.name)) {
      seen.add(u.name);
      out.push(u);
    }
    seed++;
  }
  return out;
}

/** Stable numeric hash of a string (exported for the AI-name helper). */
export function hashName(s: string): number {
  return hash(s);
}
