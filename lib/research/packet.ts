// lib/research/packet.ts — the deliverable, assembled with its provenance (plan R25).
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// Everything the research produces is scattered: facts in `extracted_data_points`, conflicts in
// `discrepancies`, the gameplan in `research_survey_plans`, documents and their markup in
// `research_documents` / `document_annotations`. Nothing said "these, in this order, are what we are
// handing the crew" — so what the crew received was whatever the screens happened to show that day,
// and nobody could reproduce it afterwards.
//
// ── EVERY ITEM CARRIES ITS PROVENANCE LINE ──────────────────────────────────────────────────────
//
// The acceptance is specific: "every included document carries its provenance line". That line is
// where the last eight slices land. A fact prints what it is, whether anybody CHECKED it (R23),
// whether there is a source to open (R17), and — where it was corrected — what the extraction had
// originally said. Without that, a packet flattens a verified reading and an unreviewed guess into
// the same sentence, which is exactly what the packet must never do: it is the document somebody
// stakes a boundary from.

import type { Discrepancy, ExtractedDataPoint, ResearchDocument } from '@/types/research';
import { evidenceFor } from './fact-evidence';
import { reviewMeta } from './fact-review';
import { frameConflict } from './conflict-framing';

export type PacketItemKind = 'fact' | 'document' | 'conflict' | 'plan' | 'drawing' | 'imagery';

export interface PacketItemRef {
  kind: PacketItemKind;
  refId: string;
  order: number;
  /** A surveyor's note on why this is in the packet. */
  note?: string | null;
}

export interface PacketSection {
  kind: PacketItemKind;
  title: string;
  entries: PacketEntry[];
}

export interface PacketEntry {
  refId: string;
  heading: string;
  body: string;
  /** The one line that says where this came from and how far to trust it. */
  provenance: string;
  /** True when nothing in the packet backs this up — printed as a warning, not omitted. */
  unsupported: boolean;
  note?: string | null;
}

export interface PacketSources {
  facts: ExtractedDataPoint[];
  documents: ResearchDocument[];
  conflicts: Discrepancy[];
  planSummary?: string | null;
  documentLabels?: Record<string, string>;
}

const SECTION_TITLE: Record<PacketItemKind, string> = {
  plan: 'Field plan',
  conflict: 'Open questions for the field',
  fact: 'Facts relied on',
  document: 'Source documents',
  drawing: 'Drawings',
  imagery: 'Imagery',
};

/** Section order in the printed packet.
 *
 *  The plan first and the conflicts second, because a crew reads the front of a packet in the truck
 *  and the back of it never. Putting the open questions behind fifty facts is how they get missed. */
export const SECTION_ORDER: PacketItemKind[] = ['plan', 'conflict', 'fact', 'drawing', 'imagery', 'document'];

// ── Provenance lines ────────────────────────────────────────────────────────────────────────────

/** The provenance line for a fact. Says three separate things, because they are three separate
 *  questions and collapsing them is what makes a packet lie:
 *    — has a PERSON checked it (R23)
 *    — is there a SOURCE to open (R17)
 *    — what did the extraction originally say, when it was corrected */
export function factProvenance(f: ExtractedDataPoint, documentLabels: Record<string, string> = {}): string {
  const review = reviewMeta(f);
  const evidence = evidenceFor(f);
  const doc = documentLabels[f.document_id] ?? 'an unnamed document';

  const parts: string[] = [`Source: ${doc}`];
  if (f.source_page != null) parts.push(`page ${f.source_page}`);

  parts.push(
    review.status === 'corrected'
      ? `corrected by ${f.reviewed_by ?? 'a reviewer'} (the extraction read "${f.display_value || f.raw_value}")`
      : review.status === 'accepted'
        ? `checked and accepted by ${f.reviewed_by ?? 'a reviewer'}`
        : review.status === 'rejected'
          ? 'REJECTED by a reviewer — included only for the record'
          : 'NOT CHECKED by anybody',
  );

  if (evidence.strength === 'asserted') {
    parts.push('no source document, page or quote is recorded — this came from the model');
  } else if (evidence.strength === 'quoted' && f.source_text_excerpt) {
    parts.push(`quoted: "${truncate(f.source_text_excerpt, 120)}"`);
  }

  return parts.join('; ') + '.';
}

export function documentProvenance(d: ResearchDocument): string {
  const parts: string[] = [];
  parts.push(d.source_url ? `Retrieved from ${d.source_url}` : `Source: ${d.source_type.replace(/_/g, ' ')}`);
  if (d.recording_info) parts.push(d.recording_info);
  if (d.recorded_date) parts.push(`recorded ${d.recorded_date.slice(0, 10)}`);
  if (d.readability === 'unreadable') {
    // The single most important thing to print about a document nobody could read.
    parts.push('THIS DOCUMENT COULD NOT BE READ — its contents are not reflected anywhere in this packet');
  } else if (d.readability === 'partial') {
    parts.push('only partial text was extracted — treat anything absent as unconfirmed rather than absent');
  }
  return parts.join('; ') + '.';
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

// ── Assembly ────────────────────────────────────────────────────────────────────────────────────

export interface AssembledPacket {
  title: string;
  coverNotes: string | null;
  sections: PacketSection[];
  /** Numbered contents, built from the sections so it can never disagree with them. */
  tableOfContents: Array<{ number: number; title: string; entries: number }>;
  warnings: string[];
  itemCount: number;
}

/** Build the printable packet from selected references and the live source rows.
 *
 *  A reference to something that no longer exists becomes a WARNING, never a silent omission: a
 *  packet quietly one item shorter than what was approved is the failure this whole table exists to
 *  prevent. */
export function assemblePacket(
  title: string,
  coverNotes: string | null,
  contents: PacketItemRef[],
  src: PacketSources,
): AssembledPacket {
  const factById = new Map(src.facts.map((f) => [f.id, f]));
  const docById = new Map(src.documents.map((d) => [d.id, d]));
  const conflictById = new Map(src.conflicts.map((c) => [c.id, c]));
  const labels = src.documentLabels ?? {};
  const warnings: string[] = [];

  const sections: PacketSection[] = [];
  for (const kind of SECTION_ORDER) {
    const refs = contents.filter((c) => c.kind === kind).sort((a, b) => a.order - b.order);
    if (refs.length === 0) continue;

    const entries: PacketEntry[] = [];
    for (const ref of refs) {
      const entry = buildEntry(kind, ref, { factById, docById, conflictById, labels, planSummary: src.planSummary });
      if (!entry) {
        warnings.push(`A ${kind} selected for this packet (${ref.refId}) no longer exists and could not be included.`);
        continue;
      }
      entries.push({ ...entry, note: ref.note ?? null });
    }
    if (entries.length > 0) sections.push({ kind, title: SECTION_TITLE[kind], entries });
  }

  const unsupported = sections.flatMap((s) => s.entries).filter((e) => e.unsupported).length;
  if (unsupported > 0) {
    warnings.push(
      `${unsupported} item(s) in this packet have no source recorded or were never checked by a person. ` +
      'They are printed with that stated on the item, and must not be relied on as readings.',
    );
  }

  const tableOfContents = sections.map((s, i) => ({
    number: i + 1,
    title: s.title,
    entries: s.entries.length,
  }));

  return {
    title,
    coverNotes,
    sections,
    tableOfContents,
    warnings,
    itemCount: sections.reduce((n, s) => n + s.entries.length, 0),
  };
}

function buildEntry(
  kind: PacketItemKind,
  ref: PacketItemRef,
  ctx: {
    factById: Map<string, ExtractedDataPoint>;
    docById: Map<string, ResearchDocument>;
    conflictById: Map<string, Discrepancy>;
    labels: Record<string, string>;
    planSummary?: string | null;
  },
): Omit<PacketEntry, 'note'> | null {
  switch (kind) {
    case 'fact': {
      const f = ctx.factById.get(ref.refId);
      if (!f) return null;
      const review = reviewMeta(f);
      return {
        refId: f.id,
        heading: `${f.data_category.replace(/_/g, ' ')}: ${review.effectiveValue ?? '(rejected)'}`,
        body: f.raw_value,
        provenance: factProvenance(f, ctx.labels),
        unsupported: evidenceFor(f).strength === 'asserted' || review.status === 'unreviewed',
      };
    }
    case 'document': {
      const d = ctx.docById.get(ref.refId);
      if (!d) return null;
      return {
        refId: d.id,
        heading: d.document_label || d.original_filename || 'Untitled document',
        body: d.document_type ? d.document_type.replace(/_/g, ' ') : 'document',
        provenance: documentProvenance(d),
        unsupported: d.readability === 'unreadable',
      };
    }
    case 'conflict': {
      const c = ctx.conflictById.get(ref.refId);
      if (!c) return null;
      const framed = frameConflict(c, { documentLabels: ctx.labels });
      return {
        refId: c.id,
        heading: framed.question,
        // The field check, not a verdict — the packet states conflicts as questions (R20).
        body: framed.fieldCheck,
        provenance: framed.unsourced
          ? 'No source documents are recorded for this conflict — it is a claim, not a finding.'
          : `Sources: ${framed.sides.map((s) => `${s.sourceLabel} (${s.value})`).join(' vs ')}.`,
        unsupported: framed.unsourced,
      };
    }
    case 'plan':
      return {
        refId: ref.refId,
        heading: 'Field plan',
        body: ctx.planSummary ?? 'The field plan is attached separately.',
        provenance: `Survey plan version ${ref.refId}.`,
        unsupported: !ctx.planSummary,
      };
    default:
      // Drawings and imagery are referenced by id; their rendering belongs to the PDF writer.
      return {
        refId: ref.refId,
        heading: SECTION_TITLE[kind],
        body: ref.note ?? '',
        provenance: `${kind} ${ref.refId}.`,
        unsupported: false,
      };
  }
}

// ── Approval ────────────────────────────────────────────────────────────────────────────────────

export interface ApprovalCheck {
  canApprove: boolean;
  reason: string;
}

/** May this packet be approved?
 *
 *  Blocks an empty packet, and warns loudly about unsupported items without blocking them — a
 *  surveyor is entitled to include an unverified lead as long as it is labelled, and refusing would
 *  push people to leave it out of the packet entirely, which is worse. */
export function canApprove(packet: AssembledPacket): ApprovalCheck {
  if (packet.itemCount === 0) {
    return { canApprove: false, reason: 'This packet has nothing in it. Add at least one item before approving.' };
  }
  const unsupported = packet.sections.flatMap((s) => s.entries).filter((e) => e.unsupported).length;
  return {
    canApprove: true,
    reason: unsupported > 0
      ? `Approving ${packet.itemCount} item(s), ${unsupported} of which are unverified and are labelled as such in the packet.`
      : `Approving ${packet.itemCount} item(s), all with a recorded source.`,
  };
}
