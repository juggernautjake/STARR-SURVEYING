// __tests__/_helpers/source.ts — read a source file the way an assertion needs it.
//
// 755 test files in this repo read source with `fs.readFileSync` and assert against its text. That
// is a deliberate and useful style here: it is how "authored but not wired" gets caught, and it is
// why several defects this codebase produces were found at all.
//
// It has two failure modes that have each bitten repeatedly, and both are invisible — they do not
// make a test fail loudly at the moment the mistake is made. They make it pass, or fail, for a
// reason unrelated to the code under test.
//
// ── 1. LINE ENDINGS ─────────────────────────────────────────────────────────────────────────────
//
// The working tree is CRLF. An assertion carrying a bare `\n` in its expected string can only match
// on a checkout that happens to be LF — so it passes when written and fails the moment git
// normalises the file, with nothing about the subject having changed. **Eight instances in a single
// day**, in three shapes: negative controls that silently modified nothing, a source-slice
// (`indexOf('}\n\n')` → −1 → `slice(0, -1)`) that swallowed an entire file and read the wrong
// function, and exact-match assertions.
//
// `readSource` normalises to LF. Expected strings can then be written the obvious way.
//
// ── 2. COMMENTS ARE NOT CODE ────────────────────────────────────────────────────────────────────
//
// This codebase documents its reasoning heavily, so **prose containing the very identifier a check
// searches for is the common case, not an edge one.** Five instances in a day: an AI-spend ratchet
// credited a file as migrated because a comment named the module it should import; a reachability
// guard passed with its caller deleted because a comment mentioned the function; a CSS check failed
// because the comment explaining a removal contained the property it asserted was gone.
//
// `codeOf` strips comments. Use it for any "does this file DO x" question. Keep the raw text only
// when the question is genuinely about the prose.

import fs from 'node:fs';
import path from 'node:path';

/** Read a repo file with line endings normalised to `\n`. */
export function readSource(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8').replace(/\r\n/g, '\n');
}

/**
 * The same text with comments removed — `/* … *\/`, and `//` to end of line while leaving `://`
 * alone so URLs survive.
 *
 * Deliberately not a parser. It is wrong on a `//` inside a string literal, which is rare in the
 * files these checks read and always fails in the safe direction: it removes text, so a check can
 * only lose a match, never gain a false one.
 */
export function codeOf(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Read and strip in one step — the form most checks want. */
export function readCode(relPath: string): string {
  return codeOf(readSource(relPath));
}

// ── A DETECTOR WAS ATTEMPTED AND DELETED, 2026-08-04 ────────────────────────────────────────────
//
// The obvious companion to this file is a guard that keeps the offender count at zero: scan every
// source-reading test for a multi-line expected string with no normalisation, and fail on any.
//
// It was written, and it reported three offenders — `payment-deeplink-attempts`,
// `native-file-open`, `encumbrance-rollup`. Running the identical functions over the identical
// files from a standalone script reported **zero matches in all three**, and the discrepancy did
// not resolve: same regexes, same comment-stripping, same paths, different answers.
//
// It was deleted rather than shipped. **A guard whose result cannot be reproduced or explained is
// worse than no guard** — it either fails for reasons nobody can act on, or it teaches people to
// add a meaningless `.replace()` to silence it, which is how a check becomes a ritual. The same
// judgement this repo applies to a control that "passes" without changing anything.
//
// The detector is also the weaker half. It was only ever going to be file-level, so it would flag
// `expect(contents).toBe('999,begin\n')` — a data assertion in a file that happens to read source
// elsewhere — and a check with unavoidable false positives trains people to ignore it.
//
// So the durable fix is this helper plus the rule, not a scanner: **use `readSource()` for any
// assertion against file text.** Eight instances were fixed by hand the day this was written, and
// each carries the reason inline where the next reader will meet it.
