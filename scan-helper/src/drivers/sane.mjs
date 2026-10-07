// scan-helper/src/drivers/sane.mjs — SANE's `scanimage` (Linux, and Macs with sane-backends).
//
// SANE is the standard scanner layer on Linux; nearly every USB scanner has a backend. `scanimage -L`
// lists them and `scanimage --batch` scans a feeder page by page.
import path from 'node:path';
import { readdirSync } from 'node:fs';
import { run, which, OS } from '../util.mjs';

export async function listSane() {
  if (OS === 'win32') return [];
  const exe = await which('scanimage');
  if (!exe) return [];
  const r = await run(exe, ['-L'], { timeout: 45_000 });
  const out = [];
  // device `epson2:libusb:001:004' is a Epson GT-S50 flatbed scanner
  for (const m of r.stdout.matchAll(/device [`'"]([^'"`]+)['"`] is a (.+)/g)) {
    out.push({
      id: `sane:${m[1]}`,
      kind: 'device',
      driver: 'sane',
      name: m[2].trim(),
      maker: null,
      sources: ['feeder', 'flatbed'],
      dpis: [150, 200, 300, 600],
    });
  }
  return out;
}

export async function scanSane(opts, onPage) {
  const exe = await which('scanimage');
  if (!exe) throw new Error('SANE (scanimage) is not installed.');
  const device = opts.sourceId.replace(/^sane:/, '');
  const mode = opts.color === 'gray' ? 'Gray' : opts.color === 'bw' ? 'Lineart' : 'Color';
  const args = ['-d', device, '--format=png', '--resolution', String(opts.dpi), '--mode', mode];
  if (opts.source === 'flatbed') {
    const file = path.join(opts.outDir, 'page-001.png');
    const r = await run(exe, [...args, '-o', file], { timeout: 10 * 60_000 });
    if (r.code !== 0) throw new Error(r.stderr.trim() || 'The scan failed.');
    onPage(file);
    return 1;
  }
  const r = await run(exe, [...args, '--source', opts.source === 'duplex' ? 'ADF Duplex' : 'ADF', `--batch=${path.join(opts.outDir, 'page-%03d.png')}`], { timeout: 15 * 60_000 });
  const pages = readdirSync(opts.outDir).filter((f) => /^page-\d+\.png$/.test(f)).sort();
  if (!pages.length) throw new Error(r.stderr.trim().split(/\r?\n/).pop() || 'There is no paper in the feeder.');
  for (const p of pages) onPage(path.join(opts.outDir, p));
  return pages.length;
}
