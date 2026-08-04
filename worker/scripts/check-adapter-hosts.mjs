#!/usr/bin/env node
// worker/scripts/check-adapter-hosts.mjs — does each configured county portal host exist at all?
//
// RESEARCH_PLATFORM_DEEP_BUILD R39b. The cheapest possible question, asked of every adapter config:
// **does this hostname resolve?** Not "does the portal work" — that needs a driven browser, and R37's
// rule is that a vendor is proven by driving it, never by a link. This is the step before that, and
// it is the one that was never taken.
//
// It found that all 16 hosts in `HENSCHEN_CONFIGS` and all 6 in `FIDLAR_CONFIGS` are **ENOTFOUND** —
// not down, not slow, not blocking us: no such name. They look like a guessed pattern
// (`<county>.co.texas.us`) that was never checked against DNS. Burnet's real records portal, found on
// the county's own website, is Tyler at `burnetcountytx-web.tylerhost.net`, which resolves fine.
//
// ── WHY THIS IS A SCRIPT AND NOT A TEST ─────────────────────────────────────────────────────────
//
// A unit test that resolves DNS fails on an aeroplane, in a sandbox, and in any CI runner without
// egress — and a test that fails for reasons unrelated to the code gets skipped, which is worse than
// not having it. This is an operator tool: run it when working a proving pass.
//
// ── IT CHECKS ITSELF FIRST ──────────────────────────────────────────────────────────────────────
//
// A resolver that is simply broken would report every host dead and manufacture exactly the finding
// above. So known-good names are resolved first, and the run ABORTS if they fail. That is the same
// discipline as verifying a negative control actually fired: a probe that can only say "no" has not
// measured anything.
//
//   node worker/scripts/check-adapter-hosts.mjs

import dns from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ADAPTERS = path.join(HERE, '..', 'src', 'adapters');

/** Names that must resolve for any negative result here to mean anything. */
const CONTROL_HOSTS = ['www.google.com', 'search.kofile.com'];

async function resolves(host) {
  try {
    await dns.lookup(host);
    return true;
  } catch {
    return false;
  }
}

/** Every `baseUrl:`/`portalUrl:` host in an adapter file, with the line it came from. */
function hostsIn(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = [];
  const re = /(?:baseUrl|portalUrl|searchUrl)\s*:\s*'https?:\/\/([^/'\s]+)/g;
  let m;
  while ((m = re.exec(src))) {
    out.push({ host: m[1], line: src.slice(0, m.index).split('\n').length });
  }
  return out;
}

const controls = await Promise.all(CONTROL_HOSTS.map(resolves));
if (controls.some((ok) => !ok)) {
  console.error(
    'ABORTING: a known-good hostname did not resolve, so this run cannot tell a dead portal from a\n' +
    'broken resolver. Every "DEAD" it printed would be manufactured. Check connectivity and re-run.',
  );
  process.exit(2);
}

const files = fs.readdirSync(ADAPTERS).filter((f) => f.endsWith('.ts'));
const seen = new Map(); // host -> { ok, where[] }

for (const f of files) {
  for (const { host, line } of hostsIn(path.join(ADAPTERS, f))) {
    if (!seen.has(host)) seen.set(host, { ok: await resolves(host), where: [] });
    seen.get(host).where.push(`${f}:${line}`);
  }
}

const dead = [...seen.entries()].filter(([, v]) => !v.ok);
const live = [...seen.entries()].filter(([, v]) => v.ok);

console.log(`\n${live.length} host(s) resolve, ${dead.length} do not.\n`);
for (const [host, v] of dead) {
  console.log(`DEAD  ${host}`);
  for (const w of v.where) console.log(`        ${w}`);
}

// Exit 0 either way. A dead host is a finding to work through, not a build failure — the router
// already fails closed on unproven vendors, so nothing is broken for a user today.
console.log(
  dead.length
    ? '\nA dead host means the config was never checked against DNS. Find the county\'s real portal\n' +
      'from the county\'s own website, drive it, and only then mark the vendor proven.'
    : '\nEvery configured host resolves. That is NOT proof any of them serve records — drive them.',
);
