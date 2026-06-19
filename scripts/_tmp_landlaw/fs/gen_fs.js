// Generates seeds/<N>_fs_prep_buildout.sql from fs/m1..m10.json.
// Upserts fs_study_modules (by module_number), loads module quiz questions
// (question_bank exam_category='FS'), randomized problem_templates + their linked
// dynamic questions, and the FS-MOCK comprehensive-exam pool. Namespaced by a
// 'fs-buildout' tag / created_by='fs:m<n>' so it never clobbers the original
// 030_fs_prep rows and is fully idempotent. Deterministic UUIDs.
//
// Usage: node gen_fs.js <seedNumber>
const fs = require('fs');
const seedNo = process.argv[2];
if (!seedNo) { console.error('usage: gen_fs.js <seedNumber>'); process.exit(1); }
const DIR = 'scripts/_tmp_landlaw/fs';

const pad = (n, w) => String(n).padStart(w, '0');
const hx = (n) => n.toString(16);
const uMod = (N) => `f500000${hx(N)}-0000-0000-0000-${pad(hx(N), 12)}`;
const o2 = (N) => pad(N, 2);
const uQ   = (N, i) => `fb${o2(N)}3000-0000-0000-0000-${pad(i, 12)}`;
const uT   = (N, i) => `fb${o2(N)}5000-0000-0000-0000-${pad(i, 12)}`;
const uDyn = (N, i) => `fb${o2(N)}6000-0000-0000-0000-${pad(i, 12)}`;
const uMk  = (N, i) => `fb${o2(N)}7000-0000-0000-0000-${pad(i, 12)}`;

const S = (v) => v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const J = (o) => `'${JSON.stringify(o ?? null).replace(/'/g, "''")}'::jsonb`;
const Jtext = (o) => `'${JSON.stringify(o ?? {}).replace(/'/g, "''")}'`;
const arr = (a) => a && a.length ? `ARRAY[${a.map(S).join(',')}]::text[]` : `ARRAY[]::text[]`;
const num = (v, d=0) => (v === null || v === undefined || isNaN(v)) ? d : v;

const out = [];
const W = s => out.push(s);
W(`-- ${seedNo}_fs_prep_buildout.sql (GENERATED) — comprehensive FS/SIT exam-prep buildout`);
W(`-- 10 fs_study_modules (enrich 1-8, add 9 Calculator Mastery + 10 Review/Mock),`);
W(`-- FS question bank, randomized problem_templates, and the FS-MOCK 110-q pool.`);
W(`-- Namespaced by tag 'fs-buildout' / created_by 'fs:m<n>' — original 030_fs_prep rows untouched.`);
W(`-- Depends on: 330 (question_bank dynamic cols).`);
W(`BEGIN;`);

let grand = { q: 0, t: 0, mk: 0 };
for (let N = 1; N <= 10; N++) {
  const data = JSON.parse(fs.readFileSync(`${DIR}/m${N}.json`, 'utf8'));
  const mid = uMod(N);
  W(`\n-- ===== FS Module ${N}: ${data.title.replace(/\n/g,' ')} =====`);
  // clean our prior buildout rows for this module
  W(`DELETE FROM question_bank WHERE module_id='${mid}' AND 'fs-buildout' = ANY(tags);`);
  W(`DELETE FROM question_bank WHERE exam_category='FS-MOCK' AND 'fs-m${N}' = ANY(tags);`);
  W(`DELETE FROM problem_templates WHERE created_by='fs:m${N}';`);

  // upsert module
  const xp = num(data.xp_reward, 400);
  const prereq = (data.prerequisite_module === null || data.prerequisite_module === undefined) ? 'NULL' : data.prerequisite_module;
  // question_count = static questions + dynamic templates (both carry module_id)
  const qc = (data.questions || []).length + (data.problem_templates || []).length;
  W(`INSERT INTO fs_study_modules (id, module_number, title, description, week_range, exam_weight_percent, key_topics, key_formulas, content_sections, prerequisite_module, passing_score, question_count, icon, xp_reward, is_published, review_status)`);
  W(`VALUES (${S(mid)}, ${N}, ${S(data.title)}, ${S(data.description)}, ${S(data.week_range || '')}, ${num(data.exam_weight_percent,0)}, ${arr(data.key_topics)}, ${J(data.key_formulas || [])}, ${J(data.content_sections || [])}, ${prereq}, 70, ${qc}, ${S(data.icon || '📐')}, ${xp}, true, 'approved')`);
  W(`ON CONFLICT (module_number) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description, week_range=EXCLUDED.week_range, exam_weight_percent=EXCLUDED.exam_weight_percent, key_topics=EXCLUDED.key_topics, key_formulas=EXCLUDED.key_formulas, content_sections=EXCLUDED.content_sections, prerequisite_module=EXCLUDED.prerequisite_module, question_count=EXCLUDED.question_count, icon=EXCLUDED.icon, xp_reward=EXCLUDED.xp_reward, is_published=true, review_status='approved', updated_at=now();`);

  // static module questions (exam_category FS)
  (data.questions || []).forEach((q, i) => {
    grand.q++;
    const opts = (q.question_type === 'short_answer' || q.question_type === 'numeric_input') ? [] : (q.options || []);
    W(`INSERT INTO question_bank (id, question_text, question_type, options, correct_answer, explanation, difficulty, module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, tolerance) VALUES (${S(uQ(N,i+1))}, ${S(q.question_text)}, ${S(q.question_type||'multiple_choice')}, ${J(opts)}, ${S(q.correct_answer)}, ${S(q.explanation||'')}, ${S(q.difficulty||'medium')}, ${S(mid)}, 'FS', ${arr(['fs-buildout',`fs-m${N}`])}, true, 'approved', '[]'::jsonb, false, 0.01);`);
  });

  // problem templates + linked dynamic FS questions
  (data.problem_templates || []).forEach((t, i) => {
    grand.t++;
    const tid = uT(N, i+1);
    const af = t.answer_format || {};
    W(`INSERT INTO problem_templates (id, name, description, category, subcategory, question_type, difficulty, question_template, answer_formula, answer_format, parameters, computed_vars, solution_steps_template, options_generator, explanation_template, module_id, exam_category, tags, diagram, is_active, created_by) VALUES (`);
    W(`  ${S(tid)}, ${S(t.name)}, ${S(t.description||t.name)}, ${S(t.category||'FS — Computations')}, ${S(t.subcategory||null)}, ${S(t.question_type||'numeric_input')}, ${S(t.difficulty||'medium')}, ${S(t.question_template)}, ${S(t.answer_formula)}, ${Jtext(af)}, ${J(t.parameters||[])}, ${J(t.computed_vars||[])}, ${J(t.solution_steps_template||[])}, ${J(t.options_generator||{method:'none'})}, ${S(t.explanation_template||'')}, ${S(mid)}, 'FS', ${arr(['fs-buildout',`fs-m${N}`,'fs-practice'])}, ${t.diagram?J(t.diagram):'NULL'}, true, ${S('fs:m'+N)});`);
    const tol = (af && af.tolerance) ? af.tolerance : 0.1;
    W(`INSERT INTO question_bank (id, question_text, question_type, options, correct_answer, explanation, difficulty, module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, template_id, tolerance) VALUES (${S(uDyn(N,i+1))}, ${S(t.question_template)}, ${S(t.question_type==='multiple_choice'?'multiple_choice':'numeric_input')}, '[]'::jsonb, '0', ${S(t.explanation_template||'')}, ${S(t.difficulty||'medium')}, ${S(mid)}, 'FS', ${arr(['fs-buildout',`fs-m${N}`,'fs-dynamic'])}, true, 'approved', '[]'::jsonb, true, ${S(tid)}, ${tol});`);
  });

  // mock questions (exam_category FS-MOCK; tags carry area + module marker)
  (data.mock_questions || []).forEach((q, i) => {
    grand.mk++;
    const area = (q.area || 'general').toLowerCase();
    W(`INSERT INTO question_bank (id, question_text, question_type, options, correct_answer, explanation, difficulty, exam_category, tags, is_published, review_status, study_references, is_dynamic, tolerance) VALUES (${S(uMk(N,i+1))}, ${S(q.question_text)}, 'multiple_choice', ${J(q.options||[])}, ${S(q.correct_answer)}, ${S(q.explanation||'')}, ${S(q.difficulty||'medium')}, 'FS-MOCK', ${arr(['fs-buildout',`fs-m${N}`,`fs-mock-${area}`])}, true, 'approved', '[]'::jsonb, false, 0.01);`);
  });
}

W(`\nCOMMIT;`);
W(`SELECT 'FS prep: ' || (SELECT count(*) FROM fs_study_modules) || ' modules, ' || (SELECT count(*) FROM question_bank WHERE 'fs-buildout'=ANY(tags) AND exam_category='FS') || ' FS questions, ' || (SELECT count(*) FROM question_bank WHERE exam_category='FS-MOCK' AND 'fs-buildout'=ANY(tags)) || ' mock questions.' AS status;`);

const file = `seeds/${seedNo}_fs_prep_buildout.sql`;
fs.writeFileSync(file, out.join('\n'));
console.log(`Wrote ${file} (${out.length} lines). Totals: ${grand.q} static Q, ${grand.t} templates, ${grand.mk} mock Q.`);
