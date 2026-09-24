// lib/research/surveyor-verification.ts — checking a plat's surveyor against the State's register.
//
// Owner, 2026-09-24: "Is there a name associated with the rpls number? Is there a way to look up
// that number and name and make sure they match. Would this improve the certainty?"
//
// ── WHY THIS MATTERS MORE THAN THE CONFIDENCE RATING ────────────────────────────────────────────
//
// The catalogue rates its own certainty per field, and that rating is genuinely useful for
// legibility — it knows when a mark is smudged. It is useless for this, and measurably so.
//
// Measured on 145 name+number pairs from the first 198 Bell plats, against the TBPELS roster:
// 44% matched, 49% did not, 4% were not licence numbers at all — and **65 of the wrong readings
// were rated "high"**. The reason is simple and not a flaw in the model: reading CHARLES C LIGORI
// off a stamped seal IS a confident reading of those glyphs. Nothing in the image says that no such
// surveyor exists. Only an external register knows that.
//
// So the two checks answer different questions and both are needed:
//
//     confidence  — could I read this?          (self-reported, good at smudges)
//     roster      — is this a real licensee?    (external, good at plausible-but-wrong)
//
// ── IT REPAIRS, IT DOES NOT ONLY FLAG ───────────────────────────────────────────────────────────
//
// Of 69 disagreements, 59 were a name that IS on the roster under a different number — a
// single-digit misread of a seal: CHARLES C LUCKO read as 4606, on the roster at 4636, across
// fifteen sheets. When a misread number resolves to exactly one licensee by name, the roster hands
// back the right number, and the sheet is better than it was before we looked.
//
// ── WHY A CORRECTION IS STILL NOT AS GOOD AS A MATCH ────────────────────────────────────────────
//
// `corrected` is kept as its own verdict rather than being folded into `confirmed`, because the two
// carry different risk. A confirmed pair agreed with the register on both halves. A corrected one
// agreed on the name and overrode the number — which is right far more often than not, and is still
// an inference. A surveyor citing the licence number of a 1963 plat should be able to see which of
// those two they are standing on.

/** Digits only, no leading zeros — the shape `surveyor_roster.rpls_number` is stored in. */
export function normaliseLicence(raw: string | null | undefined): string {
  return String(raw ?? '').replace(/\D/g, '').replace(/^0+(?=.)/, '');
}

/** Upper case, letters and single spaces only — so "Charles L. Miller" and "CHARLES L MILLER" meet. */
export function normalisePersonName(raw: string | null | undefined): string {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Edit distance, for tolerating one or two misread characters in a surname. */
export function editDistance(a: string, b: string): number {
  const m = a.length; const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur: number[] = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export interface RosterEntry {
  rpls_number: string;
  status: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  full_name?: string | null;
}

export type SurveyorVerdict =
  /** The name we read is the licensee the register lists at that number. */
  | 'confirmed'
  /** The name resolves to exactly one licensee, at a DIFFERENT number. The register wins. */
  | 'corrected'
  /** The number exists but names somebody else, and the name resolves to nobody. */
  | 'unmatched'
  /** The number is not on the register at all — usually too many digits to be a licence. */
  | 'not_a_licence'
  /** Nothing to check: no name, or no number. */
  | 'incomplete';

export interface VerificationResult {
  verdict: SurveyorVerdict;
  /** What was read off the sheet. */
  readName: string | null;
  readLicence: string | null;
  /** What the register says, when it says anything. */
  rosterName: string | null;
  rosterLicence: string | null;
  rosterStatus: string | null;
  /** Said in words, for the person looking at the document rather than the code reading it. */
  note: string;
}

/** Two names are the same person when the surname is within a character or two and a given name agrees. */
function sameePerson(readName: string, entry: RosterEntry): boolean {
  const parts = normalisePersonName(readName).split(' ').filter(Boolean);
  if (!parts.length) return false;
  const ourLast = parts[parts.length - 1];
  const ourFirst = parts[0];
  const rosterLast = normalisePersonName(entry.last_name);
  const rosterFirstAll = normalisePersonName(entry.first_name);
  const rosterFirst = rosterFirstAll.split(' ')[0] ?? '';
  const rosterMiddle = normalisePersonName(entry.middle_name).split(' ')[0] ?? '';

  // The given name has to agree somehow. The register writes "GARLAND GALE ARNOLD" where the seal
  // says "GALE ARNOLD" — a person known by their middle name, which is common enough on these
  // sheets that ignoring it would throw away real matches.
  const firstOk = ourFirst === rosterFirst
    || editDistance(ourFirst, rosterFirst) <= 1
    || ourFirst === rosterMiddle
    || rosterFirstAll.split(' ').includes(ourFirst);
  if (!firstOk) return false;
  // Two on the surname: enough for LUCKO/LICKO, not enough to merge HAAS with HALE… which it does
  // merge, and that is why a name match alone never overrides a number match.
  return editDistance(ourLast, rosterLast) <= 2;
}

const displayName = (e: RosterEntry) =>
  [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

/**
 * Check one surveyor reading against the register.
 *
 * `byNumber` is the entry at the licence number we read, if any. `byName` is every entry whose name
 * could be the name we read — the caller supplies it because the lookup differs between the worker
 * (one indexed query) and a bulk sweep (an in-memory map over 5,400 rows).
 */
export function verifySurveyor(
  readName: string | null | undefined,
  readLicence: string | null | undefined,
  byNumber: RosterEntry | null | undefined,
  byName: readonly RosterEntry[] = [],
): VerificationResult {
  const name = normalisePersonName(readName);
  const licence = normaliseLicence(readLicence);
  const base = { readName: name || null, readLicence: licence || null, rosterName: null, rosterLicence: null, rosterStatus: null };

  if (!name || !licence) {
    return { ...base, verdict: 'incomplete', note: 'The sheet gave a name or a licence number, but not both, so there is nothing to cross-check.' };
  }

  // The number names this person: the strongest answer, and the common one.
  if (byNumber && sameePerson(name, byNumber)) {
    return {
      ...base,
      verdict: 'confirmed',
      rosterName: displayName(byNumber), rosterLicence: byNumber.rpls_number, rosterStatus: byNumber.status ?? null,
      note: `The State register lists ${displayName(byNumber)} at RPLS ${byNumber.rpls_number}${byNumber.status ? ` (${byNumber.status.toLowerCase()})` : ''}, which is the name on the sheet.`,
    };
  }

  // The name resolves to exactly one licensee at another number — a misread digit on the seal.
  // ONE, not the closest of several: picking a winner from an ambiguous set is how a wrong licence
  // number gets recorded with more authority than the one we started with.
  const candidates = byName.filter((e) => sameePerson(name, e));
  const unique = new Set(candidates.map((e) => e.rpls_number));
  if (unique.size === 1) {
    const e = candidates[0];
    return {
      ...base,
      verdict: 'corrected',
      rosterName: displayName(e), rosterLicence: e.rpls_number, rosterStatus: e.status ?? null,
      note: `The sheet reads RPLS ${licence}, but the State register has ${displayName(e)} at RPLS ${e.rpls_number}${e.status ? ` (${e.status.toLowerCase()})` : ''} and no licensee of that name at ${licence}. The number was most likely misread.`,
    };
  }

  if (!byNumber) {
    return { ...base, verdict: 'not_a_licence', note: `RPLS ${licence} is not on the State register, and no licensee matching "${name}" was found. It is probably not a licence number.` };
  }
  return {
    ...base,
    verdict: 'unmatched',
    rosterName: displayName(byNumber), rosterLicence: byNumber.rpls_number, rosterStatus: byNumber.status ?? null,
    note: `The sheet reads "${name}" at RPLS ${licence}, but the State register lists ${displayName(byNumber)} at that number. One of the two was misread and the register does not settle which.`,
  };
}

/** May this reading be relied on without somebody opening the sheet? */
export function verifiedEnoughToCite(v: VerificationResult | null | undefined): boolean {
  // `corrected` is deliberately included: a name matched against the register and a number supplied
  // BY the register is better evidence than an unverified pair, which is what the alternative is.
  return v?.verdict === 'confirmed' || v?.verdict === 'corrected';
}

/** The one-word badge a person sees beside the surveyor on the document. */
export function verdictLabel(verdict: SurveyorVerdict): string {
  switch (verdict) {
    case 'confirmed': return 'Verified against the State register';
    case 'corrected': return 'Licence number corrected from the State register';
    case 'unmatched': return 'Does not match the State register';
    case 'not_a_licence': return 'Not a licence number on the register';
    default: return 'Not checked';
  }
}
