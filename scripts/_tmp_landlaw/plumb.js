const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  // 1. Does the grader's select break?
  try {
    await c.query(`select id, question_type, correct_answer, template_id, is_dynamic, tolerance from question_bank limit 1`);
    console.log('GRADER_SELECT: OK (columns exist)');
  } catch (e) { console.log('GRADER_SELECT: BROKEN ->', e.message); }
  // 2. quiz_attempts.org_id default + triggers
  const def = await c.query(`select column_default, is_nullable from information_schema.columns where table_name='quiz_attempts' and column_name='org_id'`);
  console.log('quiz_attempts.org_id:', JSON.stringify(def.rows));
  const trg = await c.query(`select tgname, pg_get_triggerdef(oid) def from pg_trigger where tgrelid='public.quiz_attempts'::regclass and not tgisinternal`);
  console.log('quiz_attempts triggers:', JSON.stringify(trg.rows.map(r=>r.tgname)));
  // 3. orgs
  const orgs = await c.query(`select id, name, slug from organizations limit 10`).catch(e=>({rows:[{err:e.message}]}));
  console.log('ORGS:', JSON.stringify(orgs.rows));
  // 4. a sample existing question_bank row to learn options + correct_answer format for multiple_choice
  const samp = await c.query(`select question_type, options, correct_answer from question_bank where question_type='multiple_choice' and module_id is not null limit 2`);
  console.log('SAMPLE_MC:', JSON.stringify(samp.rows));
  // 5. how existing lesson_blocks store data sample (a real lesson with blocks)
  const lb = await c.query(`select block_type, content from lesson_blocks limit 3`);
  console.log('SAMPLE_BLOCKS:', JSON.stringify(lb.rows).slice(0,500));
  await c.end();
})().catch(e=>{console.error('ERR', e.message); process.exit(1);});
