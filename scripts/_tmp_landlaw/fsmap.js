const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  // fs_study_modules
  const mods = (await c.query(`select module_number, title, exam_weight_percent, question_count, jsonb_array_length(content_sections) sections, jsonb_array_length(key_formulas) formulas from fs_study_modules order by module_number`)).rows;
  console.log('FS_STUDY_MODULES:');
  for(const m of mods) console.log(`  ${m.module_number}. ${m.title.padEnd(42)} wt=${m.exam_weight_percent}% qcount=${m.question_count} sections=${m.sections} formulas=${m.formulas}`);
  // FS questions in question_bank
  const fsq = (await c.query(`select count(*) n, count(distinct module_id) mods from question_bank where exam_category='FS' and deleted_at is null`)).rows[0];
  console.log(`\nFS question_bank rows: ${fsq.n} across ${fsq.mods} modules`);
  // FS-related tables schema
  for(const t of ['fs_mock_exam_attempts','fs_weak_areas','fs_module_progress','curriculum_milestones']){
    const cols=(await c.query(`select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`,[t])).rows.map(r=>r.column_name);
    console.log(`\n${t}: ${cols.join(', ')}`);
  }
  // existing milestones
  const mil=(await c.query(`select milestone_key, title, milestone_type, required_count from curriculum_milestones order by sort_order`)).rows;
  console.log(`\nMILESTONES (${mil.length}):`); for(const m of mil.slice(0,20)) console.log(`  ${m.milestone_key} | ${m.title} | ${m.milestone_type} | req=${m.required_count}`);
  await c.end();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
