// lib/dnd/stream-moods.ts — DM-selectable chat "moods" (Phase K).
//
// A mood biases the streamer's ambient chat toward a vibe. The DM can select several at
// once (they blend) or none (the "default" balanced chat). Each mood carries a curated,
// SFW, IN-WORLD line pool — nothing here references D&D, dice/rolls, the DM, or game
// mechanics; the viewers are watching her stream, not a tabletop. Pure data + a pool
// builder so it's unit-tested and shared by the overlay + control panel. The AI-refresh
// job (every ~15 min while live) can add lines per mood via `ai_mood_lines`.

export interface Mood {
  id: string;
  label: string;
  icon: string;
  lines: string[];
}

// The 10 moods. Keep lines short (chat-length), clean, and in-world.
export const MOODS: readonly Mood[] = [
  {
    id: 'hype', label: 'Hype', icon: '🔥',
    lines: [
      'LETS GOOO', 'W streamer', 'SHEEEESH', 'she is HIM', 'peak fiction', 'we are SO back',
      'GOATED', 'aura +1000', 'clip that NOW', 'HYPERS', 'LFGGG', 'certified W', 'she ate that up',
      'chat we won', 'insane play', 'no way she pulled that off', 'CINEMA', 'lock in QUEEN',
    ],
  },
  {
    id: 'backseat', label: 'Backseat', icon: '🪑',
    lines: [
      'go left. LEFT', 'talk to the merchant first', 'check the corner', 'you missed the lever',
      'grab the loot behind you', 'dont go in there', 'save it for later', 'use the other path',
      'she never listens to chat', 'READ THE SIGN', 'the door was open the whole time', 'go back go back',
      'ask about the map', 'dont sell that', 'loot the chest first', 'why did she skip that',
    ],
  },
  {
    id: 'simp', label: 'Simp', icon: '😍',
    lines: [
      'she is so pretty', 'queen behavior', 'the drip is immaculate', 'marry me streamer',
      'prettiest adventurer alive', 'i would fight a dragon for her', 'she dropped the crown 👑',
      'gassing her up fr', 'best streamer NA', 'protect her at all costs', 'she is HER', 'down bad chat',
      'her outfit is fire', 'take my whole coin purse', 'shes carrying us and looking good doing it',
    ],
  },
  {
    id: 'roast', label: 'Roast', icon: '🤡',
    lines: [
      'she tripped on flat ground', 'L take streamer', 'ratio', 'skill issue', 'my grandma plays better',
      'she walked right past it 💀', 'not the mushroom AGAIN', 'bro fell in the water LMAOO',
      'peak comedy', 'she has NO sense of direction', 'clown emoji', 'this is painful to watch (affectionate)',
      'she really said no thoughts head empty', 'certified L moment', 'that was NOT the play',
    ],
  },
  {
    id: 'panic', label: 'Panic', icon: '😱',
    lines: [
      'BEHIND YOU', 'RUN GIRL RUN', 'ITS A TRAP', 'GET OUT OF THERE', 'nooo dont go in there',
      'look out!!', 'AAAAAA', 'she has a knife RUN', 'turn around NOW', 'monkaS', 'we are cooked',
      'dont open it', 'somethings wrong', 'i cant watch', 'PANIC', 'she is gonna die chat',
      'call for help', 'this is a setup', 'GET BACK',
    ],
  },
  {
    id: 'copium', label: 'Copium', icon: '🧪',
    lines: [
      'she meant to do that', 'copium', 'its fine its fine', 'we are so back (delusional)', 'hopium activated',
      'this is fine', 'she totally planned this', 'trust the process', 'huffing that copium', 'it was 4D chess',
      'she is cracked actually', 'no because she has a plan', 'cope harder', 'believe in her', 'we never lost',
    ],
  },
  {
    id: 'flirty', label: 'Flirty', icon: '💕',
    lines: [
      'the villain kinda fine tho', 'romance the merchant 👀', 'ship it ship it', 'kiss him. no wait hes evil',
      'she needs a knight fr', 'the tension is CRAZY', 'they would be so cute', 'draw them holding hands',
      'the enemies-to-lovers arc is real', 'he keeps staring 👀', 'get her a boyfriend chat', 'they are SO in love',
      'the yearning is off the charts', 'not the slow burn', 'i ship it your honor',
    ],
  },
  {
    id: 'conspiracy', label: 'Conspiracy', icon: '🕵️',
    lines: [
      'the merchant is the villain i CALLED it', 'thats foreshadowing', 'canon event', 'he is lying to you',
      'trust no one', 'the statue MOVED did yall see that', 'its all connected', 'plot twist incoming',
      'that guy is SO shady', 'i have a theory', 'the king knows something', 'sus guy alert',
      'wake up chat its a setup', 'the soup is a clue', 'nobody is who they say they are', 'i knew it. i KNEW it',
    ],
  },
  {
    id: 'hungry', label: 'Hungry', icon: '🍕',
    lines: [
      'she needs a snack fr', 'do NOT drink the glowing soup', 'im hungry now', 'the tavern food looks bussin',
      'get that corn outta my face', 'why is the soup glowing', 'i want what shes having', 'feed her chat',
      'DONT EAT THE MUSHROOM', 'is that turkey leg real', 'i could go for a stew rn', 'boil em mash em stick em in a stew',
      'the bread looks so good', 'she skipped lunch again', 'snack break when',
    ],
  },
  {
    id: 'wholesome', label: 'Wholesome', icon: '💖',
    lines: [
      'she made a friend!! 🥹', 'protect the puppy', 'we believe in you', 'you got this!!', 'pet the animal',
      'the goblin was just misunderstood', 'save the kitty 🥹', 'dont cry ill cry too', 'shes doing her best 💖',
      'so proud of her', 'good vibes only', 'befriend it dont fight it', 'she deserves the world',
      'wholesome moment', 'group hug chat', 'be kind to the little guy',
    ],
  },
];

export const MOOD_IDS = MOODS.map((m) => m.id);
const MOOD_BY_ID = new Map(MOODS.map((m) => [m.id, m]));

/** Look up a mood by id (undefined if unknown). */
export function moodById(id: string): Mood | undefined {
  return MOOD_BY_ID.get(id);
}

/**
 * Build the effective ambient-chat phrase pool.
 *  - No moods selected → the broad `base` pool (default balanced chat).
 *  - One+ moods → those moods' curated lines PLUS any AI-generated lines for them, with a
 *    light seasoning of the base pool (~15%) so it never feels like a single stuck note.
 * `aiLines` maps moodId → extra lines (from the 15-min AI refresh); unknown ids are ignored.
 * Deterministic (no randomness) so it's unit-testable; the caller picks randomly from it.
 */
export function buildMoodPool(
  base: readonly string[],
  moodIds: readonly string[] | null | undefined,
  aiLines?: Record<string, string[]> | null,
): string[] {
  const ids = (moodIds ?? []).filter((id) => MOOD_BY_ID.has(id));
  if (ids.length === 0) return [...base];

  const pool: string[] = [];
  for (const id of ids) {
    const mood = MOOD_BY_ID.get(id);
    if (mood) pool.push(...mood.lines);
    const extra = aiLines?.[id];
    if (Array.isArray(extra)) pool.push(...extra.filter((s) => typeof s === 'string' && s.trim()));
  }
  // Light base seasoning: ~15% of the mood pool size, so generic hype/slang still trickles.
  const season = Math.max(4, Math.round(pool.length * 0.15));
  for (let i = 0; i < season && base.length; i++) pool.push(base[(i * 7) % base.length]);
  return pool;
}
