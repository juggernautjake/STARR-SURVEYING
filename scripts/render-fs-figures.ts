// scripts/render-fs-figures.ts
// Render a live-generated instance of each figure-bearing FS question (question
// text + its diagram) to PNGs for visual/OCR inspection. Usage:
//   npx tsx scripts/render-fs-figures.ts <outDir>
import { generateFromTemplate, dbRowToTemplate } from '../lib/problemEngine';
import { buildDiagramFromSpec } from '../lib/diagrams/survey-diagram';
import { chromium } from 'playwright';
// @ts-expect-error - no type declarations for 'pg'
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2] || '.';
const templateIds = [
  'fa29f000-0000-0000-0000-000000000002', // tower
  'fa30f000-0000-0000-0000-000000000003', // curve
  'fa30f000-0000-0000-0000-000000000002', // rounded lot
  'fa32f000-0000-0000-0000-000000000001', // plat remainder
  'fa33f000-0000-0000-0000-000000000001', // profile (sewer)
  'fa33f000-0000-0000-0000-000000000002', // cross-section
  'fa33f000-0000-0000-0000-000000000003', // contour
];
const staticFigs = [
  { name: 'Q28 geoid height (hotspot)', spec: { type: 'heightRelations', orthoH: 150, ellipH: 190, geoidN: 40 } },
  { name: 'Q13 tilted photo (drag-label)', spec: { type: 'tiltedPhoto', tilt: 18 } },
];

async function main() {
  let url = process.env.SUPABASE_DB_URL;
  if (!url) { const m = fs.readFileSync('.env.local', 'utf8').match(/SUPABASE_DB_URL=(.+)/); url = m ? m[1].trim().replace(/^["']|["']$/g, '') : ''; }
  const c = new pg.Client({ connectionString: url }); await c.connect();
  const { rows } = await c.query(`select * from problem_templates where id = any($1::uuid[])`, [templateIds]);
  const byId = new Map<string, { id: string; name: string }>(rows.map((r: { id: string; name: string }) => [r.id, r]));

  const cards: string[] = [];
  for (const id of templateIds) {
    const r = byId.get(id); if (!r) continue;
    const g = generateFromTemplate(dbRowToTemplate(r as never)) as { question_text: string; correct_answer: string; diagram?: string };
    cards.push(card(r.name as string, g.question_text, g.correct_answer, g.diagram || '<i>NO DIAGRAM</i>'));
  }
  for (const s of staticFigs) {
    cards.push(card(s.name, '(static figure)', '', buildDiagramFromSpec(s.spec as never, {}) || '<i>NULL</i>'));
  }
  await c.end();

  const html = `<!doctype html><meta charset=utf8><body style="font-family:system-ui;background:#eef;margin:0;padding:16px;max-width:600px">${cards.join('')}</body>`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 600, height: 900 }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  fs.mkdirSync(outDir, { recursive: true });
  // one PNG per card for readability
  const els = await page.locator('.card').all();
  for (let i = 0; i < els.length; i++) {
    await els[i].screenshot({ path: path.join(outDir, `fig_${String(i + 1).padStart(2, '0')}.png`) });
  }
  await browser.close();
  console.log(`rendered ${els.length} figures to ${outDir}`);
}
function card(title: string, q: string, ans: string, svg: string): string {
  return `<div class=card style="background:#fff;border-radius:10px;padding:14px;margin-bottom:14px;box-shadow:0 1px 4px #0002">`
    + `<div style="font-weight:700;color:#1d3095;font-size:13px;margin-bottom:6px">${title}</div>`
    + `<div style="font-size:13px;color:#222;margin-bottom:8px">${q}</div>`
    + svg
    + (ans ? `<div style="font-size:12px;color:#0a7a5a;margin-top:6px">Answer: ${ans}</div>` : '')
    + `</div>`;
}
main().catch(e => { console.error(e); process.exit(1); });
