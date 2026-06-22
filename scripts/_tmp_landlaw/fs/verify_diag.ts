import { Client } from 'pg';
import { dbRowToTemplate, generateFromTemplate } from '../../../lib/problemEngine';
(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const { rows } = await c.query(`select * from problem_templates where created_by like 'fs:m%' and diagram is not null order by created_by, name`);
  let withSvg=0, nullDiag=0;
  for (const row of rows) {
    const t = dbRowToTemplate(row);
    let ok=0;
    for (let i=0;i<10;i++){ const p=generateFromTemplate(t); if(p.diagram && p.diagram.startsWith('<svg')) ok++; }
    if(ok===10) withSvg++; else { nullDiag++; console.log(`  ✗ ${t.name} produced diagram ${ok}/10 times`); }
  }
  console.log(`DIAGRAM TEMPLATES: ${withSvg}/${rows.length} render an SVG every time (${nullDiag} problematic)`);
  await c.end(); process.exit(nullDiag?1:0);
})().catch(e=>{console.error('ERR',e.message);process.exit(2);});
