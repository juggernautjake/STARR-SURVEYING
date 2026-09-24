// lib/research/surveyor-corroboration.ts — three independent witnesses to one surveyor.
//
// Owner, 2026-09-24: "make sure that whenever we check documents that we can analyze them fully and
// check with other documents for the same rpls number and seal and name and compare that to the
// registry of RPLSs to get more confidence."
//
// ── THREE WITNESSES, AND WHY EACH IS NEEDED ─────────────────────────────────────────────────────
//
//   1. THE READING     — could the reader make out these glyphs?
//                        Good at smudges. Blind to plausible-but-wrong: CHARLES C LIGORI is a
//                        confident reading of a seal, and no such surveyor exists. Measured: 65 of
//                        the wrong name/licence pairs were rated "high".
//
//   2. THE ARCHIVE     — do other sheets bearing this licence say the same name?
//                        Measured on 198 plats: RPLS 4606 was read as CHARLES C LUCKO on fifteen
//                        sheets and as LICKO, LUDWIG, LUCE, LUCIO, LIGORI, LUSK, LUCAS, LOCKE and
//                        LUCKEY once each. The consensus is not subtle. This witness costs nothing,
//                        needs no network, and gets STRONGER as the archive grows — which is the
//                        property the other two do not have.
//
//   3. THE REGISTER    — is this a real licensee, and is this their number?
//                        The only external authority, and the only one that can say a reading is
//                        impossible rather than merely unusual.
//
// They fail differently, which is the whole point of having three. The reading is fooled by a
// legible mistake. The archive is fooled by a mistake repeated across many sheets by the same
// draftsman. The register is silent about anyone it never licensed. Agreement between any two is
// worth more than certainty from one.
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────────────────────────
//
// It does not average the three into a score. A number would hide which witness objected, and the
// objection is the useful part: "the register has never heard of this licence" and "the archive
// reads it differently on nine other sheets" call for completely different responses.

import {
  normaliseLicence, normalisePersonName, editDistance,
  type VerificationResult,
} from './surveyor-verification';

/** One surveyor as read off one sheet. */
export interface SurveyorReading {
  documentId: string;
  documentLabel?: string | null;
  name: string | null;
  licence: string | null;
  /** What the reader said about its own certainty of the licence number. */
  confidence?: string | null;
  /** What the register said, when it has been asked. */
  verification?: VerificationResult | null;
}

/** What the archive itself says about one licence number. */
export interface ArchiveConsensus {
  licence: string;
  /** The name the most sheets agree on, normalised. */
  consensusName: string | null;
  /** How many sheets read that name. */
  agreeing: number;
  /** How many sheets read a materially different name at this licence. */
  dissenting: number;
  /** Every distinct reading, most common first — the evidence, not just the verdict. */
  readings: Array<{ name: string; count: number }>;
}

export type Certainty =
  /** The register confirms it AND the archive agrees. Nothing further to check. */
  | 'verified'
  /** The register settled it; the archive is silent or thin. */
  | 'register_only'
  /** Many sheets agree, but the register does not confirm it. Real for pre-registry work, or a shared mistake. */
  | 'archive_only'
  /** Two witnesses disagree with each other. The most important state, and the one worth a person. */
  | 'disputed'
  /** One sheet, no corroboration, no register match. */
  | 'uncorroborated';

export interface CorroboratedSurveyor {
  reading: SurveyorReading;
  consensus: ArchiveConsensus | null;
  certainty: Certainty;
  /** Said in words, naming which witnesses agreed and which did not. */
  why: string;
}

/** Two names are the same reading for consensus purposes — one or two characters of slop. */
function sameReading(a: string, b: string): boolean {
  if (a === b) return true;
  const pa = a.split(' ').filter(Boolean);
  const pb = b.split(' ').filter(Boolean);
  if (!pa.length || !pb.length) return false;
  // Surname does the work: middle initials come and go between sheets, surnames do not.
  return editDistance(pa[pa.length - 1], pb[pb.length - 1]) <= 1 && pa[0] === pb[0];
}

/**
 * What the archive says about each licence number it has seen.
 *
 * Grouping is by LICENCE, not by name, because the licence is the thing being corroborated: a
 * number read nine ways is a number to distrust, and a name spelled nine ways at one number is the
 * same finding seen from the other side.
 */
export function buildConsensus(readings: readonly SurveyorReading[]): Map<string, ArchiveConsensus> {
  const byLicence = new Map<string, string[]>();
  for (const r of readings) {
    const licence = normaliseLicence(r.licence);
    const name = normalisePersonName(r.name);
    if (!licence || !name) continue;
    if (!byLicence.has(licence)) byLicence.set(licence, []);
    byLicence.get(licence)!.push(name);
  }

  const out = new Map<string, ArchiveConsensus>();
  for (const [licence, names] of byLicence) {
    // Cluster near-identical spellings so fifteen readings of LUCKO and two of LICKO count as
    // seventeen votes for one person rather than two rival candidates.
    const clusters: Array<{ name: string; count: number }> = [];
    for (const n of names) {
      const hit = clusters.find((c) => sameReading(c.name, n));
      if (hit) hit.count += 1;
      else clusters.push({ name: n, count: 1 });
    }
    clusters.sort((a, b) => b.count - a.count);
    const top = clusters[0];
    out.set(licence, {
      licence,
      consensusName: top?.name ?? null,
      agreeing: top?.count ?? 0,
      dissenting: clusters.slice(1).reduce((s, c) => s + c.count, 0),
      readings: clusters,
    });
  }
  return out;
}

/** How many agreeing sheets make the archive a witness worth hearing. Two is a coincidence; three is a pattern. */
export const CORROBORATION_THRESHOLD = 3;

/**
 * Weigh all three witnesses for one reading.
 *
 * The ORDER of these checks is the policy: a dispute is reported before any agreement, because a
 * conflict that gets summarised as "verified" because two of three agreed is exactly the failure
 * this whole layer exists to prevent.
 */
export function corroborate(
  reading: SurveyorReading,
  consensus: Map<string, ArchiveConsensus>,
): CorroboratedSurveyor {
  const licence = normaliseLicence(reading.licence);
  const name = normalisePersonName(reading.name);
  const arch = licence ? consensus.get(licence) ?? null : null;
  const v = reading.verification ?? null;
  const registerAgrees = v?.verdict === 'confirmed';
  const registerCorrected = v?.verdict === 'corrected';
  const registerObjects = v?.verdict === 'unmatched' || v?.verdict === 'not_a_licence';

  const archiveAgrees = Boolean(arch && arch.consensusName && name && sameReading(arch.consensusName, name));
  const archiveIsStrong = Boolean(arch && arch.agreeing >= CORROBORATION_THRESHOLD);
  const minority = Boolean(arch && archiveIsStrong && !archiveAgrees);

  // ── DISPUTES FIRST ────────────────────────────────────────────────────────────────────────────
  if (minority && !registerAgrees) {
    return {
      reading, consensus: arch, certainty: 'disputed',
      why: `${arch!.agreeing} other sheet(s) read RPLS ${licence} as ${arch!.consensusName}; this one reads ${name}. The archive does not support this reading.`,
    };
  }
  if (registerObjects && archiveIsStrong && archiveAgrees) {
    // The archive is consistent and the register disagrees — a shared misreading, or somebody the
    // register never listed. Worth a person either way, and not something to quietly bless.
    return {
      reading, consensus: arch, certainty: 'disputed',
      why: `${arch!.agreeing} sheets agree on ${arch!.consensusName} at RPLS ${licence}, but the State register does not: ${v?.note ?? 'no match'}`,
    };
  }
  if (registerObjects) {
    return { reading, consensus: arch, certainty: 'uncorroborated', why: v?.note ?? 'The State register does not confirm this licence, and no other sheet corroborates it.' };
  }

  // ── AGREEMENT ─────────────────────────────────────────────────────────────────────────────────
  if (registerAgrees && archiveIsStrong && archiveAgrees) {
    return {
      reading, consensus: arch, certainty: 'verified',
      why: `The State register lists ${v?.rosterName} at RPLS ${v?.rosterLicence}, and ${arch!.agreeing} sheets in the archive read the same name at that number.`,
    };
  }
  if (registerAgrees || registerCorrected) {
    return {
      reading, consensus: arch, certainty: 'register_only',
      why: v?.note ?? 'Confirmed against the State register.',
    };
  }
  if (archiveIsStrong && archiveAgrees) {
    return {
      reading, consensus: arch, certainty: 'archive_only',
      why: `${arch!.agreeing} sheets read RPLS ${licence} as ${arch!.consensusName}, but the State register does not confirm it. Common for work predating the register, and worth one look.`,
    };
  }
  return {
    reading, consensus: arch, certainty: 'uncorroborated',
    why: 'One sheet only: no other document carries this licence, and the register does not confirm it.',
  };
}

/** May this be relied on without somebody opening the sheet? */
export function certainEnoughToCite(c: Certainty): boolean {
  // `archive_only` is excluded on purpose. Many sheets agreeing is good evidence that we READ it
  // consistently — it is not evidence that the licence exists, and a draftsman's house style can
  // reproduce the same mistake across every plat a firm ever filed.
  return c === 'verified' || c === 'register_only';
}

export const CERTAINTY_LABEL: Record<Certainty, string> = {
  verified: 'Verified — the register and the archive agree',
  register_only: 'Confirmed against the State register',
  archive_only: 'Corroborated across the archive, not on the register',
  disputed: 'Disputed — the witnesses disagree',
  uncorroborated: 'Uncorroborated — one sheet, unconfirmed',
};
