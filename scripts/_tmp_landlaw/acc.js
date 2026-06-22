const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  for (const t of ['education_courses','acc_course_enrollments']) {
    const r = await c.query(`select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`, [t]);
    console.log('\n===== '+t+' =====');
    for (const row of r.rows) console.log(`  ${row.column_name} :: ${row.data_type}`);
  }
  // existing education_courses rows
  const ec = await c.query(`select * from education_courses order by 1 limit 20`).catch(e=>({rows:[{err:e.message}]}));
  console.log('\nEDUCATION_COURSES ROWS:', JSON.stringify(ec.rows, null, 1));
  // distinct acc_course_id on modules
  const m = await c.query(`select acc_course_id, is_academic, count(*) from learning_modules group by 1,2 order by 1`);
  console.log('\nMODULES by acc_course_id:', JSON.stringify(m.rows));
  await c.end();
})().catch(e=>{console.error('ERR', e.message); process.exit(1);});
