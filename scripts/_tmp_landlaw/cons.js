const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query(`select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid='public.lesson_blocks'::regclass and contype='c'`);
  for (const row of r.rows) console.log(row.conname + ': ' + row.def);
  // also question_bank question_type check + flashcards + difficulty checks
  for (const t of ['question_bank','problem_templates','learning_lessons','learning_modules']) {
    const rr = await c.query(`select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid=('public.'||$1)::regclass and contype='c'`,[t]);
    for (const row of rr.rows) console.log(`[${t}] ` + row.conname + ': ' + row.def);
  }
  await c.end();
})().catch(e=>{console.error('ERR', e.message); process.exit(1);});
