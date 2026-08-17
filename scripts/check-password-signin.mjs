// scripts/check-password-signin.mjs — prove an account can get a password and then actually sign in with it.
//
// Owner, 2026-08-16: *"if a user uses their org registered credentials to login in the employee
// portal they can successfully login without necessarily having to use the login with google
// option … They should be able to both use the google login and the raw credentials to log in."*
//
// ── WHY A SCRIPT, AND WHY A THROWAWAY ACCOUNT ───────────────────────────────────────────────────
//
// The failure being guarded against is not "the form rejects a bad password". It is the one that
// actually shipped: the credentials provider worked, the login form worked, and FOUR OF FIVE STAFF
// still could not use it, because their `password_hash` was `''` and nothing in the app could
// change that. Only an end-to-end run catches that shape — a unit test on the provider passes
// happily while nobody on the platform can log in.
//
// It runs against the real database, so it creates its own user (`qa-password-check@…`), does
// everything to that, and deletes it. Setting a password on a real colleague's account to test with
// — even briefly, even reverted — means a live account had a password a stranger chose.
//
// Usage: node --env-file=.env.local scripts/check-password-signin.mjs [--base URL]

import { encode } from '@auth/core/jwt';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import fs from 'node:fs';

const arg = (f) => { const i = process.argv.indexOf(f); return i === -1 ? undefined : process.argv[i + 1]; };
const BASE = arg('--base') ?? 'http://127.0.0.1:3111';
const EMAIL = 'qa-password-check@starr-surveying.com';
const FIRST = 'first-pass-9137';
const SECOND = 'second-pass-4482';

const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }
const dbUrl = fs.readFileSync('.env.local', 'utf8')
  .match(/^SUPABASE_DB_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');

const findings = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { findings.push(m); console.log(`  ✗ ${m}`); };

const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await db.connect();

// Clean slate, in case a previous run died mid-way.
await db.query(`DELETE FROM registered_users WHERE email = $1`, [EMAIL]);
await db.query(
  `INSERT INTO registered_users (email, name, password_hash, roles, is_approved, is_banned, auth_provider)
   VALUES ($1, 'QA Password Check', '', ARRAY['employee']::text[], true, false, 'google')`,
  [EMAIL],
);
console.log(`\n  created ${EMAIL} with password_hash = '' (the state every Google-created account is in)\n`);

const cookie = `authjs.session-token=${await encode({
  token: { email: EMAIL, name: 'QA Password Check', sub: EMAIL }, secret, salt: 'authjs.session-token', maxAge: 3600,
})}`;

const api = (path, init = {}) => fetch(`${BASE}${path}`, {
  ...init, headers: { 'Content-Type': 'application/json', cookie, ...(init.headers ?? {}) },
});

// ── 1. The card can tell you which case you are in ─────────────────────────────────────────────
let r = await api('/api/admin/me/password');
let j = await r.json().catch(() => ({}));
if (r.ok && j.hasPassword === false) ok('GET reports hasPassword=false for a Google-created account');
else bad(`GET should report hasPassword=false; got ${r.status} ${JSON.stringify(j)}`);

// ── 2. The first password needs no current password ────────────────────────────────────────────
r = await api('/api/admin/me/password', { method: 'POST', body: JSON.stringify({ newPassword: FIRST }) });
if (r.ok) ok('the FIRST password can be set without a current one');
else bad(`setting the first password failed: ${r.status} ${await r.text()}`);

const row1 = (await db.query(`SELECT password_hash FROM registered_users WHERE email = $1`, [EMAIL])).rows[0];
if (await bcrypt.compare(FIRST, row1.password_hash)) ok('it is stored as a real bcrypt hash of what was typed');
else bad('the stored hash does not match the password that was set');

// ── 3. THE ACTUAL TEST: can that password sign in? ─────────────────────────────────────────────
// Drive the real NextAuth credentials endpoint, CSRF and all — not the authorize() function.
async function credentialsSignIn(password) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const setCookie = csrfRes.headers.getSetCookie?.() ?? [];
  const csrfCookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: csrfCookie },
    body: new URLSearchParams({ email: EMAIL, password, csrfToken, callbackUrl: `${BASE}/admin`, json: 'true' }),
    redirect: 'manual',
  });
  const cookies = res.headers.getSetCookie?.() ?? [];
  const gotSession = cookies.some((c) => /authjs\.session-token=[^;]+/.test(c) && !/authjs\.session-token=;/.test(c));
  const body = await res.text();
  return { gotSession, status: res.status, body: body.slice(0, 200) };
}

let signin = await credentialsSignIn(FIRST);
if (signin.gotSession) ok('signing in with email + password issues a real session');
else bad(`email + password did NOT sign in (${signin.status}) ${signin.body}`);

const wrong = await credentialsSignIn('definitely-not-the-password');
if (!wrong.gotSession) ok('and a wrong password still does not');
else bad('a WRONG password was accepted');

// ── 4. Changing it requires the old one ────────────────────────────────────────────────────────
r = await api('/api/admin/me/password', { method: 'POST', body: JSON.stringify({ newPassword: SECOND }) });
if (r.status === 400) ok('changing an existing password without the current one is refused');
else bad(`expected 400 changing without the current password; got ${r.status}`);

r = await api('/api/admin/me/password', {
  method: 'POST', body: JSON.stringify({ newPassword: SECOND, currentPassword: 'wrong-one' }),
});
if (r.status === 400) ok('and a wrong current password is refused');
else bad(`expected 400 for a wrong current password; got ${r.status}`);

r = await api('/api/admin/me/password', {
  method: 'POST', body: JSON.stringify({ newPassword: SECOND, currentPassword: FIRST }),
});
if (r.ok) ok('with the right current password, it changes');
else bad(`changing with the correct current password failed: ${r.status} ${await r.text()}`);

signin = await credentialsSignIn(SECOND);
if (signin.gotSession) ok('the NEW password signs in');
else bad('the new password does not sign in');

signin = await credentialsSignIn(FIRST);
if (!signin.gotSession) ok('and the OLD one no longer does');
else bad('the OLD password still signs in after being changed');

// ── 5. Too short is refused ────────────────────────────────────────────────────────────────────
r = await api('/api/admin/me/password', {
  method: 'POST', body: JSON.stringify({ newPassword: 'short', currentPassword: SECOND }),
});
if (r.status === 400) ok('a too-short password is refused');
else bad(`expected 400 for a short password; got ${r.status}`);

// ── 6. A disabled account cannot hand itself a new way in ──────────────────────────────────────
await db.query(`UPDATE registered_users SET is_banned = true WHERE email = $1`, [EMAIL]);
r = await api('/api/admin/me/password', {
  method: 'POST', body: JSON.stringify({ newPassword: 'another-one-9999', currentPassword: SECOND }),
});
if (r.status === 403) ok('a disabled account cannot set a password even with a live session');
else bad(`expected 403 for a banned account; got ${r.status}`);
await db.query(`UPDATE registered_users SET is_banned = false WHERE email = $1`, [EMAIL]);

// ── 7. An admin can issue a password to somebody who cannot get in at all ──────────────────────
//
// The case the self-serve route cannot reach: setting your own first password needs a session, and
// having no way to sign in is the problem. So the boss sets one and reads it out.
const ADMIN = 'jacobmaddux@starr-surveying.com';
const adminCookie = `authjs.session-token=${await encode({
  token: { email: ADMIN, name: 'QA admin', sub: ADMIN }, secret, salt: 'authjs.session-token', maxAge: 3600,
})}`;
const ISSUED = 'issued-by-boss-7781';
const asAdmin = (init) => fetch(`${BASE}/api/admin/employees/${encodeURIComponent(EMAIL)}/password`, {
  ...init, headers: { 'Content-Type': 'application/json', cookie: adminCookie, ...(init.headers ?? {}) },
});

// Reset to the no-password state first, so this proves the real scenario.
await db.query(`UPDATE registered_users SET password_hash = '' WHERE email = $1`, [EMAIL]);
r = await asAdmin({ method: 'POST', body: JSON.stringify({ newPassword: ISSUED }) });
if (r.ok) ok('an admin can set a password for an employee who has none');
else bad(`admin could not set a password: ${r.status} ${await r.text()}`);

signin = await credentialsSignIn(ISSUED);
if (signin.gotSession) ok('and the employee can sign in with it immediately');
else bad('the admin-issued password does not sign in');

// A non-admin must not be able to do this to a colleague.
const crewCookie = `authjs.session-token=${await encode({
  token: { email: 'jackcabaniss@starr-surveying.com', name: 'crew', sub: 'jackcabaniss@starr-surveying.com' },
  secret, salt: 'authjs.session-token', maxAge: 3600,
})}`;
r = await asAdmin({ method: 'POST', body: JSON.stringify({ newPassword: 'nope-nope-1234' }), headers: { cookie: crewCookie } });
if (r.status === 403) ok('a non-admin is refused (403)');
else bad(`a NON-ADMIN could set another person's password: ${r.status}`);

// ── Clean up, and verify it ────────────────────────────────────────────────────────────────────
const del = await db.query(`DELETE FROM registered_users WHERE email = $1 RETURNING id`, [EMAIL]);
const left = await db.query(`SELECT count(*)::int AS n FROM registered_users WHERE email = $1`, [EMAIL]);
if (del.rowCount === 1 && left.rows[0].n === 0) ok('the test account is gone');
else bad(`cleanup failed — ${left.rows[0].n} row(s) left for ${EMAIL}`);

await db.end();
console.log(findings.length ? `\n  ${findings.length} finding(s)\n` : '\n  clean\n');
process.exit(findings.length ? 1 : 0);
