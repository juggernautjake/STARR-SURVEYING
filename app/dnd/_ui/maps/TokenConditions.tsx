// app/dnd/_ui/maps/TokenConditions.tsx — what is wrong with this creature, on the board. M5-4.
//
// The plan: *"The token shows the conditions the sheet already tracks."* Already tracks — so these are
// READ at render time, never copied onto the token. A copied condition is one that stays after it ends:
// the DM clears "poisoned" on the sheet and the board keeps showing it, with nothing saying the two
// disagree. Same rule that keeps the portrait, the size and HP off a token.
//
// ── WHY GLYPHS AND NOT WORDS ────────────────────────────────────────────────────────────────────────
//
// A Medium token is five world units across. At the zoom a DM actually plays at that is a circle roughly
// the size of a fingernail, and "Frightened" does not fit on it — a label would either overflow the token
// or shrink to something nobody can read, and both are worse than a mark. So each condition gets a glyph,
// and the WORD lives in the `title` and the accessible name, where there is room for it.
//
// ── THE COUNT IS CAPPED AT THREE PIPS TOTAL, AND THE OVERFLOW IS STATED ─────────────────────────────
//
// A character can hold six conditions at once, and this was first written showing three of them PLUS an
// exhaustion pip PLUS an overflow pip. Measured in the browser, that stack came out **2.19× the height of
// the token it was annotating** — the status ring became the piece and the piece became a detail under
// it.
//
// So the cap is on the WHOLE column, not on the conditions alone: three pips, the last of which becomes
// "+N" when there is more to say. That keeps the stack about as tall as the token. The dropped ones are
// not lost — the overflow pip names them in its tooltip, and every one of them is in the token's
// accessible name.
//
// Exhaustion takes the first slot when present, because a level of exhaustion outranks any single
// condition for deciding what a character can still do.
//
// ── EXHAUSTION IS A NUMBER, NOT A BADGE ─────────────────────────────────────────────────────────────
//
// "Exhaustion 5" and "exhaustion 1" are different situations — one is nearly dead and one is a bad
// morning. A badge that said only "exhausted" would hide the single number that decides whether the
// character can still act, so it renders as its level.

/** One mark per condition. Kept deliberately plain — a glyph a DM can learn in one session. */
const GLYPH: Record<string, string> = {
  blinded: '◍', charmed: '♥', deafened: '◔', frightened: '!', grappled: '⊗',
  incapacitated: '∅', invisible: '◌', paralyzed: '✖', petrified: '▣', poisoned: '☠',
  prone: '⤓', restrained: '⛓', stunned: '✷', unconscious: 'z',
  // PF2 and IG carry their own vocabularies; these are the ones that overlap in meaning.
  clumsy: '~', drained: '▼', enfeebled: '▽', dazzled: '☀', fleeing: '»', quickened: '»',
  slowed: '«', sickened: '≈', wounded: '✚', dying: '✝', hidden: '◑', concealed: '◐',
};

const glyphFor = (name: string): string => GLYPH[name.trim().toLowerCase().split(/[\s(]/)[0]] ?? '●';

/** Pips in the whole column, overflow marker included. Measured: more than this is taller than the token. */
const MAX_BADGES = 3;

export default function TokenConditions({
  conditions, exhaustion, side,
}: {
  conditions: string[];
  exhaustion: number;
  /** The token's footprint in world units — badges are sized from it, not from a pixel count. */
  side: number;
}) {
  if (!conditions.length && exhaustion <= 0) return null;

  // One list, capped as a whole. Exhaustion first — a level of it outranks any single condition for
  // deciding what a character can still do.
  const all: Array<{ key: string; glyph: string; title: string; tone: 'exhaustion' | 'condition' }> = [
    ...(exhaustion > 0
      ? [{ key: 'exhaustion', glyph: String(exhaustion), title: `Exhaustion ${exhaustion}`, tone: 'exhaustion' as const }]
      : []),
    ...conditions.map((c) => ({ key: c, glyph: glyphFor(c), title: c, tone: 'condition' as const })),
  ];
  // Leave room for the overflow pip itself, so the column never exceeds MAX_BADGES.
  const overflowing = all.length > MAX_BADGES;
  const shown = overflowing ? all.slice(0, MAX_BADGES - 1) : all;
  const dropped = all.slice(shown.length);
  // PROPORTIONAL TO THE TOKEN, for the reason the token's own ring is: inside the transformed layer one
  // CSS pixel is one world unit, so a fixed size would be a different fraction of a Tiny and a
  // Gargantuan token, and would grow relative to nothing as the reader zooms.
  //
  // The ratio was MEASURED, not guessed. At 0.30/0.72 the glyph came out 8.2 screen px on a 38px token —
  // present, and too small to read. 0.34/0.80 puts it at ~10px while the pip stays a third of the token,
  // so it still reads as a marker ON the piece rather than a second piece beside it. The token's own
  // initial renders at `side * 0.5`, which is the ceiling this must stay under.
  const dot = Math.max(1.4, side * 0.34);
  const font = Math.max(0.9, dot * 0.8);

  return (
    <span
      // Non-interactive and OUTSIDE the token's own link target: a DM aiming at a token should not be able
      // to miss it by hitting a status pip.
      aria-hidden="true"
      style={{
        position: 'absolute',
        // Top-right, running down: the least likely corner to cover a face, which is what portraits put
        // in the middle.
        top: -dot * 0.35,
        right: -dot * 0.35,
        display: 'flex',
        flexDirection: 'column',
        gap: dot * 0.14,
        pointerEvents: 'none',
      }}
    >
      {shown.map((p) => (
        <span
          key={p.key}
          title={p.title}
          style={{
            width: dot, height: dot, borderRadius: '50%',
            // Exhaustion reads as its own thing — it is a level, not one of the on/off statuses beside
            // it. Both from the theme's own tokens rather than hex literals: an inline colour cannot be
            // reached by a skin, a media query or a contrast audit, which is what
            // `inline-style-hex-ratchet.test.ts` exists to stop (it caught this file).
            background: p.tone === 'exhaustion' ? 'var(--hx-danger-2)' : 'var(--hx-danger)',
            color: p.tone === 'exhaustion' ? 'var(--hx-gold-2)' : 'var(--hx-gold-0)',
            border: `${dot * 0.08}px solid var(--hx-navy-0)`,
            display: 'grid', placeItems: 'center',
            fontSize: font, lineHeight: 1,
            fontWeight: p.tone === 'exhaustion' ? 700 : 400,
          }}
        >
          {p.glyph}
        </span>
      ))}
      {dropped.length > 0 && (
        <span
          title={dropped.map((p) => p.title).join(', ')}
          style={{
            width: dot, height: dot, borderRadius: '50%',
            background: 'var(--hx-navy-0)', color: 'var(--hx-gold-2)',
            border: `${dot * 0.08}px solid var(--hx-navy-0)`,
            display: 'grid', placeItems: 'center',
            fontSize: font * 0.85, lineHeight: 1, fontWeight: 700,
          }}
        >
          +{dropped.length}
        </span>
      )}
    </span>
  );
}

/**
 * The token's accessible name, conditions included.
 *
 * The badges are `aria-hidden` — a screen reader announcing "circle, circle, circle" is noise. The words
 * belong in the one place that already names the token, so a non-sighted DM hears
 * *"Vashti Kelln, poisoned, prone"* rather than a count of shapes.
 */
export function conditionSuffix(conditions: string[], exhaustion: number): string {
  const parts = [...conditions];
  if (exhaustion > 0) parts.push(`exhaustion ${exhaustion}`);
  return parts.length ? `, ${parts.join(', ')}` : '';
}
