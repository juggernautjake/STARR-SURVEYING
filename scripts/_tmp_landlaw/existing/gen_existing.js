// Generates a seed for ONE existing module from scripts/_tmp_landlaw/existing/m<ORDER>.json
// Targets the module's existing lesson rows (by lesson_id): replaces their blocks
// and fills flashcards/questions/templates. Namespaced by a 'buildout' tag +
// created_by so it NEVER clobbers pre-existing company rows. Deterministic UUIDs.
//
// Usage: node gen_existing.js <order> <seedNumber>
//   e.g. node gen_existing.js 13 332  -> writes seeds/332_buildout_m13_*.sql
const fs = require('fs');
const order = process.argv[2];
const seedNo = process.argv[3];
if (!order || !seedNo) { console.error('usage: gen_existing.js <order> <seedNumber>'); process.exit(1); }
const data = JSON.parse(fs.readFileSync(`scripts/_tmp_landlaw/existing/m${order}.json`, 'utf8'));

const pad = (n, w) => String(n).padStart(w, '0');
const o2 = pad(order, 2);
const uBlk = (ls, b) => `eeee${o2}10-${pad(ls,4)}-0000-0000-${pad(b,12)}`;
const uFc  = (i)     => `eeee${o2}40-0000-0000-0000-${pad(i,12)}`;
const uQ   = (i)     => `eeee${o2}30-0000-0000-0000-${pad(i,12)}`;
const uT   = (i)     => `eeee${o2}50-0000-0000-0000-${pad(i,12)}`;
const uDynQ= (i)     => `eeee${o2}60-0000-0000-0000-${pad(i,12)}`;

const S = (v) => v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const J = (o) => `'${JSON.stringify(o ?? null).replace(/'/g, "''")}'::jsonb`;
const Jtext = (o) => `'${JSON.stringify(o ?? {}).replace(/'/g, "''")}'`;
const arr = (a) => a && a.length ? `ARRAY[${a.map(S).join(',')}]::text[]` : `ARRAY[]::text[]`;
const num = (v, d=0) => (v === null || v === undefined || isNaN(v)) ? d : v;
const MID = data.module_id;
const TAG = ['buildout', `module-${order}`];
const CB = `buildout:m${order}`;

function normBlock(b) {
  if (b.block_type === 'image' && (!b.content || !b.content.url)) {
    const cap = (b.content && (b.content.caption || b.content.alt)) || 'Diagram to be added';
    return { block_type: 'callout', content: { type: 'info', text: `📷 Figure (to be added): ${cap}` } };
  }
  return b;
}

const out = [];
const W = s => out.push(s);
W(`-- ${seedNo}_buildout_m${order}.sql (GENERATED) — fill empty lessons for "${data.title}"`);
W(`-- Module ${MID}. Namespaced by tag 'buildout' / created_by '${CB}' so pre-existing rows are untouched.`);
W(`BEGIN;`);
// clean only our own prior buildout rows for this module
W(`DELETE FROM question_bank     WHERE module_id='${MID}' AND 'buildout' = ANY(tags);`);
W(`DELETE FROM flashcards        WHERE module_id='${MID}' AND 'buildout' = ANY(tags);`);
W(`DELETE FROM problem_templates WHERE module_id='${MID}' AND created_by='${CB}';`);

let lessonSeq = 0;
for (const les of data.lessons || []) {
  lessonSeq++;
  const lid = les.lesson_id;
  // refresh the lesson row + mark migrated so blocks render
  W(`UPDATE learning_lessons SET content_migrated=true, estimated_minutes=${num(les.estimated_minutes,30)}, ` +
    `key_takeaways=${arr(les.key_takeaways)}, learning_objectives=${arr(les.learning_objectives)}, ` +
    `status='published', is_published=true, review_status='approved', updated_at=now() WHERE id='${lid}';`);
  // replace blocks for this lesson
  W(`DELETE FROM lesson_blocks WHERE lesson_id='${lid}';`);
  (les.blocks || []).forEach((bRaw, bi) => {
    const b = normBlock(bRaw);
    W(`INSERT INTO lesson_blocks (id, lesson_id, block_type, content, order_index) VALUES (${S(uBlk(lessonSeq, bi))}, ${S(lid)}, ${S(b.block_type)}, ${J(b.content || {})}, ${bi});`);
  });
}

let fi = 0;
for (const les of data.lessons || []) {
  for (const fc of les.flashcards || []) {
    fi++;
    W(`INSERT INTO flashcards (id, term, definition, hint_1, module_id, lesson_id, category, tags, is_published, review_status, difficulty_level) VALUES (${S(uFc(fi))}, ${S(fc.term)}, ${S(fc.definition)}, ${S(fc.hint_1||null)}, ${S(MID)}, ${S(les.lesson_id)}, 'surveying', ${arr(TAG)}, true, 'approved', 'intermediate');`);
  }
}

let qi = 0;
for (const q of data.quiz_questions || []) {
  qi++;
  const opts = (q.question_type === 'short_answer' || q.question_type === 'numeric_input') ? [] : (q.options || []);
  W(`INSERT INTO question_bank (id, question_text, question_type, options, correct_answer, explanation, difficulty, module_id, lesson_id, tags, is_published, review_status, study_references, is_dynamic, tolerance) VALUES (${S(uQ(qi))}, ${S(q.question_text)}, ${S(q.question_type)}, ${J(opts)}, ${S(q.correct_answer)}, ${S(q.explanation||'')}, ${S(q.difficulty||'medium')}, ${S(MID)}, ${S(q.lesson_id||null)}, ${arr(TAG)}, true, 'approved', '[]'::jsonb, false, 0.01);`);
}

(data.problem_templates || []).forEach((t, ti) => {
  const tid = uT(ti + 1);
  const af = t.answer_format || {};
  W(`INSERT INTO problem_templates (id, name, description, category, subcategory, question_type, difficulty, question_template, answer_formula, answer_format, parameters, computed_vars, solution_steps_template, options_generator, explanation_template, module_id, tags, is_active, created_by) VALUES (`);
  W(`  ${S(tid)}, ${S(t.name)}, ${S(t.description||t.name)}, ${S(t.category||'Surveying')}, ${S(t.subcategory||null)}, ${S(t.question_type||'numeric_input')}, ${S(t.difficulty||'medium')}, ${S(t.question_template)}, ${S(t.answer_formula)}, ${Jtext(af)}, ${J(t.parameters||[])}, ${J(t.computed_vars||[])}, ${J(t.solution_steps_template||[])}, ${J(t.options_generator||{method:'none'})}, ${S(t.explanation_template||'')}, ${S(MID)}, ${arr(TAG.concat(['practice']))}, true, ${S(CB)});`);
  const tol = (af && af.tolerance) ? af.tolerance : 0.5;
  W(`INSERT INTO question_bank (id, question_text, question_type, options, correct_answer, explanation, difficulty, module_id, lesson_id, tags, is_published, review_status, study_references, is_dynamic, template_id, tolerance) VALUES (${S(uDynQ(ti+1))}, ${S(t.question_template)}, ${S(t.question_type==='multiple_choice'?'multiple_choice':'numeric_input')}, '[]'::jsonb, '0', ${S(t.explanation_template||'')}, ${S(t.difficulty||'medium')}, ${S(MID)}, NULL, ${arr(TAG.concat(['dynamic']))}, true, 'approved', '[]'::jsonb, true, ${S(tid)}, ${tol});`);
});

W(`COMMIT;`);
W(`SELECT 'm${order} ${data.title.replace(/'/g,"''")}: ' || (SELECT count(*) FROM lesson_blocks lb JOIN learning_lessons l ON l.id=lb.lesson_id WHERE l.module_id='${MID}') || ' blocks.' AS status;`);

const file = `seeds/${seedNo}_buildout_m${order}.sql`;
fs.writeFileSync(file, out.join('\n'));
console.log(`Wrote ${file} (${out.length} lines)`);
