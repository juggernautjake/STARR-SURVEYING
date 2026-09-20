// lib/learn/chunkSection.ts — turning a wall of a lesson into something you can step through.
//
// Owner, 2026-09-19: "I want it so that the information is sectioned into easy to understand
// chunks, kind of like a slide show. I want arrows that can navigate back and forth between the
// chunks of info."
//
// ── WHY THE HEADINGS, AND NOT AN AUTHORED LIST ──────────────────────────────────────────────────
//
// An FS module is `fs_study_modules.content_sections`: five typed sections (overview, concepts,
// formulas, examples, tips), each ONE string of Markdown with raw HTML mixed in. Inside those
// strings the material is already divided — "## Accuracy vs precision", "## The three error types",
// "## Standard deviation and standard error". Somebody already wrote the outline; it is simply being
// rendered as one scroll.
//
// So chunks are DERIVED, not authored. That was a choice with three consequences worth stating:
//
//   - every module gets the stepped view today, with no content work and nothing to backfill;
//   - editing a seed changes both views at once, so they cannot drift apart;
//   - the chunk titles are the author's own headings, which are better than anything a split
//     heuristic would invent.
//
// ── THE PART THE HEADINGS DO NOT SOLVE ──────────────────────────────────────────────────────────
//
// Measured against the real content on 2026-09-19: most sections carry 4–9 `##` headings, which is
// exactly the right granularity. But every `overview` section has ONE heading over ~2,200
// characters, and module 10's concepts, formulas and examples are 5,400–6,300 characters under a
// single heading. Splitting only at `##` would leave those as one slide each, which is the wall
// this exists to break up.
//
// So an oversized block is split again: at `###` if it has them, then at paragraph boundaries.
// Paragraph splitting is the dangerous one, because this content is Markdown with raw `<table>`,
// `<ul>` and `<svg>` in it, and a blank line inside a table is still a blank line. Breaking there
// would cut a table in half and produce two slides of broken HTML. `protectedSpans` is what stops
// that: splits are only allowed at blank lines that lie outside every such block.

/** One step in the sequence. */
export interface Chunk {
  /** Stable across renders and reloads: `<sectionType>.<n>`. Used for progress and for the URL. */
  id: string;
  sectionType: string;
  sectionTitle: string;
  /** The author's heading where there is one, else the section's own title. */
  title: string;
  /** Markdown, rendered by the page's existing pipeline — NOT pre-rendered HTML. */
  content: string;
  /** Which part of a heading that had to be split, 1-based. 0 when it was not split. */
  part: number;
  partsInHeading: number;
}

export interface Section {
  type: string;
  title?: string;
  content: string;
}

/** Above this, a block is split again. Chosen from the real content: the median `##` block is
 *  ~600 characters and reads as one idea, while the overview sections that need breaking up sit at
 *  2,100+. 1,500 keeps every naturally-sized block whole and catches the walls. */
export const MAX_CHUNK_CHARS = 1500;

/** What a paragraph-split aims for. Lower than the maximum so packing stops at a sensible place
 *  rather than only when it is about to overflow. */
export const TARGET_CHUNK_CHARS = 1000;

/**
 * Regions a split must never land inside.
 *
 * Markdown here is mixed with raw HTML, and a blank line inside a `<table>` is still a blank line —
 * splitting there yields two slides each holding half a table. Fenced code is included for the same
 * reason, and `<svg>` because the seeds embed generated figures inline.
 */
function protectedSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const pairs: Array<[RegExp, string]> = [
    [/<table\b/gi, '</table>'],
    [/<ul\b/gi, '</ul>'],
    [/<ol\b/gi, '</ol>'],
    [/<svg\b/gi, '</svg>'],
    [/<figure\b/gi, '</figure>'],
    [/<pre\b/gi, '</pre>'],
  ];
  for (const [open, close] of pairs) {
    open.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = open.exec(text)) !== null) {
      const end = text.toLowerCase().indexOf(close, m.index);
      // An unclosed tag protects the rest of the string. Being over-cautious costs a bigger chunk;
      // being under-cautious costs broken markup on screen.
      spans.push([m.index, end === -1 ? text.length : end + close.length]);
    }
  }
  // Fenced code blocks, in pairs.
  const fence = /^```/gm;
  const fences: number[] = [];
  let f: RegExpExecArray | null;
  while ((f = fence.exec(text)) !== null) fences.push(f.index);
  for (let i = 0; i + 1 < fences.length; i += 2) spans.push([fences[i]!, fences[i + 1]! + 3]);

  return spans;
}

const inside = (spans: Array<[number, number]>, at: number) =>
  spans.some(([a, b]) => at > a && at < b);

/** Split a long block at blank lines, packing toward TARGET and never breaking protected markup. */
function splitAtParagraphs(text: string): string[] {
  const spans = protectedSpans(text);
  const breaks: number[] = [];
  const blank = /\n\s*\n/g;
  let m: RegExpExecArray | null;
  while ((m = blank.exec(text)) !== null) {
    if (!inside(spans, m.index)) breaks.push(m.index + m[0].length);
  }
  if (breaks.length === 0) return [text];

  const out: string[] = [];
  let start = 0;
  let last = 0;
  for (const b of breaks) {
    if (b - start >= TARGET_CHUNK_CHARS) {
      out.push(text.slice(start, b).trim());
      start = b;
    }
    last = b;
  }
  void last;
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  // A single oversized paragraph with nowhere legal to break stays whole. A slide that is too long
  // is a readability problem; a slide cut through the middle of a table is a broken page.
  return out.filter(Boolean);
}

/** Split one block at its `###` sub-headings, keeping each heading with its content. */
function splitAtSubHeadings(text: string): string[] | null {
  const spans = protectedSpans(text);
  const at: number[] = [];
  const h3 = /^###\s+/gm;
  let m: RegExpExecArray | null;
  while ((m = h3.exec(text)) !== null) {
    if (!inside(spans, m.index)) at.push(m.index);
  }
  if (at.length < 2) return null;
  const out: string[] = [];
  // Anything before the first `###` rides with it rather than becoming a slide of orphaned prose.
  for (let i = 0; i < at.length; i += 1) {
    const from = i === 0 ? 0 : at[i]!;
    const to = i + 1 < at.length ? at[i + 1]! : text.length;
    const piece = text.slice(from, to).trim();
    if (piece) out.push(piece);
  }
  return out;
}

/** The heading a block opens with, without its marker. */
function headingOf(block: string): string | null {
  const m = /^#{2,3}\s+(.+)$/m.exec(block);
  return m ? m[1]!.trim() : null;
}

/**
 * One section → the steps it becomes.
 *
 * Returns at least one chunk for any section with content, so a caller never has to handle "this
 * section cannot be stepped through".
 */
export function chunkSection(section: Section): Chunk[] {
  const sectionTitle = (section.title ?? '').trim() || section.type;
  const body = (section.content ?? '').trim();
  if (!body) return [];

  // Split at `##`, keeping the heading with what follows it.
  const spans = protectedSpans(body);
  const heads: number[] = [];
  const h2 = /^##\s+/gm;
  let m: RegExpExecArray | null;
  while ((m = h2.exec(body)) !== null) {
    if (!inside(spans, m.index)) heads.push(m.index);
  }

  const blocks: string[] = [];
  if (heads.length === 0) {
    blocks.push(body);
  } else {
    // Text before the first heading is a lead-in. Kept as its own block only when it is
    // substantial; a single orphaned sentence belongs with the heading it introduces.
    const lead = body.slice(0, heads[0]).trim();
    if (lead.length > 200) blocks.push(lead);
    for (let i = 0; i < heads.length; i += 1) {
      const to = i + 1 < heads.length ? heads[i + 1]! : body.length;
      const piece = body.slice(heads[i]!, to).trim();
      if (piece) blocks.push(lead.length > 0 && lead.length <= 200 && i === 0 ? `${lead}\n\n${piece}` : piece);
    }
  }

  const chunks: Chunk[] = [];
  for (const block of blocks) {
    const title = headingOf(block) ?? sectionTitle;
    const pieces = block.length <= MAX_CHUNK_CHARS
      ? [block]
      : (splitAtSubHeadings(block) ?? splitAtParagraphs(block));

    pieces.forEach((piece, i) => {
      chunks.push({
        id: `${section.type}.${chunks.length}`,
        sectionType: section.type,
        sectionTitle,
        title,
        content: piece,
        part: pieces.length > 1 ? i + 1 : 0,
        partsInHeading: pieces.length,
      });
    });
  }

  // Re-key so ids are contiguous after the nested splitting above.
  return chunks.map((c, i) => ({ ...c, id: `${section.type}.${i}` }));
}

/** Every section of a module, in the order they are taught, as one flat sequence to step through. */
export function chunkModule(sections: readonly Section[], order?: readonly string[]): Chunk[] {
  const seq = order ?? ['overview', 'concepts', 'formulas', 'examples', 'tips'];
  const out: Chunk[] = [];
  for (const type of seq) {
    const section = sections.find((s) => s.type === type);
    if (section) out.push(...chunkSection(section));
  }
  // A section whose type is not in the order still gets taught, after the known ones, rather than
  // silently vanishing from the stepped view while remaining in the full one.
  for (const section of sections) {
    if (!seq.includes(section.type)) out.push(...chunkSection(section));
  }
  return out;
}

/** Where a chunk sits, for "3 of 24" and for the progress bar. */
export function chunkPosition(chunks: readonly Chunk[], id: string): { index: number; total: number } {
  const index = chunks.findIndex((c) => c.id === id);
  return { index: index < 0 ? 0 : index, total: chunks.length };
}

/** The first chunk of a section, so the tab strip can jump into the stepped view at the right place. */
export function firstChunkOfSection(chunks: readonly Chunk[], sectionType: string): Chunk | null {
  return chunks.find((c) => c.sectionType === sectionType) ?? null;
}
