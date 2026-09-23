// lib/research/county-key.ts — the one spelling of a county the library is stored under.
//
// ── WHY THIS IS DUPLICATED FROM THE WORKER ──────────────────────────────────────────────────────
//
// `worker/src/research/document-library.ts` holds the same function. The worker is a separate Node
// service with its own tsconfig and its own build; the Next app cannot import from it, and the
// worker cannot import from `lib/`. Copying twelve lines is the smaller cost — the alternative is a
// shared package for one pure function, and the failure that matters is not duplication but the two
// sides DISAGREEING, which is what `__tests__/research/county-key-agrees.test.ts` checks.
//
// Three places had their own normaliser before the library existed: the seed wrote `bell`, the
// purchase ledger wrote `BELL`, and a lookup asked for `Bell County`. A library that answers "no"
// because it was asked in the wrong case is worse than no library — the run silently pays for a
// document the firm already owns.

/** FIPS digits when we have them, else the bare county name lower-cased. */
export function libraryCountyKey(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  const digits = s.replace(/\D/g, '');
  if (digits.length >= 4) return digits.padStart(5, '0');
  return s.replace(/\s+county\s*$/i, '').trim().toLowerCase();
}
