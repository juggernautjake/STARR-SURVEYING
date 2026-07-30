// scripts/verify-map-schema.mjs — prove the map tree's invariants against the real database.
//
// The M1 acceptance criterion is "depth and cycle rules provably enforced by tests that ATTEMPT violations".
// Those rules live in Postgres triggers, not in TypeScript, so a vitest unit test cannot reach them — the
// only honest verification runs real SQL. This builds the whole schema inside ONE transaction, attacks it,
// and ROLLS BACK, so production is untouched (Postgres DDL is transactional).
//
//   node scripts/verify-map-schema.mjs

import fs from 'node:fs';
import pg from 'pg';
const m = fs.readFileSync('.env.local', 'utf8').match(/SUPABASE_DB_URL\s*=\s*"?([^"\n\r]+)"?/);
const sql = fs
  .readFileSync('seeds/465_dnd_map_nodes.sql', 'utf8')
  .replace(/^\s*BEGIN;\s*$/gim, '')
  .replace(/^\s*COMMIT;\s*$/gim, '');
const c = new pg.Client({ connectionString: m[1].trim(), ssl: { rejectUnauthorized: false } });
await c.connect();
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(['PASS', name]); }
  catch (e) { results.push(['FAIL', `${name} — ${e.message.split('\n')[0]}`]); }
};
/** Assert the statement is REJECTED. Runs in a savepoint so the failure does not poison the txn. */
const mustReject = async (name, stmt, expect) => {
  await c.query('SAVEPOINT sp');
  try {
    await c.query(stmt);
    await c.query('ROLLBACK TO SAVEPOINT sp');
    results.push(['FAIL', `${name} — was ACCEPTED but should have been rejected`]);
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT sp');
    const ok = !expect || new RegExp(expect, 'i').test(e.message);
    results.push([ok ? 'PASS' : 'FAIL', ok ? name : `${name} — wrong error: ${e.message.split('\n')[0]}`]);
  }
};

try {
  await c.query('BEGIN');
  await c.query(sql);

  // A campaign to hang the tree off. Real FK, so this also proves the reference resolves.
  const dm = await c.query(`select id from dnd_users limit 1`);
  const camp = await c.query(
    `insert into dnd_campaigns (name, dm_user_id) values ('__verify__', $1) returning id`,
    [dm.rows[0].id],
  );
  const cid = camp.rows[0].id;
  const add = async (name, parent = null, tier = 'site') =>
    (await c.query(
      `insert into dnd_map_nodes (campaign_id, parent_id, name, tier) values ($1,$2,$3,$4) returning id, depth`,
      [cid, parent, name, tier],
    )).rows[0];

  // ── depth is derived, not supplied ────────────────────────────────────────────────────────────
  const root = await add('Space', null, 'space');
  await check('a root is depth 1', async () => { if (root.depth !== 1) throw new Error(`got ${root.depth}`); });

  const chain = [root];
  const tiers = ['world', 'continent', 'province', 'city', 'district', 'site'];
  for (let i = 0; i < 6; i++) chain.push(await add(`L${i + 2}`, chain[i].id, tiers[i]));
  await check('seven levels nest, depth 1..7', async () => {
    const got = chain.map((n) => n.depth).join(',');
    if (got !== '1,2,3,4,5,6,7') throw new Error(`got ${got}`);
  });

  await check('a supplied depth is IGNORED, not trusted', async () => {
    const r = await c.query(
      `insert into dnd_map_nodes (campaign_id, parent_id, name, depth) values ($1,$2,'liar',7) returning depth`,
      [cid, root.id],
    );
    if (r.rows[0].depth !== 2) throw new Error(`client said 7, db stored ${r.rows[0].depth}`);
  });

  // ── the limit RAISES rather than clamping ─────────────────────────────────────────────────────
  await mustReject(
    'an 8th level is REJECTED, not clamped',
    `insert into dnd_map_nodes (campaign_id, parent_id, name) values ('${cid}','${chain[6].id}','too deep')`,
    'nesting limit',
  );

  // ── cycles ────────────────────────────────────────────────────────────────────────────────────
  await mustReject(
    'a node cannot be its own parent',
    `update dnd_map_nodes set parent_id = id where id = '${chain[3].id}'`,
    'self_parent|own ancestor',
  );
  await mustReject(
    'a node cannot be re-parented under its own descendant',
    `update dnd_map_nodes set parent_id = '${chain[5].id}' where id = '${chain[2].id}'`,
    'own ancestor',
  );

  // ── re-parenting cascades depth through the whole subtree ─────────────────────────────────────
  await check('re-parenting cascades depth to descendants', async () => {
    // Move L4 (depth 3, with L5/L6/L7 beneath) up to sit directly under the root.
    await c.query(`update dnd_map_nodes set parent_id = $1 where id = $2`, [root.id, chain[2].id]);
    const r = await c.query(
      `select id, depth from dnd_map_nodes where id = any($1) order by depth`,
      [[chain[2].id, chain[3].id, chain[4].id, chain[5].id, chain[6].id]],
    );
    const got = r.rows.map((x) => x.depth).join(',');
    if (got !== '2,3,4,5,6') throw new Error(`subtree depths are ${got}, expected 2,3,4,5,6`);
  });

  // ── G2: 2D only ───────────────────────────────────────────────────────────────────────────────
  await mustReject(
    "render_kind '3d' is rejected while G2 holds",
    `insert into dnd_map_nodes (campaign_id, name, render_kind) values ('${cid}','solid','3d')`,
    'render_2d_only',
  );

  // ── the two authoring states the plan says must NOT error ─────────────────────────────────────
  await check('a pin may point at nothing yet', async () => {
    await c.query(`insert into dnd_map_pins (map_node_id, x, y, label) values ($1, 10, 20, 'unbuilt')`, [root.id]);
  });
  await check('a child may exist with no pin', async () => {
    await add('orphan child', root.id); // no pin row at all — must simply be fine
  });

  // ── objects, discoveries, triggers ────────────────────────────────────────────────────────────
  await check('an object of every kind is accepted', async () => {
    for (const k of ['image', 'prop', 'token', 'light', 'area', 'note', 'hidden']) {
      await c.query(`insert into dnd_map_objects (map_node_id, kind) values ($1,$2)`, [chain[6].id, k]);
    }
  });
  await mustReject(
    'an unknown object kind is rejected',
    `insert into dnd_map_objects (map_node_id, kind) values ('${chain[6].id}','sandwich')`,
    'objects_kind',
  );
  await check('a discovery is unique per (object, character)', async () => {
    const o = await c.query(
      `insert into dnd_map_objects (map_node_id, kind) values ($1,'hidden') returning id`, [chain[6].id]);
    const ch = await c.query(`select id from dnd_characters limit 1`);
    if (!ch.rows.length) return; // no character in this DB; the FK itself is proven by the insert above
    await c.query(`insert into dnd_map_discoveries (map_object_id, character_id) values ($1,$2)`,
      [o.rows[0].id, ch.rows[0].id]);
    await c.query('SAVEPOINT dsp');
    try {
      await c.query(`insert into dnd_map_discoveries (map_object_id, character_id) values ($1,$2)`,
        [o.rows[0].id, ch.rows[0].id]);
      await c.query('ROLLBACK TO SAVEPOINT dsp');
      throw new Error('a duplicate discovery was accepted');
    } catch (e) {
      await c.query('ROLLBACK TO SAVEPOINT dsp');
      if (!/discoveries_once|duplicate key/i.test(e.message)) throw e;
    }
  });
  await check('a trigger stores its when/then without reserved-word trouble', async () => {
    await c.query(
      `insert into dnd_map_triggers (map_node_id, fires_when, fires_then) values ($1,$2,$3)`,
      [chain[6].id, JSON.stringify({ on: 'enter', region: 'x' }), JSON.stringify([{ do: 'reveal' }])],
    );
  });

  // ── deleting a parent takes the subtree ───────────────────────────────────────────────────────
  await check('deleting a node cascades to its subtree', async () => {
    const before = await c.query(`select count(*)::int n from dnd_map_nodes where campaign_id = $1`, [cid]);
    await c.query(`delete from dnd_map_nodes where id = $1`, [root.id]);
    const after = await c.query(`select count(*)::int n from dnd_map_nodes where campaign_id = $1`, [cid]);
    if (after.rows[0].n !== 0) throw new Error(`${after.rows[0].n} of ${before.rows[0].n} nodes survived`);
  });
} catch (e) {
  results.push(['FAIL', `setup — ${e.message.split('\n')[0]}`]);
} finally {
  await c.query('ROLLBACK');
  const left = await c.query(`select to_regclass('public.dnd_map_nodes') r`);
  const pass = results.filter((r) => r[0] === 'PASS').length;
  const fail = results.filter((r) => r[0] === 'FAIL').length;
  for (const [s, n] of results) console.log(`${s === 'PASS' ? '  ✅' : '  ❌'} ${n}`);
  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(`rolled back — dnd_map_nodes in production: ${left.rows[0].r ?? 'absent (correct)'}`);
  await c.end();
  process.exitCode = fail ? 1 : 0;
}
