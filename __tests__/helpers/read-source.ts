// __tests__/helpers/read-source.ts — read a source file with its PROSE removed.
//
// ── WHY THIS EXISTS, AND WHY IT IS SHARED ───────────────────────────────────────────────────────
//
// Wiring tests in this repo assert against real source text: "does the caller actually call this?",
// "is the old broken line really gone?". Those probes keep matching the test author's own comments,
// which frequently QUOTE the code being removed. Counted across this codebase, a probe matching
// prose rather than code is now the single most common way a green test proves nothing.
//
// Two ways it has bitten, both real, both within one session:
//
//   1. `/\*[\s\S]*?\*\//g` looks like it strips block comments. It does — and it also treats the
//      `*` `/` `*` inside an `Accept: */*;q=0.8` header string as an opener, then closes the
//      "comment" 83 lines later, DELETING the code the test was looking for. The test reported
//      missing wiring that was present. In a `not.toContain` assertion the same bug is silent: the
//      deleted region cannot match, so the test passes and proves the opposite of what it claims.
//
//   2. Anchoring the opener to a line start fixes that — and then misses JSX comments, which begin
//      `{/*`. A `not.toContain` on old copy failed against a comment quoting the old copy.
//
// Hence one implementation, with a control built in. Three copies of this helper would have drifted
// three ways, which is exactly what happened to `splitStreetLine` last session.

import fs from 'node:fs';
import path from 'node:path';

/** The file exactly as written. */
export function readSource(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

/**
 * The file with comments removed, so a probe cannot match prose.
 *
 * Openers are anchored to the start of a line (after indentation), optionally preceded by the `{`
 * of a JSX comment. That anchoring is what stops a `*` `/` `*` inside a mid-line string literal from
 * opening a comment that swallows the rest of the file.
 *
 * Line comments match `[^\n\r]*` rather than `.*$`: these files are CRLF, and `$` in multiline mode
 * sits before `\n` — one character past where `.` can reach, so the anchor never lines up.
 *
 * Throws rather than returning wreckage. A test that fails here says "stripping ate the file",
 * which is a debuggable sentence; the same failure inside an assertion reads like missing wiring.
 */
export function readCode(relPath: string): string {
  const raw = readSource(relPath);
  const stripped = raw
    .replace(/^[ \t]*\{?\/\*[\s\S]*?\*\/\}?/gm, '')
    .replace(/^[ \t]*\/\/[^\n\r]*/gm, '');

  if (!stripped.includes('import')) {
    throw new Error(
      `comment stripping destroyed ${relPath}: ${raw.length} chars in, ${stripped.length} out. ` +
      `A mid-line "*/" or "/*" inside a string literal is the usual cause.`,
    );
  }
  return stripped;
}
