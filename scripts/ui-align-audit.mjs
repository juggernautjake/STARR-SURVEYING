// scripts/ui-align-audit.mjs — measure alignment and padding defects across the admin surface.
//
// Owner, 2026-08-14: *"There are tons of places where fields and buttons and text are not aligned,
// or are awkward sizes relative to each other… a field does not sit in vertical alignment with a
// button sitting beside it, so it looks janky."*
//
// ── WHY THIS IS MEASURED AND NOT EYEBALLED ──────────────────────────────────────────────────────
//
// There are 148 admin routes. Looking at each one and judging "does that look right" is both slow
// and unreliable — the eye stops noticing a 3px offset after the fortieth screen, and it cannot
// tell 38px from 36px at all. Every check below reduces to arithmetic on `getBoundingClientRect`,
// so the same defect scores the same on Tuesday as it did on Monday, and a fix can be PROVEN by the
// number going down.
//
// ── WHAT COUNTS AS A DEFECT ─────────────────────────────────────────────────────────────────────
//
// Each rule below is written to fire on things a person would call janky and stay silent on things
// they would call deliberate. The hard part is not detecting misalignment; it is not crying wolf.
// The thresholds exist for that reason and each one is justified where it is declared.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';

const BASE = argValue('--base') ?? 'http://127.0.0.1:3040';
const ONLY = argValue('--only');
// A comma-separated route list, for measuring one workspace before and after a fix. A full sweep
// against the dev server costs about an hour — Next compiles each route on its first visit — so the
// working loop is `--routes` over the group being fixed, and the full sweep is a slice boundary.
const ROUTES_ARG = argValue('--routes');
const LIMIT = Number(argValue('--limit') ?? '0');
const WIDTH = Number(argValue('--width') ?? '1440');
const HEIGHT = Number(argValue('--height') ?? '900');
const OUT = argValue('--out') ?? 'docs/planning/qa-evidence/align-audit';
const SHOTS = process.argv.includes('--shot');
const ADMIN_EMAIL = argValue('--as') ?? 'jacobmaddux@starr-surveying.com';

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** Routes come from the registry the nav itself uses, so the audit cannot drift from the product. */
function routesFromRegistry() {
  const src = fs.readFileSync('lib/admin/route-registry.ts', 'utf8');
  const found = [...src.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]);
  return [...new Set(found)]
    .filter((h) => h.startsWith('/admin') && !h.includes('[') && !h.includes(':'))
    .sort();
}

// ── The measurement, run inside the page ────────────────────────────────────────────────────────
//
// Everything in here executes in the browser. It is one big function rather than several because a
// single pass over the DOM is dramatically faster than several, and on a 148-page sweep that is the
// difference between four minutes and half an hour.
const PROBE = () => {
  const findings = [];
  const VIEW_W = document.documentElement.clientWidth;

  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) return false;
    // The screen-reader-only pattern: a 1×1 absolutely-positioned control, clipped away, with a
    // -1px margin to keep it out of the flow. `/admin/receipts/new` keeps three of them — the
    // camera, file and bulk `<input type=file>` behind its visible buttons — and the -1px margin
    // duly reported as "this input starts 1.0px off the left edge its siblings share".
    //
    // A control nobody can see cannot be misaligned, and the pattern is CORRECT accessibility
    // practice: hiding those inputs with `display: none` would take them out of the a11y tree.
    // Flagging it would train a reader to distrust `left-ragged`, which is the one rule here with
    // the tightest threshold and so the least slack for noise.
    const clipped = cs.clip === 'rect(0px, 0px, 0px, 0px)' || cs.clipPath === 'inset(50%)';
    if (clipped && r.width <= 2 && r.height <= 2) return false;
    return true;
  };

  /**
   * The class list, minus styled-jsx's generated `jsx-<hash>` / `jsx-undefined` noise, which is a
   * build artefact and not something anyone can grep for.
   */
  const classes = (el) =>
    (typeof el.className === 'string' ? el.className : '')
      .trim().split(/\s+/).filter(Boolean).filter((c) => !c.startsWith('jsx-')).slice(0, 3).join('.');

  /** A short, stable description of an element, good enough to find it again in the source. */
  const describe = (el) => {
    const cls = classes(el);
    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28);
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${txt ? ` "${txt}"` : ''}`;
  };

  /**
   * The same element WITHOUT its text — the shape, not the instance.
   *
   * This is what findings collapse on. Keying on `describe()` meant a receipts list of sixteen
   * identical rows reported as forty-eight separate problems, because each row's merchant name made
   * its key unique. One defect repeated down a list is ONE thing to fix.
   */
  const shape = (el) => {
    const cls = classes(el);
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`;
  };

  /**
   * Checkboxes and radios are ~14px by definition and sit beside 32–40px controls everywhere by
   * design. Comparing their HEIGHT to a neighbour is noise on every table in the product. Their
   * CENTRE line is still compared — a checkbox that does not centre with the control beside it is
   * exactly the janky thing being hunted.
   */
  const isTickbox = (el) =>
    el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio');

  /**
   * Is this element inside floating chrome that is pinned to the viewport?
   *
   * The first version of this audit reported the floating action dock on ALL 148 pages: its pull
   * handle is 56px tall beside 48px buttons, which trips the height rule. That composition is
   * deliberate — the handle is a tab spanning the bar, not a button that failed to match. A rule
   * that fires on every page is a rule nobody reads, and it would have buried the real findings, so
   * pinned chrome is measured for overflow and nothing else.
   */
  const inFixedChrome = (el) => {
    let node = el;
    for (let i = 0; i < 6 && node && node !== document.body; i++) {
      const cs = getComputedStyle(node);
      if (cs.position === 'fixed' || cs.position === 'sticky') return true;
      node = node.parentElement;
    }
    return false;
  };

  /**
   * Does this read as a target — something with a box you aim at — or as text you click?
   *
   * A `<button>` with no border and no background is a text link wearing a button tag: "choose one"
   * inside a sentence, "← Back to Research" above a heading, "last 30d" beside a date field. It is
   * sized by the line it belongs to, and comparing its HEIGHT to the field next to it says nothing
   * — `/admin/equipment/overrides` reported an 18px underlined "last 30d" as 22.4px out of line
   * with a 40px date input, which no sane change could fix. Its CENTRE still matters, so it stays
   * in `row-centre`; only the height comparison and the small-target floor stand down.
   */
  const hasBox = (el) => {
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    const opaque = bg && bg !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(bg);
    return parseFloat(cs.borderTopWidth) > 0 || opaque || cs.backgroundImage !== 'none';
  };

  const CONTROL = 'input:not([type=hidden]), select, textarea, button, a.btn, [role=button]';
  const controls = [...document.querySelectorAll(CONTROL)]
    .filter(isVisible)
    .filter((el) => !inFixedChrome(el));

  /**
   * How far apart are two elements in the tree — the larger of the two hops up to their nearest
   * common ancestor?
   *
   * Used to reject pairs that share a horizontal band without sharing a ROW. `/admin/cad` is where
   * this became unavoidable: its vertical tool rail sits immediately left of the layers panel, so a
   * 36px rail button and a 22px panel input land in the same 24px band, 40px apart horizontally,
   * and got reported as "side by side, centres differ by 14px". They are not side by side — one is
   * in a column of tools and the other is in a list of layers, and no change could satisfy both.
   *
   * A real row is shallow: a field in its own wrapper beside a button in its own wrapper is 2 or 3
   * hops to the common ancestor. Cross-region pairs are 5 and up. The cap is 4.
   */
  const treeDistance = (a, b) => {
    const chain = [];
    for (let n = a; n && n !== document.body; n = n.parentElement) chain.push(n);
    let up = 0;
    for (let n = b; n && n !== document.body; n = n.parentElement, up++) {
      const i = chain.indexOf(n);
      if (i !== -1) return Math.max(i, up);
    }
    return 99;
  };

  // ── RULE 1 — controls side by side that do not share a centre line ────────────────────────────
  //
  // The owner's headline complaint. Two controls are "in a row" when their vertical spans overlap
  // by more than half the shorter one — that is what the eye reads as "beside each other". They are
  // misaligned when their CENTRES differ. Centre rather than top, because a 40px button next to a
  // 34px input is fine if both are centred and obviously wrong if they are top-aligned.
  //
  // Grouped by VISUAL ROW, not by parent element. The first version of this compared direct
  // siblings only and found almost nothing, because the real-world shape of the bug is a field in
  // its own `.field` wrapper next to a button in its own wrapper — different parents, same row,
  // and visibly out of line. Bucketing by vertical band finds those; grouping by parent cannot.
  const rows = new Map();
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    // 24px bands, so two controls on the same visual line land together even when their heights
    // differ; each control is registered in the band its centre falls in and the one below, so a
    // pair straddling a boundary is still compared.
    const band = Math.floor((r.top + r.height / 2) / 24);
    for (const b of [band, band + 1]) {
      if (!rows.has(b)) rows.set(b, []);
      rows.get(b).push(el);
    }
  }
  for (const [, kidsRaw] of rows) {
    const kids = [...new Set(kidsRaw)];
    if (kids.length < 2) continue;
    const boxes = kids.map((el) => ({ el, r: el.getBoundingClientRect() }));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const overlap = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        const shorter = Math.min(a.r.height, b.r.height);
        if (overlap < shorter * 0.5) continue;          // stacked, not side by side
        if (Math.abs(a.r.left - b.r.left) < 2) continue; // same column, stacked
        const gap = Math.max(a.r.left, b.r.left) - Math.min(a.r.right, b.r.right);
        if (gap > 120) continue; // far apart across the page; the eye does not line these up
        // Same band, different region: a tool rail beside a panel is not a row. See `treeDistance`.
        if (treeDistance(a.el, b.el) > 4) continue;
        const ca = a.r.top + a.r.height / 2;
        const cb = b.r.top + b.r.height / 2;
        const drift = Math.abs(ca - cb);
        // 1.5px is below the threshold of noticing on its own but is a reliable signal of an
        // unintended offset; sub-pixel layout rounding stays under it.
        if (drift >= 1.5) {
          findings.push({
            rule: 'row-centre', severity: drift >= 4 ? 'high' : 'medium',
            px: +drift.toFixed(1),
            detail: `${describe(a.el)} and ${describe(b.el)} sit side by side but their centres differ by ${drift.toFixed(1)}px`,
            container: describe(a.el.parentElement ?? a.el),
            sig: `${shape(a.el)}|${shape(b.el)}|${shape(a.el.parentElement ?? a.el)}`,
          });
        }
        // Different heights on neighbouring controls is the "awkward sizes relative to each other"
        // complaint. 2px allows for a border difference; 4px+ is visible.
        const dh = Math.abs(a.r.height - b.r.height);
        const compares = (el) => el.tagName !== 'A' && !isTickbox(el) && hasBox(el);
        if (dh >= 4 && compares(a.el) && compares(b.el)) {
          findings.push({
            rule: 'row-height', severity: dh >= 8 ? 'high' : 'medium',
            px: +dh.toFixed(1),
            detail: `${describe(a.el)} is ${a.r.height.toFixed(0)}px tall, ${describe(b.el)} is ${b.r.height.toFixed(0)}px — beside each other`,
            container: describe(a.el.parentElement ?? a.el),
            sig: `${shape(a.el)}:${Math.round(a.r.height)}|${shape(b.el)}:${Math.round(b.r.height)}`,
          });
        }
      }
    }
  }

  // ── RULE 2 — ragged left edges in a vertical stack ────────────────────────────────────────────
  //
  // Children of the same container that are meant to line up but are a few pixels out. A real
  // indent is deliberate and large; 1–8px is always an accident (a stray margin, a border on one
  // sibling, a input that carries its own padding).
  //
  // Elements inside an `<svg>` are skipped. A chart's `<path>` and `<circle>` children are placed by
  // the plotting maths, not by layout, and "this arc starts 7.6px off its siblings" is a statement
  // about the data. Left in, one coverage chart alone contributed 109 findings that no CSS change
  // could ever fix — the loudest false positive in the first sweep.
  const stacks = new Map();
  for (const el of document.querySelectorAll('main *, [class*=page] *')) {
    const parent = el.parentElement;
    if (!parent || !isVisible(el)) continue;
    if (el.closest('svg')) continue;
    const cs = getComputedStyle(parent);
    const stacked = cs.display === 'block' || (cs.display === 'flex' && cs.flexDirection === 'column');
    if (!stacked) continue;
    if (!stacks.has(parent)) stacks.set(parent, []);
    stacks.get(parent).push(el);
  }
  for (const [parent, kids] of stacks) {
    if (kids.length < 3) continue;
    // A stack can be aligned to its RIGHT edge, and then its left edges are ragged by arithmetic —
    // the items are simply different widths. `/admin/finances/overview` at 390px stacks From / To /
    // Group by / Recalculate / Audit against a shared right edge at x=341, and the rule read the
    // resulting 2.5px difference in left edges as a defect. Asking a right-aligned stack to also
    // share a left edge is asking for both, which is only possible if every item is the same width.
    const rights = kids.map((el) => +el.getBoundingClientRect().right.toFixed(1));
    const rightAligned = rights.length > 2 && Math.max(...rights) - Math.min(...rights) <= 1;
    if (rightAligned) continue;
    const lefts = kids.map((el) => +el.getBoundingClientRect().left.toFixed(1));
    const counts = new Map();
    for (const l of lefts) counts.set(l, (counts.get(l) ?? 0) + 1);
    const mode = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!mode || mode[1] < 2) continue;
    kids.forEach((el, i) => {
      const d = Math.abs(lefts[i] - mode[0]);
      if (d >= 1 && d <= 8) {
        findings.push({
          rule: 'left-ragged', severity: 'low', px: +d.toFixed(1),
          detail: `${describe(el)} starts ${d.toFixed(1)}px off the ${mode[0].toFixed(0)}px left edge its ${mode[1]} siblings share`,
          container: describe(parent),
          sig: `${shape(el)}|${shape(parent)}`,
        });
      }
    });
  }

  // ── RULE 3 — how many different control heights does one page use ─────────────────────────────
  //
  // A page with five different button heights looks unconsidered even when every individual pair is
  // within tolerance. Counted per role so a big primary action is not compared against a tiny icon.
  const heights = { input: new Set(), button: new Set() };
  for (const el of controls) {
    const t = el.tagName.toLowerCase();
    const r = el.getBoundingClientRect();
    if (r.width < 40) continue;                                   // icon buttons are their own thing
    // A `<button>` taller than 64px is not a control whose height was chosen — it is a CARD with a
    // click handler, and its height comes from the content inside it. `/admin/payroll` paints its
    // fourteen position cards and three action cards as buttons; they measured 99, 123 and 166px
    // and kept the page at four "button heights" after every actual control on it had been brought
    // to 40. Counting them asks the page to make a card the same height as a filter pill, which is
    // not the defect this rule is looking for.
    // Keyed on ROLE, not tag name: `/admin/employees` and `/admin/my-notes` paint their cards as
    // `[role=button]` and `a.btn` rather than `<button>`, and at 143–194px tall they were counting
    // as "button heights" on a rule that is about controls.
    const isField = t === 'input' || t === 'select' || t === 'textarea';
    if (!isField && r.height > 64) continue;
    // Same reasoning as `hasBox` above: a boxless button is text, and its height is the line's, not
    // a size anybody picked for a control.
    if (t === 'button' && !hasBox(el)) continue;
    const h = Math.round(r.height);
    if (t === 'input' || t === 'select' || t === 'textarea') heights.input.add(h);
    else heights.button.add(h);
  }
  for (const [role, set] of Object.entries(heights)) {
    if (set.size >= 4) {
      findings.push({
        rule: 'height-spread', severity: set.size >= 6 ? 'medium' : 'low', px: set.size,
        detail: `${set.size} different ${role} heights on one page: ${[...set].sort((a, b) => a - b).join(', ')}px`,
        container: 'page',
        sig: `height-spread|${role}`,
      });
    }
  }

  // ── RULE 4 — targets too small to hit ─────────────────────────────────────────────────────────
  //
  // Only things that LOOK like buttons. A `<button>` with no border and no background is a text
  // link wearing a button tag — "choose one" inside a sentence, "← Back to Research" above a
  // heading — and it is sized by the text it sits in. Demanding 32px of it would break the line it
  // belongs to, so the rule would be asking for a worse screen. If it has a box, it reads as a
  // target and the floor applies.
  /**
   * A surface may DECLARE that it is compact, with `data-ui-density="compact"` on its root, and the
   * floor stands down inside it.
   *
   * The 28px floor is written for the rest of the admin, which is used one-handed in a truck.
   * `/admin/cad` is a drawing editor driven with a mouse at a desk — tool rail, docked panels,
   * command line, status bar — where an 18px status toggle and a 22px panel field are the same
   * choice AutoCAD and QGIS make, not sloppiness. Raising them would rewrite the editor's density,
   * which D6 of the plan already argued against.
   *
   * It is an attribute rather than a route check inside this script for two reasons: the exception
   * is then visible to whoever reads the component, and a route list here would silently stop
   * matching the day the page moves. Only THIS rule stands down — misaligned centres, mismatched
   * neighbours and height spread are still reported inside a compact subtree.
   */
  const inDeclaredCompact = (el) => !!el.closest('[data-ui-density="compact"]');

  for (const el of controls) {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.height < 28 && r.width > 24 && hasBox(el) && !inDeclaredCompact(el)) {
      findings.push({
        rule: 'small-target', severity: 'low', px: +r.height.toFixed(0),
        detail: `${describe(el)} is only ${r.height.toFixed(0)}px tall`,
        container: describe(el.parentElement ?? el),
        sig: `${shape(el)}:${Math.round(r.height)}`,
      });
    }
  }

  // ── RULE 5 — anything wider than the window ───────────────────────────────────────────────────
  //
  // Content inside a horizontal SCROLLER is not overflow — it is the point of the scroller. A chip
  // row that scrolls sideways on a phone, a wide table in an `overflow-x: auto` wrapper, and a
  // tab strip that slides are all deliberate, and all of them extend past the right edge by
  // design. Measured at 390px, that distinction is most of the rule's output: the file explorer's
  // type chips and the research library's filter row both scroll on purpose and both reported.
  //
  // What the rule is for is content that is CLIPPED or that pushes the page itself sideways — a
  // table with no wrapper, a filter strip that neither wraps nor scrolls. Those have no scrollable
  // ancestor, so they still fire.
  const inScroller = (el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  };

  for (const el of document.querySelectorAll('body *')) {
    if (!isVisible(el)) continue;
    if (inScroller(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > VIEW_W + 1 && r.width > 0 && r.width <= VIEW_W * 2) {
      findings.push({
        rule: 'overflow', severity: 'high', px: +(r.right - VIEW_W).toFixed(0),
        detail: `${describe(el)} extends ${(r.right - VIEW_W).toFixed(0)}px past the right edge`,
        container: describe(el.parentElement ?? el),
        sig: `${shape(el)}|${shape(el.parentElement ?? el)}`,
      });
    }
  }

  // Collapse identical findings — one container with twenty identical children should read as one
  // problem to fix, not twenty. Collapsing is on `sig`, which is built from tag + class only: the
  // earlier version keyed on the rendered text and so never merged the list rows it was written for.
  const seen = new Map();
  for (const f of findings) {
    const key = `${f.rule}|${f.sig}`;
    if (!seen.has(key)) seen.set(key, { ...f, count: 1 });
    else seen.get(key).count++;
  }
  return [...seen.values()];
};

async function main() {
  const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
  if (!secret) throw new Error('AUTH_SECRET is not set — run with --env-file=.env.local');

  const token = await encode({
    token: {
      email: ADMIN_EMAIL, name: 'UI Audit', roles: ['admin', 'developer'], role: 'admin',
      sub: 'ui-audit', rolesLastChecked: Math.floor(Date.now() / 1000),
    },
    secret, salt: 'authjs.session-token', maxAge: 60 * 60 * 6,
  });

  let routes = ROUTES_ARG ? ROUTES_ARG.split(',').map((r) => r.trim()).filter(Boolean) : routesFromRegistry();
  if (ONLY) routes = routes.filter((r) => r.includes(ONLY));
  if (LIMIT) routes = routes.slice(0, LIMIT);

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const host = new URL(BASE).hostname;
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
  await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: host, path: '/', httpOnly: true, secure: false }]);
  const page = await ctx.newPage();

  const all = [];
  let i = 0;
  for (const route of routes) {
    i++;
    const label = `[${String(i).padStart(3)}/${routes.length}] ${route}`;
    try {
      const res = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      // Let client fetches settle; these pages populate after mount.
      await page.waitForTimeout(2500);
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      const status = res?.status() ?? 0;
      const findings = await page.evaluate(PROBE);
      for (const f of findings) all.push({ route, ...f });
      if (SHOTS && findings.length) {
        await page.screenshot({ path: path.join(OUT, route.replace(/\//g, '_') + '.png') }).catch(() => {});
      }
      const high = findings.filter((f) => f.severity === 'high').length;
      console.log(`${label}  ${status}  findings=${findings.length}${high ? ` (high ${high})` : ''}`);
    } catch (err) {
      console.log(`${label}  ERROR ${String(err.message).slice(0, 70)}`);
      all.push({ route, rule: 'load', severity: 'high', px: 0, detail: String(err.message).slice(0, 160), container: '', count: 1 });
    }
  }

  await browser.close();

  const byRule = {};
  for (const f of all) byRule[f.rule] = (byRule[f.rule] ?? 0) + 1;
  const byRoute = {};
  for (const f of all) byRoute[f.route] = (byRoute[f.route] ?? 0) + 1;

  const stamp = new Date().toISOString().slice(0, 10);
  // A subset run must not clobber the full sweep's evidence file; `--tag before-a4` names it.
  const tag = argValue('--tag') ?? (ROUTES_ARG ? 'subset' : '');
  const jsonPath = path.join(OUT, `findings-${WIDTH}w${tag ? `-${tag}` : ''}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ stamp, width: WIDTH, routes: routes.length, byRule, byRoute, findings: all }, null, 2));

  console.log('\n──────── SUMMARY ────────');
  console.log('routes visited :', routes.length);
  console.log('findings       :', all.length);
  console.log('by rule        :', JSON.stringify(byRule));
  console.log('worst routes   :');
  Object.entries(byRoute).sort((a, b) => b[1] - a[1]).slice(0, 15)
    .forEach(([r, n]) => console.log(`   ${String(n).padStart(4)}  ${r}`));
  console.log('\nwrote', jsonPath);
}

main().catch((e) => { console.error(e); process.exit(1); });
