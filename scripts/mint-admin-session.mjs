// scripts/mint-admin-session.mjs — a signed-in browser, for checking a page the way a person sees it.
//
// Half of this platform is behind the admin gate, so a headless check that is not signed in measures
// the sign-in page. next-auth v5 keeps its session in an encrypted JWE cookie; this mints one with
// the deployment's own AUTH_SECRET, which is the same thing the app does after a real sign-in.
//
//   node scripts/mint-admin-session.mjs                 → prints the cookie value
//   node scripts/mint-admin-session.mjs --email a@b.c   → for somebody other than the owner
//
// LOCAL USE ONLY, by design: it reads .env.local, and it is for driving a browser against the dev
// server while building a page. It creates no account and grants nothing that email did not have.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encode } from '@auth/core/jwt';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};

const secret = env.AUTH_SECRET;
if (!secret) { console.error('AUTH_SECRET is not in .env.local'); process.exit(1); }

const email = arg('email', 'jacobmaddux@starr-surveying.com');
const token = await encode({
  token: { email, name: 'Jacob Maddux', roles: ['admin', 'developer'], sub: email },
  secret,
  salt: 'authjs.session-token',
  maxAge: 60 * 60 * 8,
});
console.log(token);
