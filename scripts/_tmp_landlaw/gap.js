const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const want = {
    question_bank: ['is_dynamic','template_id','tolerance','math_vars'],
    lesson_blocks: ['style'],
  };
  for (const [t, cols] of Object.entries(want)) {
    const r = await c.query(`select column_name from information_schema.columns where table_schema='public' and table_name=$1`, [t]);
    const have = new Set(r.rows.map(x=>x.column_name));
    console.log(`\n${t}: ` + cols.map(co => `${co}=${have.has(co)?'YES':'MISSING'}`).join('  '));
  }
  // Starr org id
  const orgs = await c.query(`select id, name, slug from organizations order by created_at limit 5`).catch(e=>({rows:[{err:e.message}]}));
  console.log('\nORGS:', JSON.stringify(orgs.rows));
  // how many existing question_bank rows are dynamic-capable
  const qb = await c.query(`select count(*) total from question_bank`).catch(e=>({rows:[{err:e.message}]}));
  console.log('question_bank count:', JSON.stringify(qb.rows));
  // distinct existing problem_templates categories
  const pt = await c.query(`select category, count(*) from problem_templates group by 1 order by 2 desc limit 30`).catch(e=>({rows:[{err:e.message}]}));
  console.log('problem_templates categories:', JSON.stringify(pt.rows));
  await c.end();
})().catch(e=>{console.error('ERR', e.message); process.exit(1);});
