// lib/jobs/instructions.ts — the pure parser behind the Work Mode JOB INSTRUCTIONS surface (owner 2026-07-18:
// "a page where the RPLS … can clearly list out all of the instructions for the job. They will be able to
// hyperlink files/documents/images in the instructions").
//
// Instructions are stored as plain text; a file/document/image is embedded with a markdown-flavoured link:
//   [label](job-file:<fileId>)     → a tap-through link to that job file/document
//   ![alt](job-file:<fileId>)      → an inline image (a job photo/plat rendered in-line)
// This module tokenizes that text into segments and resolves each file reference against the job's files
// (flagging a broken/removed reference) — pure + framework-free + tested, so both the web and mobile
// instruction views render from the SAME parse and can't disagree on what links to what. No new store: it
// reuses the existing `job_files`/`field_media` ids the hub already loads.

/** A parsed instruction segment: literal text, a file link, or an inline image reference. */
export type InstructionSegment =
  | { type: 'text'; text: string }
  | { type: 'link'; label: string; fileId: string; image: false }
  | { type: 'link'; label: string; fileId: string; image: true };

// Matches `[label](job-file:id)` and the image form `![alt](job-file:id)`. Ids are the usual uuid/slug chars.
const LINK_RE = /(!?)\[([^\]]*)\]\(job-file:([A-Za-z0-9_-]+)\)/g;

/**
 * Tokenize instruction text into an ordered list of segments. Literal text between links is preserved
 * verbatim; each `[…](job-file:id)` (or `![…]`) becomes a link segment. Empty/no-link text yields a single
 * text segment (or none for an empty string). Never throws — malformed link-like text just stays literal.
 */
export function parseInstructions(text: string | null | undefined): InstructionSegment[] {
  const src = typeof text === 'string' ? text : '';
  if (!src) return [];
  const out: InstructionSegment[] = [];
  let last = 0;
  LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINK_RE.exec(src)) !== null) {
    if (m.index > last) out.push({ type: 'text', text: src.slice(last, m.index) });
    const image = m[1] === '!';
    out.push({ type: 'link', label: m[2] || (image ? 'image' : 'file'), fileId: m[3], image } as InstructionSegment);
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ type: 'text', text: src.slice(last) });
  return out;
}

/** Every distinct file id referenced by the instruction text, in first-seen order. */
export function extractFileRefs(text: string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const seg of parseInstructions(text)) {
    if (seg.type === 'link' && !seen.has(seg.fileId)) seen.add(seg.fileId);
  }
  return [...seen];
}

export interface ResolvedInstructionLink {
  label: string;
  fileId: string;
  image: boolean;
  /** The resolved file (url/name) when it still exists on the job, else null (a broken/removed reference). */
  file: { id: string; name?: string | null; url?: string | null } | null;
}
export type ResolvedSegment =
  | { type: 'text'; text: string }
  | ({ type: 'link' } & ResolvedInstructionLink);

/**
 * Resolve each link segment against the job's available files, attaching the file (url/name) or marking it
 * broken (`file: null`) so the UI can render a "missing file" chip instead of a dead link. `urlOf` lets the
 * caller supply whichever url tier it has (signed display url, storage url, …). Pure.
 */
export function resolveInstructions(
  text: string | null | undefined,
  files: { id: string; name?: string | null }[],
  urlOf?: (file: { id: string; name?: string | null }) => string | null | undefined,
): ResolvedSegment[] {
  const byId = new Map(files.map((f) => [f.id, f] as const));
  return parseInstructions(text).map((seg): ResolvedSegment => {
    if (seg.type !== 'link') return seg;
    const f = byId.get(seg.fileId);
    return {
      type: 'link',
      label: seg.label,
      fileId: seg.fileId,
      image: seg.image,
      file: f ? { id: f.id, name: f.name ?? null, url: urlOf?.(f) ?? null } : null,
    };
  });
}

/** Validate the links in instruction text against the job's files — returns the referenced ids that no
 *  longer resolve, so the RPLS is warned before saving that a linked file was removed. */
export function brokenInstructionRefs(text: string | null | undefined, availableFileIds: string[]): string[] {
  const have = new Set(availableFileIds);
  return extractFileRefs(text).filter((id) => !have.has(id));
}
