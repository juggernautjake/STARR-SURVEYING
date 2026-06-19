// Generates seeds/331_nmsu_sur292_landlaw.sql from m1..m7.json (+ a Getting
// Started module). Deterministic UUIDs → idempotent DELETE+INSERT per module.
// Also writes scripts/_tmp_landlaw/content/images_manifest.json.
const fs = require('fs');
const DIR = 'scripts/_tmp_landlaw/content';

const ACC = 'nmsu-sur292';
const TAGS = ['land-law', 'boundary-law', 'texas', 'nmsu-sur292'];

// ---- helpers ---------------------------------------------------------------
const pad = (n, w) => String(n).padStart(w, '0');
const uMod   = (N)        => `d2920000-0000-0000-0000-${pad(N, 12)}`;
const uLes   = (N, li)    => `d292${pad(N,2)}10-0000-0000-0000-${pad(li, 12)}`;
const uBlk   = (N, li, b) => `d292${pad(N,2)}20-${pad(li,4)}-0000-0000-${pad(b, 12)}`;
const uQ     = (N, qi)    => `d292${pad(N,2)}30-0000-0000-0000-${pad(qi, 12)}`;
const uFc    = (N, fi)    => `d292${pad(N,2)}40-0000-0000-0000-${pad(fi, 12)}`;
const uTmpl  = (N, ti)    => `d292${pad(N,2)}50-0000-0000-0000-${pad(ti, 12)}`;
const uDynQ  = (N, ti)    => `d292${pad(N,2)}60-0000-0000-0000-${pad(ti, 12)}`;

const S = (v) => v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const J = (o) => `'${JSON.stringify(o ?? null).replace(/'/g, "''")}'::jsonb`;
const Jtext = (o) => `'${JSON.stringify(o ?? {}).replace(/'/g, "''")}'`; // for text columns holding JSON
const arr = (a) => a && a.length
  ? `ARRAY[${a.map(x => S(x)).join(',')}]::text[]` : `ARRAY[]::text[]`;
const num = (v, d=0) => (v === null || v === undefined || isNaN(v)) ? d : v;

// transform an authored block: empty image -> visible "figure to be added" callout
function normBlock(b) {
  if (b.block_type === 'image' && (!b.content || !b.content.url)) {
    const cap = (b.content && (b.content.caption || b.content.alt)) || 'Diagram to be added';
    return { block_type: 'callout', content: { type: 'info', text: `📷 Figure (to be added): ${cap}` } };
  }
  return b;
}

const out = [];
const W = (s) => out.push(s);
const images = [];

W(`-- ============================================================================`);
W(`-- 331_nmsu_sur292_landlaw.sql  (GENERATED — edit scripts/_tmp_landlaw/*.json + regen)`);
W(`-- NMSU SUR 292 "Legal Principles and Boundary Law I" — full academic course:`);
W(`-- a Getting Started module + 7 content modules, with lessons, structured`);
W(`-- lesson_blocks, flashcards, question_bank quizzes, and randomized`);
W(`-- problem_templates (dynamic quiz questions). Texas-specific throughout.`);
W(`-- Depends on: 330_learn_dynamic_questions_schema.sql (question_bank dynamic cols).`);
W(`-- Idempotent: deterministic UUIDs + per-module DELETE/upsert.`);
W(`-- ============================================================================`);
W(`BEGIN;`);
W(``);

// ---- Getting Started module (N=0) -----------------------------------------
const gs = {
  module: {
    order_index: 0,
    title: 'Getting Started — Course Orientation',
    description: 'Syllabus, schedule, grading policy, and how to navigate SUR 292 Legal Principles and Boundary Law I.',
    estimated_hours: 1.0,
    learning_objectives: [
      'Understand the structure, schedule, and grading policy of SUR 292.',
      'Know what is expected on homework, quizzes, and the discussion.',
      'Navigate the course modules, lessons, flashcards, and quizzes.',
    ],
  },
  lessons: [
    { title: 'Welcome & Course Overview', estimated_minutes: 15, learning_objectives: [], flashcards: [], images_needed: [], blocks: [
      { block_type: 'text', content: { html: `<h2>Welcome to Legal Principles and Boundary Law I</h2><p>This course explores the principles, methods, and legal foundations of surveying property boundaries. Over seven modules you will gain a working knowledge of boundary law, learn to interpret and write legal descriptions, and understand the role of the professional surveyor in boundary determination. The course follows <em>Brown's Boundary Control and Legal Principles, 7th edition</em> (Robillard &amp; Wilson) and is tailored to <strong>Texas</strong> law.</p>` } },
      { block_type: 'key_takeaways', content: { title: 'Student Outcomes', items: [
        'Describe the elements of boundary law and the different sources of law.',
        'Interpret legal doctrines and principles in property law.',
        'Analyze metes-and-bounds descriptions and construct sequential & simultaneous descriptions.',
        'Distinguish between riparian and littoral rights.',
      ] } },
    ] },
    { title: 'Schedule, Modules & Textbook', estimated_minutes: 15, learning_objectives: [], flashcards: [], images_needed: [], blocks: [
      { block_type: 'text', content: { html: `<p>The course is organized into a Getting Started module plus seven content modules. Each module pairs with one or more chapters of Brown's Boundary Control.</p>` } },
      { block_type: 'table', content: { headers: ['Module', 'Topic', 'Brown Chapters'], rows: [
        ['1', 'Historical & current common-law principles', 'Ch. 1–3'],
        ['2', 'Sources of laws & related presumptions', 'Ch. 4'],
        ['3', 'Legal doctrines / principles in property law', 'Ch. 8'],
        ['4', 'Locating sequential conveyances', 'Ch. 9'],
        ['5', 'Locating simultaneous conveyances', 'Ch. 11'],
        ['6', 'Water rights', 'Ch. 12'],
        ['7', 'Creation of metes-and-bounds descriptions', 'Ch. 5'],
      ] } },
      { block_type: 'callout', content: { type: 'info', text: 'Required texts: Brown’s Boundary Control and Legal Principles, 7th ed. (Robillard & Wilson, Wiley); and Writing Legal Descriptions, 4th ed. (Wattles).' } },
    ] },
    { title: 'Grading Policy & Expectations', estimated_minutes: 15, learning_objectives: [], flashcards: [], images_needed: [], blocks: [
      { block_type: 'text', content: { html: `<h3>How you are graded</h3><p>Grades use fractional grading. Each module has a homework assignment and an auto-graded quiz. Quizzes are drawn from a bank of questions and allow two attempts (the highest score counts).</p>` } },
      { block_type: 'table', content: { headers: ['Component', 'Weight', 'Notes'], rows: [
        ['Discussion', '5%', 'Introduce yourself and engage with classmates.'],
        ['Quizzes (7)', '60%', 'Lowest quiz dropped. Two attempts each.'],
        ['Homework (7)', '35%', 'Lowest homework dropped. Drafts accepted 48 h early.'],
      ] } },
      { block_type: 'callout', content: { type: 'warning', text: 'Letter grades use half-point fractional bands (e.g., A 92.5–<97.5%, B 82.5–<87.5%, C 72.5–<77.5%, F <60%).' } },
      { block_type: 'key_takeaways', content: { title: 'What success looks like', items: [
        'Read the slides/handouts and watch the provided videos for each module.',
        'Use the flashcards to master terminology before each quiz.',
        'Work the practice problems — quizzes include randomized computational questions.',
        'Submit homework on time; you may submit a draft 48 hours early for feedback.',
      ] } },
    ] },
  ],
  quiz_questions: [
    { lesson_index: null, question_text: 'How many content modules (excluding Getting Started) are in SUR 292?', question_type: 'multiple_choice', options: ['5', '6', '7', '8'], correct_answer: '7', explanation: 'The course has a Getting Started module plus seven content modules.', difficulty: 'easy' },
    { lesson_index: null, question_text: 'What percentage of the final grade do quizzes represent?', question_type: 'multiple_choice', options: ['35%', '50%', '60%', '5%'], correct_answer: '60%', explanation: 'Quizzes are weighted 60%, homework 35%, discussion 5%.', difficulty: 'easy' },
    { lesson_index: null, question_text: 'True or False: The lowest quiz score is dropped.', question_type: 'true_false', options: ['True', 'False'], correct_answer: 'True', explanation: 'The lowest quiz and the lowest homework are each dropped.', difficulty: 'easy' },
  ],
  problem_templates: [],
  homework: [],
};

const modules = [gs];
for (let n = 1; n <= 7; n++) modules.push(JSON.parse(fs.readFileSync(`${DIR}/m${n}.json`, 'utf8')));

for (const data of modules) {
  const N = data.module.order_index;
  const mid = uMod(N);
  const m = data.module;
  W(`-- ===== Module ${N}: ${m.title.replace(/\n/g,' ')} =====`);
  // clean child rows for idempotency
  W(`DELETE FROM lesson_blocks WHERE lesson_id IN (SELECT id FROM learning_lessons WHERE module_id = '${mid}');`);
  W(`DELETE FROM question_bank WHERE module_id = '${mid}';`);
  W(`DELETE FROM flashcards    WHERE module_id = '${mid}';`);
  W(`DELETE FROM problem_templates WHERE module_id = '${mid}';`);
  W(`DELETE FROM learning_lessons  WHERE module_id = '${mid}';`);
  // module upsert
  W(`INSERT INTO learning_modules (id, title, description, difficulty, estimated_hours, order_index, status, tags, is_academic, acc_course_id, is_published, review_status, estimated_minutes, difficulty_level)`);
  W(`VALUES (${S(mid)}, ${S(m.title)}, ${S(m.description)}, 'intermediate', ${num(m.estimated_hours,2)}, ${N}, 'published', ${arr(TAGS)}, true, ${S(ACC)}, true, 'approved', ${Math.round(num(m.estimated_hours,2)*60)}, 'intermediate')`);
  W(`ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description, order_index=EXCLUDED.order_index, status='published', is_academic=true, acc_course_id=EXCLUDED.acc_course_id, is_published=true, review_status='approved', tags=EXCLUDED.tags, estimated_hours=EXCLUDED.estimated_hours, updated_at=now();`);

  // lessons + blocks
  const lessons = data.lessons || [];
  lessons.forEach((les, li) => {
    const lid = uLes(N, li + 1);
    const ktItems = (les.blocks || []).filter(b => b.block_type === 'key_takeaways').flatMap(b => (b.content && b.content.items) || []);
    W(`INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status, is_published, review_status, content_migrated, description, learning_objectives)`);
    W(`VALUES (${S(lid)}, ${S(mid)}, ${S(les.title)}, '', ${arr(ktItems)}, ${li + 1}, ${num(les.estimated_minutes,20)}, '[]'::jsonb, '[]'::jsonb, ${arr(TAGS)}, 'published', true, 'approved', true, ${S(les.description || null)}, ${arr(les.learning_objectives)});`);
    (les.blocks || []).forEach((bRaw, bi) => {
      const b = normBlock(bRaw);
      W(`INSERT INTO lesson_blocks (id, lesson_id, block_type, content, order_index) VALUES (${S(uBlk(N, li + 1, bi))}, ${S(lid)}, ${S(b.block_type)}, ${J(b.content || {})}, ${bi});`);
    });
    // collect image specs
    (les.images_needed || []).forEach(im => images.push({ module: N, lesson: les.title, ...im }));
  });

  // flashcards
  let fi = 0;
  lessons.forEach((les, li) => {
    const lid = uLes(N, li + 1);
    (les.flashcards || []).forEach(fc => {
      fi++;
      W(`INSERT INTO flashcards (id, term, definition, hint_1, module_id, lesson_id, category, tags, is_published, review_status, difficulty_level) VALUES (${S(uFc(N, fi))}, ${S(fc.term)}, ${S(fc.definition)}, ${S(fc.hint_1 || null)}, ${S(mid)}, ${S(lid)}, 'land-law', ${arr(TAGS)}, true, 'approved', 'intermediate');`);
    });
  });

  // static quiz questions
  let qi = 0;
  (data.quiz_questions || []).forEach(q => {
    qi++;
    const li = (q.lesson_index === null || q.lesson_index === undefined) ? null : q.lesson_index;
    const lid = li === null ? 'NULL' : S(uLes(N, li + 1));
    const opts = (q.question_type === 'short_answer' || q.question_type === 'numeric_input') ? [] : (q.options || []);
    W(`INSERT INTO question_bank (id, question_text, question_type, options, correct_answer, explanation, difficulty, module_id, lesson_id, tags, is_published, review_status, study_references, is_dynamic, tolerance) VALUES (${S(uQ(N, qi))}, ${S(q.question_text)}, ${S(q.question_type)}, ${J(opts)}, ${S(q.correct_answer)}, ${S(q.explanation || '')}, ${S(q.difficulty || 'medium')}, ${S(mid)}, ${lid}, ${arr(TAGS)}, true, 'approved', '[]'::jsonb, false, 0.01);`);
  });

  // problem templates + their linked dynamic questions
  (data.problem_templates || []).forEach((t, ti) => {
    const tid = uTmpl(N, ti + 1);
    const af = t.answer_format || {};
    W(`INSERT INTO problem_templates (id, name, description, category, subcategory, question_type, difficulty, question_template, answer_formula, answer_format, parameters, computed_vars, solution_steps_template, options_generator, explanation_template, module_id, tags, is_active, created_by) VALUES (`);
    W(`  ${S(tid)}, ${S(t.name)}, ${S(t.description || t.name)}, ${S(t.category || 'Boundary Law')}, ${S(t.subcategory || null)}, ${S(t.question_type || 'numeric_input')}, ${S(t.difficulty || 'medium')}, ${S(t.question_template)}, ${S(t.answer_formula)}, ${Jtext(af)}, ${J(t.parameters || [])}, ${J(t.computed_vars || [])}, ${J(t.solution_steps_template || [])}, ${J(t.options_generator || { method: 'none' })}, ${S(t.explanation_template || '')}, ${S(mid)}, ${arr(TAGS.concat(['practice']))}, true, 'seed:nmsu-sur292');`);
    // linked dynamic question for module tests
    const tol = (af && af.tolerance) ? af.tolerance : 0.1;
    W(`INSERT INTO question_bank (id, question_text, question_type, options, correct_answer, explanation, difficulty, module_id, lesson_id, tags, is_published, review_status, study_references, is_dynamic, template_id, tolerance) VALUES (${S(uDynQ(N, ti + 1))}, ${S(t.question_template)}, ${S(t.question_type === 'multiple_choice' ? 'multiple_choice' : 'numeric_input')}, '[]'::jsonb, '0', ${S(t.explanation_template || '')}, ${S(t.difficulty || 'medium')}, ${S(mid)}, NULL, ${arr(TAGS.concat(['dynamic']))}, true, 'approved', '[]'::jsonb, true, ${S(tid)}, ${tol});`);
    (t.images_needed || []).forEach(im => images.push({ module: N, template: t.name, ...im }));
  });

  // homework -> appended as a "Homework & Practice" lesson at the end
  if ((data.homework || []).length) {
    const hli = lessons.length + 1;
    const lid = uLes(N, hli);
    W(`INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status, is_published, review_status, content_migrated, description, learning_objectives) VALUES (${S(lid)}, ${S(mid)}, 'Homework & Practice', '', ARRAY[]::text[], ${hli}, 45, '[]'::jsonb, '[]'::jsonb, ${arr(TAGS)}, 'published', true, 'approved', true, 'Module homework assignment(s) and practice problems.', ARRAY[]::text[]);`);
    let bi2 = 0;
    W(`INSERT INTO lesson_blocks (id, lesson_id, block_type, content, order_index) VALUES (${S(uBlk(N, hli, bi2))}, ${S(lid)}, 'text', ${J({ html: '<h2>Homework &amp; Practice</h2><p>Complete the homework below. You may submit a draft up to 48 hours before the deadline for instructor feedback. Use the randomized practice problems to prepare for the quiz.</p>' })}, ${bi2});`);
    (data.homework || []).forEach((hw, hi) => {
      bi2++;
      const html = `<h3>${(hw.title || `Homework ${hi+1}`).replace(/</g,'&lt;')}</h3>` +
        `<p><em>Type: ${(hw.type || 'written')}</em></p>` +
        `<div>${(hw.prompt || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br/>')}</div>`;
      W(`INSERT INTO lesson_blocks (id, lesson_id, block_type, content, order_index) VALUES (${S(uBlk(N, hli, bi2))}, ${S(lid)}, 'text', ${J({ html })}, ${bi2});`);
      (hw.images_needed || []).forEach(im => images.push({ module: N, homework: hw.title, ...im }));
    });
  }
  W(``);
}

// module_xp_config for the academic modules (so passing awards XP) — optional default exists
W(`-- Ensure a default learning_module XP value exists (idempotent).`);
W(`INSERT INTO module_xp_config (module_type, module_id, xp_value, expiry_months, is_active)`);
W(`SELECT 'learning_module', NULL, 300, 18, true`);
W(`WHERE NOT EXISTS (SELECT 1 FROM module_xp_config WHERE module_type='learning_module' AND module_id IS NULL);`);
W(``);
W(`COMMIT;`);
W(`SELECT 'NMSU SUR 292 Land Law course seeded: ' || (SELECT count(*) FROM learning_modules WHERE acc_course_id='${ACC}') || ' modules.' AS status;`);

fs.writeFileSync('seeds/331_nmsu_sur292_landlaw.sql', out.join('\n'));
fs.writeFileSync(`${DIR}/images_manifest.json`, JSON.stringify(images, null, 2));
console.log(`Wrote seeds/331_nmsu_sur292_landlaw.sql (${out.length} lines), images_manifest.json (${images.length} figures).`);
