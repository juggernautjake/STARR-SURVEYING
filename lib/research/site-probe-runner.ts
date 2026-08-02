// lib/research/site-probe-runner.ts — the half that opens a browser (roadmap §8.3, guarded by §9.9).
//
// `site-probe.ts` decides what a page means. This decides nothing: it opens the URL, describes the
// page's structure, and hands that description over. The split is the point — the judgement is
// testable against fixtures, and the part that touches a government website is small enough to read
// in one sitting and gated in one place.
//
// ── EVERY GUARD §9.9 ASKS FOR, IN ORDER ─────────────────────────────────────────────────────────
//
//   1. Off by default. `research_self_heal_settings.site_probe_enabled` starts false, like every
//      other outward-facing switch in this subsystem.
//   2. One page load. GET the URL, read the DOM, leave. It does NOT submit the search form, so it
//      never puts a query into a county's system or appears in their logs as a user.
//   3. A real timeout and one attempt. A retry loop against a slow government portal is how a probe
//      becomes a load test.
//   4. Degrades to null. No Playwright, no Chromium, no network — the caller gets `available:false`
//      and a reason, never a thrown 500 on somebody's registration screen.
//   5. Saves nothing. The proposal is returned for a person to confirm; §8.5 does the writing.

import type { PageCapture } from './site-probe';

export interface ProbeRunResult {
  available: boolean;
  /** Why not, when `available` is false. Shown to the user verbatim. */
  reason?: string;
  capture?: PageCapture;
  /** How long the page took, so a portal that takes 25s is visible as a fact, not as "it failed". */
  elapsedMs?: number;
}

const NAV_TIMEOUT_MS = 20_000;
/** Truncated hard: this is evidence for a human, not a corpus. */
const TEXT_SAMPLE_CHARS = 1_200;
const MAX_FORMS = 12;
const MAX_TABLES = 12;

async function getPlaywright() {
  try {
    return await import('playwright').catch(() => import('playwright-core'));
  } catch {
    return null;
  }
}

async function getLaunchOptions(): Promise<{ executablePath?: string; args: string[]; headless: boolean }> {
  const baseArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
  try {
    const chromium = (await import('@sparticuz/chromium')).default;
    return { executablePath: await chromium.executablePath(), args: [...chromium.args, ...baseArgs], headless: true };
  } catch {
    return { args: baseArgs, headless: true };
  }
}

/** Runs INSIDE the page. Returns a plain structural description — no data, no records.
 *
 *  Written as one function string rather than several because everything it touches lives in the
 *  page's own realm; passing DOM nodes back across the bridge is not possible, so the flattening has
 *  to happen here. */
const CAPTURE_FN = `() => {
  const cssPath = (el) => {
    if (!el) return '';
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 6) {
      let part = node.tagName.toLowerCase();
      if (node.classList && node.classList.length > 0) {
        const cls = Array.from(node.classList).filter((c) => !/^(ng|css|sc)-/.test(c)).slice(0, 2);
        if (cls.length) part += '.' + cls.map((c) => CSS.escape(c)).join('.');
      }
      const parent = node.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (sameTag.length > 1) part += ':nth-of-type(' + (sameTag.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      if (node.id) { parts[0] = '#' + CSS.escape(node.id); break; }
      node = parent;
    }
    return parts.join(' > ');
  };

  const labelFor = (input) => {
    if (input.id) {
      const l = document.querySelector('label[for="' + CSS.escape(input.id) + '"]');
      if (l) return l.textContent.trim().slice(0, 80);
    }
    const wrap = input.closest('label');
    if (wrap) return wrap.textContent.trim().slice(0, 80);
    const aria = input.getAttribute('aria-label');
    return aria ? aria.trim().slice(0, 80) : null;
  };

  const forms = Array.from(document.querySelectorAll('form')).slice(0, ${MAX_FORMS}).map((form) => ({
    selector: cssPath(form),
    method: form.getAttribute('method'),
    action: form.getAttribute('action'),
    submitSelector: (() => {
      const btn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
      return btn ? cssPath(btn) : null;
    })(),
    fields: Array.from(form.querySelectorAll('input, select, textarea')).slice(0, 30).map((el) => ({
      selector: cssPath(el),
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type'),
      name: el.getAttribute('name'),
      id: el.getAttribute('id'),
      placeholder: el.getAttribute('placeholder'),
      label: labelFor(el),
    })),
  }));

  const tables = Array.from(document.querySelectorAll('table')).slice(0, ${MAX_TABLES}).map((table) => {
    const headerCells = Array.from(table.querySelectorAll('thead th, thead td'));
    const headers = (headerCells.length ? headerCells : Array.from(table.querySelectorAll('tr:first-child th, tr:first-child td')))
      .map((c) => c.textContent.trim().slice(0, 60));
    const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
    const rows = bodyRows.length ? bodyRows : Array.from(table.querySelectorAll('tr')).slice(1);
    const first = rows[0];
    return {
      selector: cssPath(table),
      headers,
      rowCount: rows.length,
      sampleRow: first ? Array.from(first.children).map((c) => c.textContent.trim().slice(0, 60)) : [],
      firstRowLinkSelector: first && first.querySelector('a') ? cssPath(first.querySelector('a')) : null,
    };
  });

  return {
    url: location.href,
    title: document.title,
    forms,
    tables,
    hasCanvas: !!document.querySelector('canvas') || document.querySelectorAll('img').length > 40,
    textSample: (document.body ? document.body.innerText : '').slice(0, ${TEXT_SAMPLE_CHARS}),
  };
}`;

/** Open a portal once and describe its structure. Never submits anything. */
export async function captureSite(url: string): Promise<ProbeRunResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { available: false, reason: 'That is not a URL this can open.' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { available: false, reason: 'Only http and https portals can be probed.' };
  }

  const pw = await getPlaywright();
  if (!pw) {
    return {
      available: false,
      // Named precisely, because "probe failed" on a deploy with no browser sends somebody hunting
      // for a bug in the county's website.
      reason: 'No browser is available in this environment, so unknown portals cannot be probed here. The known-vendor path still works.',
    };
  }

  const started = Date.now();
  let browser: Awaited<ReturnType<typeof pw.chromium.launch>> | null = null;
  try {
    browser = await pw.chromium.launch(await getLaunchOptions());
    const context = await browser.newContext({
      // Identifies us honestly. A probe pretending to be a person's browser is the beginning of an
      // argument with a county IT department we would deserve to lose.
      userAgent: 'StarrSurveying-SiteProbe/1.0 (adapter registration; one page load)',
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    const capture = (await page.evaluate(CAPTURE_FN)) as PageCapture;
    return { available: true, capture, elapsedMs: Date.now() - started };
  } catch (err) {
    return {
      available: false,
      reason: err instanceof Error ? `The portal could not be opened: ${err.message}` : 'The portal could not be opened.',
      elapsedMs: Date.now() - started,
    };
  } finally {
    // One attempt, and always closed. A leaked browser on a serverless invocation is a bill.
    await browser?.close().catch(() => {});
  }
}
