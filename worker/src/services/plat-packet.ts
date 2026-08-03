// worker/src/services/plat-packet.ts — the plat packet, and whether we actually have the plats
// (plan R15).
//
// ── WHAT R15 LEFT ───────────────────────────────────────────────────────────────────────────────
//
// R15's acceptance is: *"for a platted lot the packet contains the governing plat and every later
// instrument that modified it."*
//
// `plat-history.ts` answered the hard half — which plat CONTROLS this lot, per lot, because a replat
// almost never covers a whole subdivision. It even exports `platPacketFor()` to assemble the list.
// Nothing called it. `PlatInstrument.imagePaths` was declared and never populated.
//
// So the pipeline named the governing plat and stopped. The packet held an instrument number.
//
// ── "CONTAINS THE GOVERNING PLAT" IS NOT "KNOWS ITS NUMBER" ─────────────────────────────────────
//
// That distinction is the whole of this module, and it is the same defect this platform keeps
// finding in new places. A lot governed by "Replat, Instrument 2004-11872" with no image attached
// looks, in a rendered packet, exactly like a lot whose replat is sitting there to be opened. The
// surveyor discovers the difference in the field.
//
// Worse, it is the SUPERSEDED plat we are most likely to actually hold — it is the one the original
// harvest found, because it is the one the CAD and the deed reference. So the failure is not evenly
// distributed: the packet is most likely to be missing an image for exactly the document that
// governs, while showing one for the document that does not.
//
// Every entry therefore carries an `imageStatus`, and `not_checked` is a distinct value from
// `not_held`. A run with no document list to compare against has not established that a plat is
// missing — it has not looked — and reporting that as "missing" would send somebody to the
// courthouse for a document already on disk.

import { instrumentKey } from './purchase-ledger.js';
import type { GoverningPlat, PlatHistoryEntry, PlatKind } from './plat-history.js';
import { platPacketFor } from './plat-history.js';

/** A document this run holds, reduced to what matching needs. */
export interface HeldPlatDocument {
  /** Instrument number as the source wrote it. */
  instrument: string;
  documentLabel?: string | null;
  pagesPdfUrl?: string | null;
  pageCount?: number | null;
}

export type PlatImageStatus =
  /** We hold page images for this instrument. */
  | 'held'
  /** We looked and we do not hold it. */
  | 'not_held'
  /** No document list was supplied, so nothing was established either way. */
  | 'not_checked';

export type PlatRole = 'governing' | 'modifies' | 'superseded';

export interface PlatPacketEntry {
  instrument: string;
  role: PlatRole;
  kind: PlatKind;
  recordingDate: string;
  imageStatus: PlatImageStatus;
  documentLabel: string | null;
  pagesPdfUrl: string | null;
  pageCount: number | null;
  statement: string;
}

export interface PlatPacket {
  lotName: string;
  entries: PlatPacketEntry[];
  /** The one that decides where the boundary is. */
  governingInstrument: string | null;
  governingImageStatus: PlatImageStatus | null;
  vacated: boolean;
  /** The headline a reviewer reads first. */
  statement: string;
  /** Errands, in the same voice as the chain gap list: specific and actionable. */
  nextSteps: string[];
}

/** Normalise a plat identifier for matching.
 *
 *  `research_documents` has no instrument column — the instrument reaches us inside
 *  `original_filename`, which the uploader builds as `<category>_<sanitised instrument>`
 *  (`plat_2004-11872`). So the category prefix is stripped here, and then the purchase ledger's
 *  `instrumentKey` does the rest.
 *
 *  Both sides go through this one function on purpose. Stripping the prefix at the point of loading
 *  and comparing somewhere else means two places have to agree about the filename convention, and
 *  the moment they stop agreeing every plat we hold is reported as missing — which is a work list
 *  made of documents already on disk. */
export function platMatchKey(raw: string): string {
  const withoutCategory = (raw ?? '').replace(/^[a-z]+_(?=.)/i, '');
  return instrumentKey(withoutCategory);
}

/** Match a plat instrument against the documents this run holds.
 *
 *  Not string equality, for the same reason the purchase ledger is not: a plat cited as `2004-11872`
 *  and stored as `200411872` is one document, and a literal comparison would report a plat we are
 *  holding as missing — sending somebody to the courthouse for it. */
export function findHeldPlat(
  instrument: string,
  held: HeldPlatDocument[],
): HeldPlatDocument | null {
  if (!instrument) return null;
  const want = platMatchKey(instrument);
  if (!want) return null;
  return held.find((d) => d.instrument && platMatchKey(d.instrument) === want) ?? null;
}

function describeEntry(
  entry: PlatHistoryEntry,
  role: PlatRole,
  status: PlatImageStatus,
  doc: HeldPlatDocument | null,
): string {
  const date = entry.recordingDate ? ` (${entry.recordingDate.slice(0, 10)})` : '';
  const what = `${entry.kind} plat ${entry.instrument}${date}`;

  switch (status) {
    case 'held':
      return `${what} — ${role}, ${doc?.pageCount ?? 'unknown'} page(s) held.`;
    case 'not_held':
      return role === 'governing'
        ? `${what} — GOVERNS this lot, and we do NOT hold a copy. The packet names it but does not contain it.`
        : `${what} — ${role}, no copy held.`;
    case 'not_checked':
    default:
      return `${what} — ${role}; whether we hold a copy was not checked.`;
  }
}

/** Assemble one lot's plat packet, and say what of it we actually have.
 *
 *  `held` being undefined means "no document list was supplied" and yields `not_checked` throughout.
 *  An EMPTY array is a different statement — we looked and hold nothing — and is reported as
 *  `not_held`. Collapsing the two would turn "we did not check" into "it is missing". */
export function assemblePlatPacket(
  lotName: string,
  governing: GoverningPlat,
  held?: HeldPlatDocument[],
): PlatPacket {
  const entries: PlatPacketEntry[] = [];

  const roleOf = (e: PlatHistoryEntry): PlatRole => {
    if (governing.governing && e.instrument === governing.governing.instrument) return 'governing';
    return governing.modifiedBy.some((m) => m.instrument === e.instrument) ? 'modifies' : 'superseded';
  };

  for (const e of platPacketFor(governing)) {
    const doc = held ? findHeldPlat(e.instrument, held) : null;
    const status: PlatImageStatus = !held ? 'not_checked' : doc ? 'held' : 'not_held';
    const role = roleOf(e);
    entries.push({
      instrument: e.instrument,
      role,
      kind: e.kind,
      recordingDate: e.recordingDate ?? '',
      imageStatus: status,
      documentLabel: doc?.documentLabel ?? null,
      pagesPdfUrl: doc?.pagesPdfUrl ?? null,
      pageCount: doc?.pageCount ?? null,
      statement: describeEntry(e, role, status, doc),
    });
  }

  const governingEntry = entries.find((e) => e.role === 'governing') ?? null;
  const nextSteps: string[] = [];
  const parts: string[] = [];

  if (governing.vacated) {
    // Ordered first deliberately: a vacated lot is not a lot, and a packet that leads with plat
    // paperwork buries the one fact that changes what the crew is being sent to do.
    parts.push(`${lotName}: the governing plat was VACATED — this may no longer exist as a platted lot.`);
    nextSteps.push(`Confirm ${lotName} still exists as a platted lot before surveying it as one.`);
  }

  if (!governingEntry) {
    parts.push(`${lotName}: no governing plat was identified, so no plat in this packet can be relied on for its dimensions.`);
    nextSteps.push(`Identify the controlling plat for ${lotName} before reading dimensions off any of these.`);
  } else if (governingEntry.imageStatus === 'not_held') {
    parts.push(
      `${lotName}: governed by ${governingEntry.kind} plat ${governingEntry.instrument}, which is NOT in this packet — ` +
        `only its number is. Dimensions must not be read from the superseded plats below.`,
    );
    nextSteps.push(`Pull plat ${governingEntry.instrument} — it governs ${lotName} and we do not have it.`);
  } else if (governingEntry.imageStatus === 'not_checked') {
    parts.push(
      `${lotName}: governed by ${governingEntry.kind} plat ${governingEntry.instrument}; whether a copy is held was not checked.`,
    );
  } else {
    parts.push(`${lotName}: governed by ${governingEntry.kind} plat ${governingEntry.instrument}, which is in this packet.`);
  }

  const superseded = entries.filter((e) => e.role === 'superseded');
  const supersededHeld = superseded.filter((e) => e.imageStatus === 'held').length;
  if (superseded.length > 0) {
    // Superseded plats stay in the packet — they describe the monumentation actually in the ground —
    // but a reader has to be able to tell at a glance which of these does NOT control the lot.
    parts.push(
      `${superseded.length} superseded plat(s) are included for the monumentation they describe` +
        `${supersededHeld > 0 ? `, ${supersededHeld} with images` : ''}; none of them governs this lot.`,
    );
  }

  for (const e of entries) {
    if (e.role !== 'governing' && e.imageStatus === 'not_held') {
      nextSteps.push(`Pull ${e.kind} plat ${e.instrument} (${e.role}) — named in this packet, not held.`);
    }
  }

  return {
    lotName,
    entries,
    governingInstrument: governingEntry?.instrument ?? null,
    governingImageStatus: governingEntry?.imageStatus ?? null,
    vacated: governing.vacated,
    statement: parts.join(' '),
    nextSteps,
  };
}

/** One line over every lot, for the run log and the packet header.
 *
 *  Leads with what is MISSING. "38 lots, 12 governing plats not held" reads as a work list; "38 lot
 *  plat packets assembled" reads as completion, and the two describe the same run. */
export function summarisePlatPackets(packets: PlatPacket[]): string {
  if (packets.length === 0) return 'No platted lots, so no plat packets.';

  const missing = packets.filter((p) => p.governingImageStatus === 'not_held');
  const unchecked = packets.filter((p) => p.governingImageStatus === 'not_checked');
  const vacated = packets.filter((p) => p.vacated);

  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(
      `${missing.length} of ${packets.length} lot(s) are governed by a plat we do NOT hold — ` +
        `named in the packet, not contained in it: ${missing.map((p) => p.governingInstrument).filter(Boolean).join(', ')}.`,
    );
  }
  if (unchecked.length > 0) {
    parts.push(`${unchecked.length} lot(s) had no document list to check against — not established either way.`);
  }
  if (missing.length === 0 && unchecked.length === 0) {
    parts.push(`All ${packets.length} lot(s) have their governing plat in the packet.`);
  }
  if (vacated.length > 0) {
    parts.push(`${vacated.length} lot(s) sit on a VACATED plat and may no longer exist as platted lots.`);
  }
  return parts.join(' ');
}
