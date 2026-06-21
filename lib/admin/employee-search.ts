// lib/admin/employee-search.ts
//
// Shared people-search predicate for the admin employee/student lists
// (the list view in app/admin/employees/page.tsx and the Interactive
// "pond" view in EmployeePond.tsx). Both surfaces import this so the
// search bar behaves identically.
//
// Semantics (user request 2026-06-20): the typed string must be a
// PREFIX of the person's first name, last name, or email — NOT an
// out-of-order substring found anywhere. So typing "a" surfaces
// Andy / Arnold / Audey, but typing "e" does NOT surface Audey / Annie
// / Henry (the "e" is mid-word). "Au" → Audey, "Ann" → Annie, "Hen" →
// Henry. The same prefix rule applies to the email (its full form, its
// local part, and the dot/underscore/hyphen-separated chunks of the
// local part) and to last names. Role matching is intentionally NOT
// part of the text search — the role dropdown owns that.
//
// Spec: docs/planning/in-progress/SITEWIDE_UI_CONSISTENCY_AUDIT_2026-06-20.md §U1.

/** Build the set of candidate tokens a query may prefix-match against:
 *  each whitespace-separated name word, the full email, the email local
 *  part, and the local part split on `.`/`_`/`-`. All lower-cased. */
export function buildPersonSearchTokens(name: string, email: string): string[] {
  const tokens: string[] = [];

  const nm = (name || '').trim().toLowerCase();
  if (nm) tokens.push(...nm.split(/\s+/).filter(Boolean));

  const em = (email || '').trim().toLowerCase();
  if (em) {
    tokens.push(em); // full email so "audey@st…" works
    const local = em.split('@')[0];
    if (local) {
      tokens.push(local); // local part: "audey"
      // "first.last" / "first_last" / "first-last" → each chunk
      tokens.push(...local.split(/[._-]+/).filter(Boolean));
    }
  }

  return tokens;
}

/** True when `query` prefix-matches the person. An empty/whitespace
 *  query passes everyone. A multi-word query requires EACH word to be a
 *  prefix of some token (so "john sm" matches "John Smith"). */
export function matchesPersonPrefix(
  query: string,
  name: string,
  email: string,
): boolean {
  const q = (query || '').trim().toLowerCase();
  if (q.length === 0) return true;

  const tokens = buildPersonSearchTokens(name, email);
  const words = q.split(/\s+/).filter(Boolean);
  return words.every((w) => tokens.some((t) => t.startsWith(w)));
}
