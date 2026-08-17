// scripts/scan-inline-style-hex.ts — count hard-coded colours inside inline `style={{…}}` objects.
//
// P10-2, and it is deliberately a RATCHET rather than a rewrite. There are ~14,000 hex literals inside
// inline styles across ~275 files; a rule that failed on all of them would be turned off within a day, and
// a rewrite of that surface is not a slice.
//
// Why it matters at all — this is the concrete cost, not a style preference. A colour written as `#1b0f30`
// inside a `style={{}}` object cannot be reached by:
//   · a design token, so a new skin has to re-specify it;
//   · a media query;
//   · the print stylesheet (P10-3 fixes ink by overriding CSS VARIABLES — an inline hex is invisible to it);
//   · a contrast audit.
// Every theming pass has paid for this, and the print slice is the first one where the cost is written down
// next to the code that causes it.
//
// Usage:
//   npx tsx scripts/scan-inline-style-hex.ts            → print the current counts
//   npx tsx scripts/scan-inline-style-hex.ts --write    → rewrite the baseline (only ever ratcheting DOWN)
import fs from 'node:fs';
import path from 'node:path';

export const BASELINE_PATH = 'scripts/inline-style-hex-baseline.json';

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage']);

function walk(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * Count hex colour literals inside `style={{ … }}` objects in one source string.
 *
 * Brace-matched rather than regex-bounded: a style object routinely contains nested objects and template
 * literals, and a lazy `style=\{\{[^}]*\}\}` stops at the first inner `}` — which would silently miss every
 * hex after a nested value and report improvement that never happened.
 */
export function countHexInInlineStyles(source: string): number {
  return countHexInMatchedBlocks(source, /style=\{\{/g, 2);
}

/**
 * Count hex colour literals inside a `React.CSSProperties` style object — the SAME defect wearing a
 * different costume, and for two years the one the guard could not see.
 *
 * `JobNotesPanel.tsx` shipped 2026-08-16 as a brand-new file with 30 hard-coded colours and passed
 * the "a new file must have ZERO" rule, because it wrote them as:
 *
 *     const s: Record<string, React.CSSProperties> = { card: { background: '#FFFFFF' } };
 *     <section style={s.card}>
 *
 * There is no `style={{` anywhere in it. The colours are just as unreachable by a design token, a
 * media query, the print stylesheet or a contrast audit — it rendered a white card with near-black
 * text on all four dark skins — but the scanner matched on the SPELLING of the defect rather than on
 * what makes it a defect. Measured when this was added: 1,855 hexes across 103 files hid here,
 * MORE than the 1,624 the ratchet was counting. The hole was bigger than the guard.
 */
export function countHexInStyleObjects(source: string): number {
  // `React.CSSProperties = {`, `Record<string, React.CSSProperties> = {`, `CSSProperties[] = {` …
  // `[^=\n]*` stays on one line so it cannot run past a declaration into an unrelated `= {` below.
  return countHexInMatchedBlocks(source, /CSSProperties[^=\n]*=\s*\{/g, 1);
}

/**
 * Shared brace-matcher for both counters.
 *
 * Brace-matched rather than regex-bounded: a style object routinely contains nested objects and template
 * literals, and a lazy `style=\{\{[^}]*\}\}` stops at the first inner `}` — which would silently miss every
 * hex after a nested value and report improvement that never happened.
 */
function countHexInMatchedBlocks(source: string, re: RegExp, openDepth: number): number {
  let total = 0;
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(source))) {
    let i = m.index + m[0].length;
    let depth = openDepth; // the brace(s) the pattern already consumed
    while (i < source.length && depth > 0) {
      const c = source[i];
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      i += 1;
    }
    // Comments are stripped BEFORE counting, and that is not tidiness.
    //
    // Caught 2026-08-17: a style object gained the comment *"the older styles in this file mix raw
    // hex (`#666`, `#ccc`) which is invisible in one of the two themes"* — and this scanner counted
    // both, reporting a two-colour regression for a note explaining that hard-coded colours are bad.
    // A guard that fires on prose about the thing it guards teaches people to stop writing the prose.
    //
    // `theme-vars-are-adopted.test.ts` already strips comments for exactly this reason, and its note
    // says it was the fifth time that day a check in this repo read prose as code.
    const block = source.slice(m.index, i)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    // 3–8 digits covers #abc, #aabbcc and the 4/8-digit alpha forms.
    total += (block.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length;
  }
  return total;
}

/** Both spellings of the same defect: a colour a token cannot reach. */
export function countHexInFile(source: string): number {
  return countHexInInlineStyles(source) + countHexInStyleObjects(source);
}

/** `{ 'app/foo/Bar.tsx': 12 }` for every file with at least one, POSIX-separated so the baseline is
 *  identical on Windows and CI. */
export function scanRepo(root = process.cwd(), dirs = ['app', 'lib']): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const d of dirs) {
    for (const file of walk(path.join(root, d))) {
      const n = countHexInFile(fs.readFileSync(file, 'utf8'));
      if (n > 0) counts[path.relative(root, file).split(path.sep).join('/')] = n;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

export function readBaseline(root = process.cwd()): Record<string, number> {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, BASELINE_PATH), 'utf8')) as Record<string, number>;
  } catch {
    return {};
  }
}

/**
 * What has got WORSE since the baseline.
 *
 * A file absent from the baseline must have zero — that is the whole point: new code does not add to the
 * pile. A file present may not exceed its recorded count.
 */
export function regressions(current: Record<string, number>, baseline: Record<string, number>) {
  const out: { file: string; was: number; now: number }[] = [];
  for (const [file, now] of Object.entries(current)) {
    const was = baseline[file] ?? 0;
    if (now > was) out.push({ file, was, now });
  }
  return out.sort((a, b) => b.now - b.was - (a.now - a.was));
}

/** Files that improved — the baseline should be tightened to lock the win in. */
export function improvements(current: Record<string, number>, baseline: Record<string, number>) {
  const out: { file: string; was: number; now: number }[] = [];
  for (const [file, was] of Object.entries(baseline)) {
    const now = current[file] ?? 0;
    if (now < was) out.push({ file, was, now });
  }
  return out;
}

if (require.main === module) {
  const root = process.cwd();
  const current = scanRepo(root);
  const baseline = readBaseline(root);
  const total = Object.values(current).reduce((a, b) => a + b, 0);
  const bad = regressions(current, baseline);
  const good = improvements(current, baseline);

  console.log(`${total} hex literals inside inline styles, across ${Object.keys(current).length} files.`);
  if (good.length) console.log(`${good.length} file(s) improved — run with --write to lock that in.`);
  if (bad.length) {
    console.log(`\n${bad.length} file(s) got worse:`);
    for (const r of bad) console.log(`  ${r.file}: ${r.was} → ${r.now}`);
  }

  if (process.argv.includes('--write') || process.argv.includes('--widen')) {
    // `--write` only ever ratchets DOWN. Writing a higher number would turn the guard into a rubber
    // stamp — the one failure mode a baseline has, and the reason `--write` is not simply "record
    // whatever is there".
    //
    // `--widen` is the ONE legitimate exception and is deliberately a different flag: when the
    // COUNTER learns to see a defect it was blind to, every affected file's number jumps through no
    // change in the code, and `Math.min` would fail the whole repo at once. It records current as-is,
    // grandfathering newly-visible debt — which is still strictly better than the nothing that was
    // guarding it. Use it only in the commit that widens coverage, never to make a red build green.
    const widen = process.argv.includes('--widen');
    const next: Record<string, number> = {};
    for (const [file, now] of Object.entries(current)) {
      const was = baseline[file];
      next[file] = was == null || widen ? now : Math.min(was, now);
    }
    fs.writeFileSync(path.join(root, BASELINE_PATH), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    console.log(`\nWrote ${BASELINE_PATH}${widen ? ' (WIDENED — coverage expansion)' : ''}.`);
  } else if (bad.length) {
    process.exitCode = 1;
  }
}
