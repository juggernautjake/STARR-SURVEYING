// lib/dnd/stream-spam.ts — procedural spam variations for the streamer chat (Phase J5).
// Turns one phrase into a burst of stylized chat lines: case flips, char repeats,
// emoji, spacing, leetspeak, and reaction wrappers. Pure + deterministic so it's
// unit-tested and serves as the always-available fallback when the AI variant is off.

const EMOJI = ['🔥', '💀', '😭', '🗿', '💅', '🐐', '⚔️', '👑', '😂', '🙏', '⭐', '💯', '🤨', '👀', '😳'];
const REACT = [
  'OMG {p}', '{p} LMAOOO', 'not {p} 💀', 'chat is this {p}?', '{p} actual cinema', 'W {p}',
  '{p} on god', 'bro said {p}', '{p}????', 'sir this is a {p}', '{p} is CRAZY', 'yo {p}',
];

function spongebob(s: string): string {
  let up = false;
  return s.replace(/[a-z]/gi, (c) => ((up = !up) ? c.toUpperCase() : c.toLowerCase()));
}
function leet(s: string): string {
  const map: Record<string, string> = { a: '4', e: '3', o: '0', i: '1', s: '5', t: '7' };
  return s.replace(/[aeiost]/gi, (c) => map[c.toLowerCase()] ?? c);
}
function stretch(s: string): string {
  // Repeat the last few vowels/consonants: "pog" -> "poggg", "lol" -> "loooool"
  return s.replace(/([aeiou])(?=[^aeiou]*$)/i, (m) => m.repeat(4)).replace(/(\w)$/, (m) => m.repeat(3));
}

/** Deterministically produce `count` spam variations of `phrase`. */
export function spamVariations(phrase: string, count: number): string[] {
  const p = (phrase || '').trim().slice(0, 60) || 'POG';
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const e = EMOJI[i % EMOJI.length];
    let v: string;
    switch (i % 9) {
      case 0: v = `${p.toUpperCase()} ${e.repeat(1 + (i % 3))}`; break;
      case 1: v = p.toLowerCase(); break;
      case 2: v = spongebob(p); break;
      case 3: v = stretch(p); break;
      case 4: v = REACT[i % REACT.length].replace('{p}', p); break;
      case 5: v = `${p}!!!`; break;
      case 6: v = leet(p); break;
      case 7: v = p.split('').join(' '); break;
      default: v = `${e} ${p} ${EMOJI[(i + 3) % EMOJI.length]}`; break;
    }
    out.push(v.slice(0, 240));
  }
  return out;
}
