import { Client } from 'pg';
import { dbRowToTemplate, generateFromTemplate } from '../../../lib/problemEngine';
(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const { rows } = await c.query(`select * from problem_templates where created_by like 'fs:m%' order by created_by, name`);
  let pass=0, fail=0;
  for (const row of rows) {
    const t = dbRowToTemplate(row); let ok=true, msg='';
    for (let i=0;i<25;i++){ const p=generateFromTemplate(t); const a=parseFloat(p.correct_answer);
      if(!isFinite(a)){ok=false;msg='NaN raw='+p.correct_answer;break;}
      if(/\{\{/.test(p.question_text)){ok=false;msg='unsub '+(p.question_text.match(/\{\{[^}]+\}\}/));break;} }
    if(ok)pass++; else {fail++; console.log(`  ✗ ${row.created_by} :: ${t.name.slice(0,46)} :: ${msg}`);}
  }
  console.log(`FS TEMPLATES: ${pass} pass, ${fail} fail of ${rows.length}`);
  // mock pool by area
  const mk = await c.query(`select unnest(tags) tag from question_bank where exam_category='FS-MOCK'`);
  const areas:Record<string,number>={}; let total=0;
  const seen = await c.query(`select count(*) n from question_bank where exam_category='FS-MOCK'`);
  for(const r of mk.rows){ if(String(r.tag).startsWith('fs-mock-')){ const a=String(r.tag).replace('fs-mock-',''); areas[a]=(areas[a]||0)+1; } }
  console.log('FS-MOCK pool total:', seen.rows[0].n, 'by area:', JSON.stringify(areas));
  // fs modules content check
  const fm = await c.query(`select module_number, jsonb_array_length(content_sections) sec, question_count from fs_study_modules order by module_number`);
  console.log('FS modules:', fm.rows.map((r:any)=>`m${r.module_number}:${r.sec}sec/${r.question_count}q`).join('  '));
  await c.end(); process.exit(fail?1:0);
})().catch(e=>{console.error('ERR',e.message);process.exit(2);});
