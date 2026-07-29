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
  let total = 0;
  const re = /style=\{\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    let i = m.index + m[0].length;
    let depth = 2; // the two braces just consumed
    while (i < source.length && depth > 0) {
      const c = source[i];
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      i += 1;
    }
    // 3–8 digits covers #abc, #aabbcc and the 4/8-digit alpha forms.
    total += (source.slice(m.index, i).match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length;
  }
  return total;
}

/** `{ 'app/foo/Bar.tsx': 12 }` for every file with at least one, POSIX-separated so the baseline is
 *  identical on Windows and CI. */
export function scanRepo(root = process.cwd(), dirs = ['app', 'lib']): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const d of dirs) {
    for (const file of walk(path.join(root, d))) {
      const n = countHexInInlineStyles(fs.readFileSync(file, 'utf8'));
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

  if (process.argv.includes('--write')) {
    // Only ever ratchets DOWN. Writing a higher number would turn the guard into a rubber stamp — the
    // one failure mode a baseline has, and the reason `--write` is not simply "record whatever is there".
    const next: Record<string, number> = {};
    for (const [file, now] of Object.entries(current)) {
      const was = baseline[file];
      next[file] = was == null ? now : Math.min(was, now);
    }
    fs.writeFileSync(path.join(root, BASELINE_PATH), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    console.log(`\nWrote ${BASELINE_PATH}.`);
  } else if (bad.length) {
    process.exitCode = 1;
  }
}
