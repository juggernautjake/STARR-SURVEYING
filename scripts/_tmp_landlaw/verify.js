const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const acc='nmsu-sur292';
  const mods = (await c.query(`select id, order_index, title from learning_modules where acc_course_id=$1 order by order_index`,[acc])).rows;
  console.log('MODULES:', mods.length);
  let totL=0,totB=0,totQ=0,totF=0,totT=0,totDyn=0;
  for (const m of mods){
    const L=(await c.query(`select count(*) n from learning_lessons where module_id=$1`,[m.id])).rows[0].n;
    const B=(await c.query(`select count(*) n from lesson_blocks lb join learning_lessons l on l.id=lb.lesson_id where l.module_id=$1`,[m.id])).rows[0].n;
    const Q=(await c.query(`select count(*) n from question_bank where module_id=$1`,[m.id])).rows[0].n;
    const F=(await c.query(`select count(*) n from flashcards where module_id=$1`,[m.id])).rows[0].n;
    const T=(await c.query(`select count(*) n from problem_templates where module_id=$1`,[m.id])).rows[0].n;
    const D=(await c.query(`select count(*) n from question_bank where module_id=$1 and is_dynamic=true`,[m.id])).rows[0].n;
    totL+=+L;totB+=+B;totQ+=+Q;totF+=+F;totT+=+T;totDyn+=+D;
    console.log(`  [${m.order_index}] ${m.title.slice(0,40).padEnd(40)} lessons=${L} blocks=${B} Q=${Q}(dyn ${D}) flash=${F} tmpl=${T}`);
  }
  console.log(`TOTALS lessons=${totL} blocks=${totB} questions=${totQ}(dynamic ${totDyn}) flashcards=${totF} templates=${totT}`);
  // verify grader select now works
  try { await c.query(`select id, template_id, is_dynamic, tolerance from question_bank where module_id=$1 limit 1`,[mods[1].id]); console.log('GRADER_SELECT: OK'); } catch(e){ console.log('GRADER_SELECT BROKEN', e.message); }
  // distinct block types present
  const bt=(await c.query(`select distinct lb.block_type from lesson_blocks lb join learning_lessons l on l.id=lb.lesson_id join learning_modules m on m.id=l.module_id where m.acc_course_id=$1 order by 1`,[acc])).rows.map(r=>r.block_type);
  console.log('BLOCK TYPES:', bt.join(', '));
  // a sample dynamic question + its template
  const dq=(await c.query(`select q.question_text, q.template_id, t.answer_formula, t.parameters from question_bank q join problem_templates t on t.id=q.template_id where q.is_dynamic=true limit 1`)).rows[0];
  console.log('SAMPLE DYNAMIC Q text:', dq.question_text.slice(0,90));
  console.log('  formula:', dq.answer_formula, '| params:', JSON.stringify(dq.parameters).slice(0,120));
  await c.end();
})().catch(e=>{console.error('ERR', e.message); process.exit(1);});
