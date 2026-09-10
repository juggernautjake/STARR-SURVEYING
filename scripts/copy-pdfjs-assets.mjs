// Copies the pdf.js worker (and the wasm decoders + standard fonts it fetches at runtime) from
// node_modules into public/pdfjs/, so the viewer can load them as plain static files.
//
// Why not bundle the worker with `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`:
// that is what pdf.js documents, and it works in `next dev`, but the production build hands the
// emitted asset to the minifier, which rejects the worker's own `import.meta` ("cannot be used
// outside of module code") and fails the whole build (2026-09-10). A static file is not minified.
//
// Runs as `prebuild` and `predev` (package.json), so the copy is always the installed version —
// the API and the worker must match exactly, and pdfjs-dist is pinned for that reason.
// public/pdfjs/ is gitignored: it is a build product, not source.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const src = path.join(root, 'node_modules', 'pdfjs-dist');
const dest = path.join(root, 'public', 'pdfjs');

if (!fs.existsSync(src)) {
  console.error('pdfjs-dist is not installed; run npm install first.');
  process.exit(1);
}

fs.mkdirSync(dest, { recursive: true });
fs.copyFileSync(path.join(src, 'build', 'pdf.worker.min.mjs'), path.join(dest, 'pdf.worker.min.mjs'));
for (const dir of ['wasm', 'standard_fonts']) {
  const from = path.join(src, dir);
  if (!fs.existsSync(from)) continue;
  fs.cpSync(from, path.join(dest, dir), { recursive: true });
}
const version = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(dest, 'VERSION'), `${version}\n`);
console.log(`pdf.js ${version} assets copied to public/pdfjs/`);
