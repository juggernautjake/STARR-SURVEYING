// lib/learn/demos.ts — letting a lesson put something interactive in the middle of its prose.
//
// Owner, 2026-09-20: "I want demonstrations and illustrations and animations of different concepts.
// Things like having a unit circle/compass and asking the user to select which quadrant is the 192
// degrees in … or turning an instrument in the right direction, or reorienting a drawing to the
// correct north, or having to actually use a calculator to enter the answer."
//
// ── WHY A DIRECTIVE AND NOT A COMPONENT PER LESSON ──────────────────────────────────────────────
//
// Lesson content is markdown in the database, written by whoever is authoring the module, and it is
// rendered to a string and dropped in with `dangerouslySetInnerHTML`. React components cannot live
// inside that string. The two ways out are: hard-code "module 4 section 2 shows the compass" in the
// page, or let the author write where the demo goes.
//
// The first is unmaintainable the moment a section is reordered, and it puts editorial decisions in
// a TSX file that authors cannot edit. So the author writes a line:
//
//     [demo:quadrant azimuth=192]
//
// and this module splits the content around it. The page renders the prose either side as HTML and
// the demo as a real React component in between.
//
// ── THE DIRECTIVE IS DELIBERATELY DUMB ──────────────────────────────────────────────────────────
//
// `name` plus flat `key=value` pairs, no nesting, no expressions, no quotes to get wrong. Anything
// richer becomes a small language that authors have to learn and that this file has to defend
// against. A demo that needs more configuration than this wants to be a new demo, not a cleverer
// directive.
//
// An UNKNOWN name renders as nothing at all rather than as an error box — see `splitDemos`. A
// misspelt directive should cost a missing illustration, never a lesson that will not open.
//
// Pure, and tested in __tests__/learn/demos.test.ts.

/** The demos a lesson may embed. Adding one here is what makes the directive legal. */
export const DEMO_NAMES = ['quadrant'] as const;
export type DemoName = (typeof DEMO_NAMES)[number];

export interface DemoDirective {
  name: DemoName;
  /** Everything after the name, as written. Values stay strings; the component parses what it needs. */
  props: Record<string, string>;
}

export type ContentSegment =
  | { kind: 'html'; text: string }
  | { kind: 'demo'; demo: DemoDirective };

/**
 * `[demo:name key=value key=value]` on a line of its own.
 *
 * Anchored to line starts and ends so a directive mentioned inside a sentence — or inside a code
 * block showing an author how to write one — is left alone as prose.
 */
const DIRECTIVE = /^[ \t]*\[demo:([a-z][a-z0-9-]*)((?:[ \t]+[a-zA-Z][a-zA-Z0-9_]*=[^\]\s]+)*)[ \t]*\][ \t]*$/gm;

function parseProps(raw: string): Record<string, string> {
  const props: Record<string, string> = {};
  for (const m of raw.matchAll(/([a-zA-Z][a-zA-Z0-9_]*)=([^\]\s]+)/g)) {
    props[m[1]] = m[2];
  }
  return props;
}

function isKnown(name: string): name is DemoName {
  return (DEMO_NAMES as readonly string[]).includes(name);
}

/**
 * Split lesson content into prose and demos.
 *
 * Returns the ORIGINAL markdown for the prose segments — not rendered HTML — because rendering is
 * the caller's job and this module has no business deciding how a paragraph becomes a `<p>`.
 *
 * Content with no directive comes back as a single html segment, which is what makes this safe to
 * put in front of every section: the overwhelming majority of lessons are untouched by it.
 */
export function splitDemos(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let cursor = 0;

  DIRECTIVE.lastIndex = 0;
  for (const m of content.matchAll(DIRECTIVE)) {
    const at = m.index ?? 0;
    // An unknown name is left in the prose untouched. It will render as literal text, which is a
    // visible, harmless signal to the author that they typed the name wrong — and is a great deal
    // kinder than swallowing it silently and leaving them wondering where their demo went.
    if (!isKnown(m[1])) continue;

    const before = content.slice(cursor, at);
    if (before.trim()) segments.push({ kind: 'html', text: before });
    segments.push({ kind: 'demo', demo: { name: m[1], props: parseProps(m[2] ?? '') } });
    cursor = at + m[0].length;
  }

  const rest = content.slice(cursor);
  if (rest.trim()) segments.push({ kind: 'html', text: rest });

  // Content that is nothing but a directive still has to return that directive, and content that is
  // empty returns one empty html segment rather than an empty array, so a caller can render the
  // result without special-casing "no segments".
  if (segments.length === 0) segments.push({ kind: 'html', text: content });
  return segments;
}

/** Whether content has anything interactive in it. Lets a caller skip the segment path entirely. */
export function hasDemo(content: string): boolean {
  return splitDemos(content).some((s) => s.kind === 'demo');
}

/**
 * A number from a directive, with a fallback.
 *
 * Authors write `azimuth=192`, and a typo gives `azimuth=19o`. That must not reach a component that
 * will then draw a needle at `NaN` degrees and produce an SVG path of the word "NaN" — which does
 * not throw, does not warn, and renders as an invisible nothing that is very hard to explain.
 */
export function numberProp(props: Record<string, string>, key: string, fallback: number): number {
  const raw = props[key];
  // `Number('')` is 0, and 0 is finite — so a bare `azimuth=` would sail through the check below
  // and point the needle due north, which is a plausible-looking wrong answer rather than an
  // obvious failure. The empty string is not a number and is rejected before it can become one.
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
