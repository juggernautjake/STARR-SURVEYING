// Generates seeds/<N>_faa_part107.sql from part107/m1..m7.json.
// FAA Part 107 commercial-drone course as a learning_modules academic course
// (acc_course_id='faa-part107'). Idempotent, deterministic UUIDs.
// Usage: node gen_part107.js <seedNumber>
const fs = require('fs');
const seedNo = process.argv[2];
if (!seedNo) { console.error('usage: gen_part107.js <seedNumber>'); process.exit(1); }
const DIR = 'scripts/_tmp_landlaw/part107';
const ACC = 'faa-part107';
const TAGS = ['faa-part107', 'drone', 'uas', 'remote-pilot'];

const pad = (n, w) => String(n).padStart(w, '0');
const uMod = (N) => `faa70000-0000-0000-0000-${pad(N, 12)}`;
const uLes = (N, li) => `faa7${pad(N,2)}10-0000-0000-0000-${pad(li, 12)}`;
const uBlk = (N, li, b) => `faa7${pad(N,2)}20-${pad(li,4)}-0000-0000-${pad(b, 12)}`;
const uQ   = (N, qi) => `faa7${pad(N,2)}30-0000-0000-0000-${pad(qi, 12)}`;
const uFc  = (N, fi) => `faa7${pad(N,2)}40-0000-0000-0000-${pad(fi, 12)}`;

const S = (v) => v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const J = (o) => `'${JSON.stringify(o ?? null).replace(/'/g, "''")}'::jsonb`;
const arr = (a) => a && a.length ? `ARRAY[${a.map(S).join(',')}]::text[]` : `ARRAY[]::text[]`;
const num = (v, d=0) => (v === null || v === undefined || isNaN(v)) ? d : v;

function normBlock(b) {
  if (b.block_type === 'image' && (!b.content || !b.content.url)) {
    const cap = (b.content && (b.content.caption || b.content.alt)) || 'Figure to be added';
    return { block_type: 'callout', content: { type: 'info', text: `🖼️ Figure (to be added): ${cap}` } };
  }
  return b;
}

const out = [];
const W = s => out.push(s);
const images = [];
W(`-- ${seedNo}_faa_part107.sql (GENERATED) — FAA Part 107 commercial-drone prep course`);
W(`-- 7 modules (Certification, Regulations, Airspace & Charts, Weather, Loading &`);
W(`-- Performance, Operations & ADM, Review & Practice Exam). acc_course_id='${ACC}'.`);
W(`-- Idempotent: deterministic UUIDs + per-module DELETE/upsert.`);
W(`BEGIN;`);

let tot = { les: 0, blk: 0, fc: 0, q: 0 };
for (let N = 1; N <= 7; N++) {
  const data = JSON.parse(fs.readFileSync(`${DIR}/m${N}.json`, 'utf8'));
  const m = data.module;
  const mid = uMod(N);
  W(`\n-- ===== Module ${N}: ${m.title.replace(/\n/g,' ')} =====`);
  W(`DELETE FROM lesson_blocks WHERE lesson_id IN (SELECT id FROM learning_lessons WHERE module_id = '${mid}');`);
  W(`DELETE FROM question_bank WHERE module_id = '${mid}';`);
  W(`DELETE FROM flashcards    WHERE module_id = '${mid}';`);
  W(`DELETE FROM learning_lessons WHERE module_id = '${mid}';`);
  W(`INSERT INTO learning_modules (id, title, description, difficulty, estimated_hours, order_index, status, tags, is_academic, acc_course_id, is_published, review_status, estimated_minutes, difficulty_level)`);
  W(`VALUES (${S(mid)}, ${S(m.title)}, ${S(m.description)}, 'beginner', ${num(m.estimated_hours,2)}, ${N}, 'published', ${arr(TAGS)}, true, ${S(ACC)}, true, 'approved', ${Math.round(num(m.estimated_hours,2)*60)}, 'beginner')`);
  W(`ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description, order_index=EXCLUDED.order_index, status='published', is_academic=true, acc_course_id=EXCLUDED.acc_course_id, is_published=true, review_status='approved', tags=EXCLUDED.tags, estimated_hours=EXCLUDED.estimated_hours, updated_at=now();`);

  (data.lessons || []).forEach((les, li) => {
    tot.les++;
    const lid = uLes(N, li + 1);
    const kt = (les.blocks || []).filter(b => b.block_type === 'key_takeaways').flatMap(b => (b.content && b.content.items) || []);
    W(`INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status, is_published, review_status, content_migrated, description, learning_objectives) VALUES (${S(lid)}, ${S(mid)}, ${S(les.title)}, '', ${arr(kt)}, ${li + 1}, ${num(les.estimated_minutes,20)}, '[]'::jsonb, '[]'::jsonb, ${arr(TAGS)}, 'published', true, 'approved', true, ${S(les.description || null)}, ${arr(les.learning_objectives)});`);
    (les.blocks || []).forEach((bRaw, bi) => {
      tot.blk++;
      const b = normBlock(bRaw);
      W(`INSERT INTO lesson_blocks (id, lesson_id, block_type, content, order_index) VALUES (${S(uBlk(N, li + 1, bi))}, ${S(lid)}, ${S(b.block_type)}, ${J(b.content || {})}, ${bi});`);
    });
    (les.images_needed || []).forEach(im => images.push({ module: N, lesson: les.title, ...im }));
  });

  let fi = 0;
  (data.lessons || []).forEach((les, li) => {
    const lid = uLes(N, li + 1);
    (les.flashcards || []).forEach(fc => {
      fi++; tot.fc++;
      W(`INSERT INTO flashcards (id, term, definition, hint_1, module_id, lesson_id, category, tags, is_published, review_status, difficulty_level) VALUES (${S(uFc(N, fi))}, ${S(fc.term)}, ${S(fc.definition)}, ${S(fc.hint_1 || null)}, ${S(mid)}, ${S(lid)}, 'part107', ${arr(TAGS)}, true, 'approved', 'beginner');`);
    });
  });

  let qi = 0;
  (data.quiz_questions || []).forEach(q => {
    qi++; tot.q++;
    const li = (q.lesson_index === null || q.lesson_index === undefined) ? null : q.lesson_index;
    const lid = li === null ? 'NULL' : S(uLes(N, li + 1));
    const opts = (q.question_type === 'short_answer' || q.question_type === 'numeric_input') ? [] : (q.options || []);
    W(`INSERT INTO question_bank (id, question_text, question_type, options, correct_answer, explanation, difficulty, module_id, lesson_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, tolerance) VALUES (${S(uQ(N, qi))}, ${S(q.question_text)}, ${S(q.question_type||'multiple_choice')}, ${J(opts)}, ${S(q.correct_answer)}, ${S(q.explanation || '')}, ${S(q.difficulty || 'medium')}, ${S(mid)}, ${lid}, 'PART107', ${arr(TAGS)}, true, 'approved', '[]'::jsonb, false, 0.01);`);
  });
}

W(`\nCOMMIT;`);
W(`SELECT 'FAA Part 107 course: ' || (SELECT count(*) FROM learning_modules WHERE acc_course_id='${ACC}') || ' modules, ' || (SELECT count(*) FROM question_bank WHERE exam_category='PART107') || ' questions.' AS status;`);

fs.writeFileSync(`seeds/${seedNo}_faa_part107.sql`, out.join('\n'));
fs.writeFileSync(`${DIR}/images_manifest.json`, JSON.stringify(images, null, 2));
console.log(`Wrote seeds/${seedNo}_faa_part107.sql (${out.length} lines). Lessons=${tot.les} blocks=${tot.blk} flashcards=${tot.fc} questions=${tot.q}; images=${images.length}.`);
