// __tests__/admin/route-params-are-not-promises.test.ts
//
// Owner, 2026-08-04: *"there is a React error #438. There is no way to check the payroll and pay
// rates and money pages."* Then, minutes later: *"all pages show this."*
//
// ── WHAT #438 IS, AND WHY IT TOOK THE PAGE DOWN ─────────────────────────────────────────────────
//
// React's minified error #438 is **"An unsupported type was passed to `use()`"**.
//
// Six pages did `const { id } = use(params)` — the **Next 15** pattern, where route params arrive as
// a Promise. This app is on **next@14.2.35 / react@18.2.0**, where `params` is a plain object. So
// `use()` was handed something that is neither a promise nor a context, threw on every render, and
// the page never mounted: the error boundary caught it and showed "Something went wrong".
//
// ── WHY NOTHING CAUGHT IT ───────────────────────────────────────────────────────────────────────
//
// **The prop was also declared `Promise<{ id: string }>`.** So `use(params)` was correct *against the
// annotation* — and `tsc` checks code against annotations, never annotations against the framework.
// The type and the call were wrong together and agreed with each other, which is the most durable
// kind of wrong: every static check passes, and the failure appears only when a browser renders it.
//
// The build compiled. 22,700 tests passed. The page was dead on arrival.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { codeOf } from '../_helpers/source';

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.next'].includes(e.name)) walk(p, out); }
    else if (/page\.tsx?$/.test(p) || /route\.tsx?$/.test(p) || /layout\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const pages = walk('app');

/** The major version this repo actually runs. The rule below is true for 14 and false for 15, so it
 *  is read rather than assumed — an upgrade should flip this test, not silently invalidate it. */
const nextMajor = Number(
  (JSON.parse(fs.readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> })
    .dependencies.next.replace(/[^0-9.]/g, '').split('.')[0],
);

describe('route params match the framework this app is on', () => {
  it('is checking against the real Next version', () => {
    expect(Number.isFinite(nextMajor)).toBe(true);
    expect(nextMajor).toBeGreaterThanOrEqual(13);
  });

  it('no page unwraps `params` with use(), which throws React #438 on Next 14', () => {
    if (nextMajor >= 15) return; // On 15 this is the correct pattern; the test inverts with the upgrade.
    const offenders = pages
      .filter((f) => /=\s*use\(\s*params\s*\)/.test(codeOf(fs.readFileSync(f, 'utf8'))))
      .map((f) => path.relative(process.cwd(), f));
    expect(
      offenders,
      'React #438 — "An unsupported type was passed to use()". On Next ' + nextMajor + ' `params` is ' +
        'a plain object, so use() throws and the page never mounts:\n  ' + offenders.join('\n  '),
    ).toEqual([]);
  });

  it('no CLIENT component declares params as a Promise — the combination that throws', () => {
    // ── Narrowed after measuring, rather than banning the annotation outright ────────────────────
    //
    // Thirteen files declare `params: Promise<…>`. Eleven are API routes and two are server
    // components, and every one of them **awaits** it — which is harmless, because awaiting a
    // non-promise resolves to the value. They are over-annotated, not broken, and a guard that
    // demanded thirteen edits to fix six real bugs would be mostly noise.
    //
    // A client component cannot await. Its only way to unwrap a promise is `use()`, and `use()` on a
    // plain object is React #438. So `'use client'` + `params: Promise<…>` is the pair that is
    // *always* wrong on Next 14 — and it is exactly what the six broken pages had.
    if (nextMajor >= 15) return;
    const offenders = pages
      .filter((f) => {
        const src = fs.readFileSync(f, 'utf8');
        return /^\s*['"]use client['"]/m.test(src) && /params\s*:\s*Promise</.test(codeOf(src));
      })
      .map((f) => path.relative(process.cwd(), f));
    expect(
      offenders,
      'A client component cannot await, so `params: Promise<…>` leaves `use()` as the only way to ' +
        'unwrap it — and on Next ' + nextMajor + ' that throws React #438 on every render:\n  ' +
        offenders.join('\n  '),
    ).toEqual([]);
  });

  it('the sweep is looking at real pages', () => {
    // Without this, a walk that silently returned nothing would make both assertions pass forever —
    // which is exactly the failure mode that let the original bug ship.
    expect(pages.length).toBeGreaterThan(100);
    expect(pages.some((f) => f.includes('payroll'))).toBe(true);
  });
});
