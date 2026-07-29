// scripts/scan-untranslated.ts — how big the i18n retrofit actually is (P10-6).
//
// The plan's argument for a passthrough is about TIMING: "retrofitting after another 100k lines is
// materially harder". That claim deserves a number rather than a feeling, and the number is the thing an
// owner needs to decide whether a second locale is ever worth it.
//
// So this counts user-facing text — the visible strings between JSX tags — per top-level area. It is a
// SIZING TOOL, not a gate: nothing fails, nothing is enforced, and no baseline is written. The P10-2
// ratchet exists because hard-coded colours have a concrete cost today; an untranslated string costs
// nothing until there is a translation to be missing.
//
//   npx tsx scripts/scan-untranslated.ts
import fs from 'node:fs';
import path from 'node:path';

const SKIP = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage']);

function walk(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/**
 * Visible text between JSX tags.
 *
 * Deliberately crude, and it says so rather than pretending otherwise. `>text<` catches the common case
 * and misses attribute strings (`placeholder`, `aria-label`, `title`) while over-counting the occasional
 * fragment of code that happens to sit between angle brackets. A real extractor needs an AST, and an AST
 * pass is more machinery than a sizing estimate justifies — the answer this needs to support is "hundreds
 * or thousands?", not "3,412".
 */
export function countVisibleText(source: string): number {
  let n = 0;
  const re = />([^<>{}]+)</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const text = m[1].trim();
    // At least two letters and a letter somewhere: skips whitespace, punctuation, `·`, numbers and the
    // single-character separators that litter this codebase's JSX.
    if (text.length >= 2 && /[A-Za-z]{2}/.test(text)) n += 1;
  }
  return n;
}

/** Already going through `t()`. */
export function countTranslated(source: string): number {
  return (source.match(/\bt\(\s*['"`]/g) ?? []).length;
}

export function scan(root = process.cwd(), dirs = ['app', 'lib']): Record<string, { visible: number; translated: number; files: number }> {
  const byArea: Record<string, { visible: number; translated: number; files: number }> = {};
  for (const d of dirs) {
    for (const file of walk(path.join(root, d))) {
      const rel = path.relative(root, file).split(path.sep).join('/');
      // Two segments deep — `app/dnd`, `app/admin`, `lib/dnd` — which is the granularity a decision gets
      // made at ("do we translate the customer surface but not the D&D hub?").
      const area = rel.split('/').slice(0, 2).join('/');
      const src = fs.readFileSync(file, 'utf8');
      const slot = (byArea[area] ??= { visible: 0, translated: 0, files: 0 });
      slot.visible += countVisibleText(src);
      slot.translated += countTranslated(src);
      slot.files += 1;
    }
  }
  return byArea;
}

if (require.main === module) {
  const byArea = scan();
  const rows = Object.entries(byArea).sort((a, b) => b[1].visible - a[1].visible);
  const total = rows.reduce((n, [, v]) => n + v.visible, 0);
  const done = rows.reduce((n, [, v]) => n + v.translated, 0);

  console.log('Approximate user-facing strings per area (JSX text nodes only — see the note in this file):\n');
  for (const [area, v] of rows) {
    console.log(`  ${area.padEnd(24)} ${String(v.visible).padStart(6)} visible   ${String(v.translated).padStart(4)} via t()   ${v.files} files`);
  }
  console.log(`\n  ${'TOTAL'.padEnd(24)} ${String(total).padStart(6)} visible   ${String(done).padStart(4)} via t()`);
  console.log('\nThis is a SIZING estimate, not a target. Nothing fails on it.');
}
