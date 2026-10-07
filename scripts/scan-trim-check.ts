// scripts/scan-trim-check.ts — scan one page through the local Starr Scan helper and show what the
// website's crop (lib/scan/trim.ts trimPlan) would keep. A bench check for real scanners.
//
//   npx tsx scripts/scan-trim-check.ts [out-dir] [dpi]
//
// Uses ffmpeg (on PATH or STARR_FFMPEG_DIR) to read the pixels, the same way the browser measures
// them: shrink to ≤800 px, count "ink" (luma < 160) per row and per column, then crop.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { trimPlan } from '../lib/scan/trim';

const outDir = process.argv[2] ?? '.';
const dpi = Number(process.argv[3] ?? 300);
const bin = (n: string) => (process.env.STARR_FFMPEG_DIR ? path.join(process.env.STARR_FFMPEG_DIR, n) : n);
const H = { Origin: 'https://www.starr-surveying.com', 'Content-Type': 'application/json' };
const B = 'http://127.0.0.1:47615';

async function main(): Promise<void> {
  const st = await (await fetch(`${B}/v1/status?refresh=1`, { headers: H })).json() as { sources: Array<{ id: string; name: string; kind: string }> };
  const dev = st.sources.find((s) => s.kind === 'device' && /DS-640/.test(s.name)) ?? st.sources.find((s) => s.kind === 'device' && !/^escl/.test(s.id));
  if (!dev) throw new Error(`No USB scanner awake. Found: ${st.sources.map((s) => s.name).join(', ')}`);
  let job = await (await fetch(`${B}/v1/scan`, { method: 'POST', headers: H, body: JSON.stringify({ sourceId: dev.id, source: 'feeder', dpi, color: 'color' }) })).json() as { id: string; state: string; error?: string; pages?: Array<{ n: number; type: string }> };
  for (let i = 0; i < 90 && job.state === 'scanning'; i += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    job = await (await fetch(`${B}/v1/jobs/${job.id}`, { headers: H })).json();
  }
  if (job.state !== 'done' || !job.pages?.length) throw new Error(`Scan ${job.state}: ${job.error ?? 'no pages'}`);
  for (const p of job.pages) {
    const ext = p.type === 'image/png' ? 'png' : 'jpg';
    const raw = path.join(outDir, `trim-raw-${p.n}.${ext}`);
    writeFileSync(raw, Buffer.from(await (await fetch(`${B}/v1/jobs/${job.id}/pages/${p.n}`, { headers: H })).arrayBuffer()));
    const [W, Hh] = execFileSync(bin('ffprobe'), ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', raw]).toString().trim().split(',').map(Number);
    const scale = Math.min(1, 800 / Math.max(W, Hh));
    const w = Math.max(1, Math.round(W * scale));
    const h = Math.max(1, Math.round(Hh * scale));
    const gray = execFileSync(bin('ffmpeg'), ['-v', 'error', '-i', raw, '-vf', `scale=${w}:${h}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 64 * 1024 * 1024 });
    const rows = new Uint32Array(h);
    const cols = new Uint32Array(w);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (gray[y * w + x] < 160) { rows[y] += 1; cols[x] += 1; }
    const plan = trimPlan(rows, cols, w, h, Math.round(24 * scale) + 2);
    console.log(`page ${p.n}: scanned ${W}×${Hh} px (${(W / dpi).toFixed(1)}×${(Hh / dpi).toFixed(1)} in)`);
    if (!plan) { console.log('  nothing to trim'); continue; }
    const crop = { x: Math.floor(plan.left / scale), y: Math.floor(plan.top / scale), w: Math.ceil(plan.width / scale), h: Math.ceil(plan.height / scale) };
    const out = path.join(outDir, `trim-cropped-${p.n}.jpg`);
    execFileSync(bin('ffmpeg'), ['-v', 'error', '-y', '-i', raw, '-vf', `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`, '-q:v', '3', out]);
    console.log(`  kept ${crop.w}×${crop.h} at (${crop.x},${crop.y}) — ${Math.round((1 - (crop.w * crop.h) / (W * Hh)) * 100)}% of the scan was empty`);
    console.log(`  raw: ${raw}\n  cropped: ${out}`);
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
