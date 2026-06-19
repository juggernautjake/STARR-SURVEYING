import { Client } from 'pg';
import { dbRowToTemplate, generateFromTemplate } from '../../lib/problemEngine';
(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const { rows } = await c.query(`select * from problem_templates where created_by like 'buildout:%' order by created_by, name`);
  let pass=0, fail=0;
  for (const row of rows) {
    const t = dbRowToTemplate(row); let ok=true, msg='';
    for (let i=0;i<20;i++){ const p=generateFromTemplate(t); const a=parseFloat(p.correct_answer);
      if(!isFinite(a)){ok=false;msg='NaN';break;} if(/\{\{/.test(p.question_text)){ok=false;msg='unsub '+(p.question_text.match(/\{\{[^}]+\}\}/));break;} }
    if(ok)pass++; else {fail++; console.log(`  ✗ ${row.created_by} :: ${t.name.slice(0,50)} :: ${msg}`);}
  }
  console.log(`TEMPLATES (buildout): ${pass} pass, ${fail} fail of ${rows.length}`);
  // empty lessons remaining in the 5 modules
  const e = await c.query(`select m.order_index, count(*) filter (where bk.cnt is null or bk.cnt=0) empty, count(*) total
    from learning_modules m join learning_lessons l on l.module_id=m.id
    left join (select lesson_id,count(*) cnt from lesson_blocks group by 1) bk on bk.lesson_id=l.id
    where m.order_index in (13,14,15,16,24) and coalesce(m.is_academic,false)=false group by 1 order by 1`);
  console.log('EMPTY LESSONS NOW:', e.rows.map(r=>`m${r.order_index}: ${r.empty}/${r.total}`).join(', '));
  await c.end(); process.exit(fail?1:0);
})().catch(e=>{console.error('ERR',e.message);process.exit(2);});
