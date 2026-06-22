const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const tables = ['learning_modules','learning_lessons','lesson_blocks','question_bank','problem_templates','learning_topics','module_xp_config','curriculum_milestones','flashcards','quiz_attempts','user_lesson_progress','user_module_status'];
  for (const t of tables) {
    const r = await c.query(`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`, [t]);
    console.log('\n===== '+t+' =====');
    for (const row of r.rows) console.log(`  ${row.column_name} :: ${row.data_type}${row.is_nullable==='NO'?' NOT NULL':''}${row.column_default?' DEF '+row.column_default:''}`);
  }
  await c.end();
})().catch(e=>{console.error('ERR', e.message); process.exit(1);});
