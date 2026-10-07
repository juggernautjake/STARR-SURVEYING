// scan-helper/build.mjs — package the helper as one executable for this OS.
//
//   node build.mjs   →  dist/starr-scan-<os>[.exe]
//
// esbuild bundles src/ into one CommonJS file, and Node's single-executable support (`--build-sea`,
// Node 25+) wraps it with the Node runtime, so the person installing it needs nothing else. Run on
// each OS (the scan-helper-release workflow does Windows, Mac and Linux).
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
const out = path.join('dist', `starr-scan-${os}${process.platform === 'win32' ? '.exe' : ''}`);
mkdirSync('dist', { recursive: true });

await build({
  entryPoints: ['src/main.mjs'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: 'dist/starr-scan.cjs',
  logLevel: 'warning',
});

writeFileSync('dist/sea-config.json', JSON.stringify({
  main: 'dist/starr-scan.cjs',
  output: out,
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
}, null, 2));
execFileSync(process.execPath, ['--build-sea', 'dist/sea-config.json'], { stdio: 'inherit' });
console.log(`built ${out} (${Math.round(statSync(out).size / 1048576)} MB)`);
