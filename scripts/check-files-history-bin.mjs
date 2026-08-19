// scripts/check-files-history-bin.mjs — is every file action really recorded, and does the bin work?
//
// The unit tests pin the RULES (which columns a row uses, what comes back with a restore). They
// cannot show that a folder created in the product produces a row, that the history endpoint finds
// it, or that a restore puts a file back where it was — and the bug this whole slice exists to fix
// was exactly that shape: six routes wrote `activity_log` with the wrong column names, every write
// was swallowed by `fireAndForget`, and nothing anywhere said so for months.
//
// So this drives the real API and then reads the real database.
//
// ── WHAT IT TOUCHES, AND HOW IT PUTS IT BACK ────────────────────────────────────────────────────
//
// It creates one folder in the caller's Personal root, does things to it, and purges it at the end.
// The `activity_log` rows it generates are deleted by entity_id. Cleanup runs even on failure.
//
// Usage: node --env-file=.env.local scripts/check-files-history-bin.mjs [--base URL]

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';
import pg from 'pg';

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i === -1 ? undefined : process.argv[i + 1];
};

const BASE = arg('--base') ?? 'http://127.0.0.1:3211';
const AS = arg('--as') ?? 'jacobmaddux@starr-surveying.com';

const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }
if (!process.env.SUPABASE_DB_URL) { console.error('SUPABASE_DB_URL is not set'); process.exit(2); }

const findings = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { findings.push(m); console.log(`  ✗ ${m}`); };

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const token = await encode({
  token: { email: AS, name: 'History/bin check', sub: AS },
  secret, salt: 'authjs.session-token', maxAge: 60 * 60,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
const page = await ctx.newPage();
page.on('pageerror', (e) => bad(`page error: ${String(e).slice(0, 200)}`));

const touched = [];
const api = {
  get: (p) => page.request.get(`${BASE}${p}`),
  post: (p, data) => page.request.post(`${BASE}${p}`, data === undefined ? {} : { data }),
  patch: (p, data) => page.request.patch(`${BASE}${p}`, { data }),
  del: (p) => page.request.delete(`${BASE}${p}`),
};

try {
  // The personal root is a folder this caller can definitely write to.
  console.log(`\n  ${BASE} — recording what happens to a folder\n`);
  const roots = await (await api.get('/api/admin/files?parent=root')).json();
  const personal = (roots.nodes ?? []).find((n) => n.is_personal_root) ?? (roots.nodes ?? []).find((n) => !String(n.id).startsWith('mnt:'));
  if (!personal) { bad('no writable top-level folder to test in'); throw new Error('no root'); }

  const madeRes = await api.post('/api/admin/files', { parent_id: personal.id, name: `QA history ${Date.now() % 100000}` });
  if (!madeRes.ok()) { bad(`could not create a folder (${madeRes.status()})`); throw new Error('no folder'); }
  const folder = (await madeRes.json()).node;
  touched.push(folder.id);
  ok(`created a folder (${folder.name})`);

  // ── The write that used to vanish ────────────────────────────────────────────────────────────
  const logged = await db.query(
    "SELECT action_type, user_email, metadata FROM public.activity_log WHERE entity_type='file_node' AND entity_id=$1",
    [folder.id],
  );
  if (logged.rows.length > 0) ok(`the creation was recorded, against ${logged.rows[0].user_email}`);
  else bad('creating a folder recorded NOTHING — the write is being swallowed again');
  if (logged.rows[0]?.action_type === 'file_folder_created') ok('under the action a person would look for');
  else bad(`recorded as "${logged.rows[0]?.action_type}"`);

  // ── Rename, and check the history remembers the OLD name ─────────────────────────────────────
  const renamed = `${folder.name} renamed`;
  const rn = await api.patch(`/api/admin/files/${folder.id}`, { name: renamed });
  if (rn.ok()) ok('renamed it'); else bad(`rename failed (${rn.status()})`);

  const hist = await (await api.get(`/api/admin/files/${folder.id}/history`)).json();
  const events = hist.events ?? [];
  const renameEv = events.find((e) => e.action === 'file_renamed');
  if (renameEv) ok('the history endpoint returns the rename');
  else bad(`no rename in the history — saw ${JSON.stringify(events.map((e) => e.action))}`);
  if (renameEv?.detail?.includes(folder.name)) ok(`and it says what the old name was: "${renameEv.detail}"`);
  else bad(`the rename entry does not carry the old name (detail: ${renameEv?.detail})`);
  if (renameEv?.actor) ok(`and who did it: ${renameEv.actor}`);
  else bad('the rename entry has no actor');

  // Newest first, or a history is a puzzle.
  if (events.length >= 2) {
    const ordered = events.every((e, i) => i === 0 || new Date(events[i - 1].at) >= new Date(e.at));
    if (ordered) ok('the entries are newest first');
    else bad('the entries are not in order');
  }

  // ── Delete → the bin ─────────────────────────────────────────────────────────────────────────
  console.log(`\n  the bin\n`);
  const del = await api.del(`/api/admin/files/${folder.id}`);
  if (del.ok()) ok('deleted it'); else bad(`delete failed (${del.status()})`);

  const bin = await (await api.get('/api/admin/files/bin')).json();
  const entry = (bin.entries ?? []).find((e) => e.id === folder.id);
  if (entry) ok(`it is in the bin, listed as coming from "${entry.in_folder}"`);
  else bad(`it is not in the bin — saw ${(bin.entries ?? []).length} entr(ies)`);

  // It must NOT still be listed in its folder.
  const inFolder = await (await api.get(`/api/admin/files?parent=${encodeURIComponent(personal.id)}`)).json();
  if (!(inFolder.nodes ?? []).some((n) => n.id === folder.id)) ok('and it is gone from the folder it was in');
  else bad('a deleted folder is still listed in its parent');

  // ── Restore ──────────────────────────────────────────────────────────────────────────────────
  const rest = await api.post(`/api/admin/files/bin/${folder.id}`);
  if (rest.ok()) {
    const body = await rest.json();
    ok(`restored it (${body.restored} item(s))`);
    const back = await (await api.get(`/api/admin/files?parent=${encodeURIComponent(personal.id)}`)).json();
    if ((back.nodes ?? []).some((n) => n.id === folder.id)) ok('and it is back in the folder it came from');
    else bad('the restore reported success but the folder is not there');

    const after = await (await api.get('/api/admin/files/bin')).json();
    if (!(after.entries ?? []).some((e) => e.id === folder.id)) ok('and it left the bin');
    else bad('it is still in the bin after being restored');

    const h2 = await (await api.get(`/api/admin/files/${folder.id}/history`)).json();
    if ((h2.events ?? []).some((e) => e.action === 'file_restored')) ok('and the restore itself is in the history');
    else bad('a restore was not recorded — the history would show it deleted and never returned');
  } else {
    bad(`restore failed (${rest.status()}): ${(await rest.text()).slice(0, 160)}`);
  }

  // ── The rule that a child cannot be restored on its own ──────────────────────────────────────
  const childRes = await api.post('/api/admin/files', { parent_id: folder.id, name: 'inner' });
  if (childRes.ok()) {
    const child = (await childRes.json()).node;
    touched.push(child.id);
    await api.del(`/api/admin/files/${folder.id}`);       // takes the child with it
    const bin2 = await (await api.get('/api/admin/files/bin')).json();
    const ids = (bin2.entries ?? []).map((e) => e.id);
    if (ids.includes(folder.id) && !ids.includes(child.id)) {
      ok('deleting a folder puts ONE entry in the bin, not one per file inside it');
    } else {
      bad(`the bin listed the contents separately: ${JSON.stringify(ids)}`);
    }
    const lone = await api.post(`/api/admin/files/bin/${child.id}`);
    if (lone.status() === 400) ok('and a file inside it cannot be restored on its own into a folder that is gone');
    else bad(`restoring a child on its own returned ${lone.status()} — that would orphan it`);

    await api.post(`/api/admin/files/bin/${folder.id}`);  // put it back for the purge check
  } else {
    bad('could not create a child folder for the subtree check');
  }

  // ── Purge ────────────────────────────────────────────────────────────────────────────────────
  await api.del(`/api/admin/files/${folder.id}`);
  const purge = await api.del(`/api/admin/files/bin/${folder.id}`);
  if (purge.ok()) {
    ok(`purged it (${(await purge.json()).purged} row(s))`);
    const gone = await db.query('SELECT count(*)::int n FROM public.file_nodes WHERE id = $1', [folder.id]);
    if (gone.rows[0].n === 0) ok('and the row is actually gone, not just flagged');
    else bad('the purge left the row behind');
  } else {
    bad(`purge failed (${purge.status()})`);
  }

  // ── The browser, because an endpoint nothing calls is not a feature ───────────────────────────
  console.log(`\n  the screens\n`);
  await page.goto(`${BASE}/admin/files`, { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForTimeout(1200);
  if (await page.locator('[data-testid="fx-bin-open"]').count()) ok('the Bin button is on the Files page');
  else bad('there is no way to open the bin from the page');

  await page.locator('[data-testid="fx-bin-open"]').click();
  await page.waitForTimeout(1200);
  if (await page.locator('[data-testid="fx-bin-dialog"]').count()) ok('and it opens');
  else bad('the Bin button does not open the bin');
  await page.keyboard.press('Escape').catch(() => {});

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow <= 0) ok('no horizontal overflow at 1440');
  else bad(`${overflow}px of horizontal overflow at 1440`);
} catch (err) {
  bad(`the run stopped early: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  console.log('\n  putting everything back\n');
  for (const id of touched) {
    try {
      await db.query('DELETE FROM public.file_nodes WHERE id = $1', [id]);
      await db.query("DELETE FROM public.activity_log WHERE entity_type='file_node' AND entity_id = $1", [id]);
    } catch (e) {
      bad(`cleanup failed for ${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const left = await db.query(
    "SELECT (SELECT count(*)::int FROM public.file_nodes WHERE deleted_at IS NOT NULL) AS in_bin,"
    + " (SELECT count(*)::int FROM public.activity_log WHERE entity_type='file_node') AS file_events",
  );
  console.log(`  nodes left in the bin: ${left.rows[0].in_bin} · file events recorded: ${left.rows[0].file_events}`);
  await browser.close();
  await db.end();
}

console.log(`\n  ${findings.length === 0 ? 'ALL CLEAR' : `${findings.length} finding(s)`}\n`);
process.exit(findings.length === 0 ? 0 : 1);
