// lib/receipts/reread-corrections.ts — when a closer reading may change what is stored, and when not.
//
// The save step used to be fill-if-empty: once the old single-look reader had written a value, no
// later reading could change it. That is right for anything a PERSON entered, and wrong for a value
// the old reader got wrong — e.g. a Taco Bell receipt stored as $28.98 + $2.38 against a printed
// $30.94 total, which the zoomed two-read reader reads correctly as $28.58 + $2.36 (2026-10-07).
//
// So, with the new reader:
//   * a value a person typed — at upload (declared_by_submitter) or in a later edit
//     (user_review_edits) — is NEVER replaced;
//   * a value the AI set is replaced when the new reading is 'agreed' or 'verified', and the change
//     is recorded (from → to) so it can be seen and undone;
//   * when the receipt itself disagrees with what a person typed on a field that matters (the total,
//     the date), it is not overwritten — it is flagged, and the flag must be checked before the
//     period can be locked (lib/receipts/audit-readiness.ts).
// Pure: everything is passed in.

export const CORRECTABLE = [
  'vendor_name', 'vendor_address', 'transaction_at', 'subtotal_cents', 'tax_cents', 'tip_cents',
  'total_cents', 'payment_method', 'payment_last4',
] as const;
type Field = (typeof CORRECTABLE)[number];

/** The fields a submitter types on the upload form (lib/receipts/required-fields.ts). */
export const DECLARED_FIELDS: ReadonlySet<string> = new Set(['vendor_name', 'transaction_at', 'total_cents', 'category']);

/** Every field a person has ever changed by hand, from the user_review_edits log. Pure. */
export function humanEditedFields(edits: unknown): Set<string> {
  const out = new Set<string>();
  if (!edits || typeof edits !== 'object') return out;
  for (const entry of Object.values(edits as Record<string, unknown>)) {
    const changed = (entry as { changed?: Record<string, unknown> } | null)?.changed;
    if (changed && typeof changed === 'object') for (const k of Object.keys(changed)) out.add(k);
  }
  return out;
}

const day = (v: unknown) => (typeof v === 'string' ? v.slice(0, 10) : null);

function differs(field: Field, a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a !== b;
  if (field === 'transaction_at') return day(a) !== day(b);
  if (field === 'vendor_name' || field === 'vendor_address') return String(a).trim().toLowerCase() !== String(b).trim().toLowerCase();
  return String(a) !== String(b);
}

export interface CorrectionPlan {
  /** Fields to write, and the values. */
  set: Partial<Record<Field, unknown>>;
  /** What changed, for the record and for undo. */
  corrections: Array<{ field: Field; from: unknown; to: unknown }>;
  /** Where the paper disagrees with what a person entered — flagged, never overwritten. */
  conflicts: Array<{ field: Field; entered: unknown; read: unknown; message: string }>;
}

export function planCorrections(input: {
  current: Partial<Record<Field, unknown>>;
  read: Partial<Record<Field, unknown>>;
  readStatus: 'agreed' | 'verified' | 'needs_review' | null;
  declaredBySubmitter: boolean;
  humanEdited: Set<string>;
}): CorrectionPlan {
  const plan: CorrectionPlan = { set: {}, corrections: [], conflicts: [] };
  const confident = input.readStatus === 'agreed' || input.readStatus === 'verified';
  for (const f of CORRECTABLE) {
    const now = input.current[f];
    const read = input.read[f];
    if (read == null || !differs(f, now, read)) continue;
    const byPerson = input.humanEdited.has(f) || (input.declaredBySubmitter && DECLARED_FIELDS.has(f));
    if (byPerson) {
      if ((f === 'total_cents' || f === 'transaction_at') && now != null && confident) {
        plan.conflicts.push({
          field: f, entered: now, read,
          message: f === 'total_cents'
            ? `The receipt reads a total of $${(Number(read) / 100).toFixed(2)}, but $${(Number(now) / 100).toFixed(2)} was entered — check which is right.`
            : `The receipt reads the date ${day(read)}, but ${day(now)} was entered — check which is right.`,
        });
      }
      continue;
    }
    if (now == null || confident) {
      plan.set[f] = read;
      if (now != null) plan.corrections.push({ field: f, from: now, to: read });
    }
  }
  return plan;
}
