// scripts/build-dnd-sheet.mjs
//
// Rebuild the Lazzuh Gun D&D character-sheet SPA and sync its static bundle into
// public/dnd-sheet/, which the hidden route app/dnd/Lazzuh_Gun/page.tsx iframes.
//
//   node scripts/build-dnd-sheet.mjs
//
// The sheet's source lives outside this repo (it's a standalone Vite app). By
// default we look for it at ../neon-odyssey-sheet (sibling of this repo); override
// with DND_SHEET_DIR=/path/to/neon-odyssey-sheet.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.env.DND_SHEET_DIR || path.resolve('..', 'neon-odyssey-sheet');
const dest = path.resolve('public', 'dnd-sheet');

if (!fs.existsSync(SRC)) {
  console.error(`Sheet source not found at ${SRC}. Set DND_SHEET_DIR to the neon-odyssey-sheet path.`);
  process.exit(1);
}

console.log(`Building character sheet in ${SRC} …`);
execSync('npm run build', { cwd: SRC, stdio: 'inherit' });

const dist = path.join(SRC, 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error(`Build did not produce ${dist}/index.html`);
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
fs.cpSync(dist, dest, { recursive: true });
console.log(`Synced ${dist} -> ${dest}. Served at /dnd-sheet/ (hidden route /dnd/Lazzuh_Gun).`);
