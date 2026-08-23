// Throwaway: time each step of the capture to find the hang.
import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3216';
const AS = 'jacobmaddux@starr-surveying.com';
const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
const token = await encode({ token: { email: AS, name: 'probe', sub: AS }, secret, salt: 'authjs.session-token', maxAge: 3600 });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
const page = await ctx.newPage();

await page.goto(`${BASE}/admin/design`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="ds-create"]');
await page.fill('.dsx-home__new-row input', 'step probe');
await page.click('[data-testid="ds-create"]');
await page.waitForSelector('.dsx__artboard');
await page.click('[data-testid="ds-palette-item-button.admin"]').catch(() => {});
await page.waitForTimeout(400);

const out = await page.evaluate(async () => {
  // ISOLATION: does a bare foreignObject taint, with no CSS and no external anything?
  const bare = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50">`
    + `<foreignObject x="0" y="0" width="100" height="50">`
    + `<div xmlns="http://www.w3.org/1999/xhtml" style="color:red">hi</div>`
    + `</foreignObject></svg>`;
  const bareUrl = URL.createObjectURL(new Blob([bare], { type: 'image/svg+xml;charset=utf-8' }));
  let bareVerdict;
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = bareUrl; });
    const cv = document.createElement('canvas'); cv.width = 100; cv.height = 50;
    cv.getContext('2d').drawImage(img, 0, 0);
    const b = await new Promise((r) => cv.toBlob(r, 'image/png'));
    bareVerdict = b ? 'bare foreignObject OK: ' + b.size + 'b' : 'bare blob null';
  } catch (e) { bareVerdict = 'bare TAINTED: ' + String(e).slice(0, 90); }

  // And: does a plain SVG rect (no foreignObject) work?
  const rect = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="red"/></svg>`;
  const rectUrl = URL.createObjectURL(new Blob([rect], { type: 'image/svg+xml;charset=utf-8' }));
  let rectVerdict;
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = rectUrl; });
    const cv = document.createElement('canvas'); cv.width = 100; cv.height = 50;
    cv.getContext('2d').drawImage(img, 0, 0);
    const b = await new Promise((r) => cv.toBlob(r, 'image/png'));
    rectVerdict = b ? 'plain svg OK: ' + b.size + 'b' : 'plain blob null';
  } catch (e) { rectVerdict = 'plain TAINTED: ' + String(e).slice(0, 90); }

  const t = [];
  const mark = (label, start) => t.push(`${label}: ${Math.round(performance.now() - start)}ms`);
  const node = document.querySelector('.dsx__artboard');
  const width = 1440;
  const height = node.getBoundingClientRect().height / 0.75;

  let s = performance.now();
  const clone = node.cloneNode(true);
  clone.style.transform = 'none';
  clone.style.width = `${width}px`;
  clone.style.height = `${Math.round(height)}px`;
  clone.querySelectorAll('.dsx__handle, .dsx__size, .dsx__guide, .dsx__gap, .dsx__fold, .dsx__safe').forEach((el) => el.remove());
  mark('clone', s);

  s = performance.now();
  const chunks = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try { for (const rule of Array.from(sheet.cssRules ?? [])) chunks.push(rule.cssText); } catch { /* blocked */ }
  }
  let css = chunks.join('\n');
  mark(`collect(${css.length}b)`, s);

  s = performance.now();
  css = css.replace(/@import\s+url\([^)]*\)\s*;?/gi, '');
  mark('strip-import', s);

  s = performance.now();
  css = css.replace(/url\((['"]?)https?:\/\/[^)'"]+\1\)/gi, 'none');
  mark('strip-remote', s);

  s = performance.now();
  const serialized = new XMLSerializer().serializeToString(clone);
  mark(`serialize(${serialized.length}b)`, s);

  s = performance.now();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.round(height)}">`
    + `<defs><style type="text/css"><![CDATA[\n${css}\n]]></style></defs>`
    + `<foreignObject x="0" y="0" width="${width}" height="${Math.round(height)}">`
    + `<div xmlns="http://www.w3.org/1999/xhtml">${serialized}</div>`
    + '</foreignObject></svg>';
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  mark('svg', s);

  s = performance.now();
  const loaded = await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve('loaded');
    img.onerror = () => resolve('error');
    img.src = url;
    setTimeout(() => resolve('TIMEOUT'), 12000);
  });
  mark(`image(${loaded})`, s);

  if (loaded !== 'loaded') return { steps: t, verdict: `image ${loaded}`, bareVerdict, rectVerdict, size: { width, height } };

  s = performance.now();
  let verdict = 'ok';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = Math.round(height) * 2;
    const c = canvas.getContext('2d');
    c.scale(2, 2);
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    c.drawImage(img, 0, 0);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    verdict = blob ? `blob ${blob.size}b` : 'blob null';
  } catch (e) {
    verdict = String(e).slice(0, 160);
  }
  mark('draw+blob', s);
  return { steps: t, verdict, bareVerdict, rectVerdict, size: { width, height } };
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
