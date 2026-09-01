// scripts/build-brand-guide.mjs
//
// Generates the standalone brand guide — the one that goes to printers and apparel vendors — from
// `lib/branding/palette.ts` and `lib/branding/logos.ts`, the same two modules `/admin/branding`
// renders.
//
// ── WHY GENERATED AND NOT HAND-WRITTEN ──────────────────────────────────────────────────────────
//
// The first version of this guide was a hand-written HTML file. It was correct on the day it was
// written and would have been wrong the first time a colour moved, with no way to tell which copy
// on which laptop was current. A brand guide's whole value is being the answer, so the file and the
// page have to come from one list.
//
//   node scripts/build-brand-guide.mjs [--out <dir>]
//
// Writes <dir>/index.html and <dir>/assets/*. Default out dir is `dist/brand-guide`.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// The brand data is TypeScript. Rather than add a build step, each module is transpiled in memory
// with the TypeScript compiler the repo already depends on — this script has one job and does not
// deserve a pipeline of its own.
//
// ── IT LOADED ONE MODULE AND READ TWO ───────────────────────────────────────────────────────────
//
// This loaded `palette.ts` alone and then reached for `P.LOGO_KIND_ORDER`, `P.BRAND_LOGOS` and
// `P.logosOfKind` — every one of which lives in `logos.ts`. So the script threw
// "Cannot read properties of undefined" on its ninth line of output and had never once produced a
// guide, while the Downloads tab told the owner to take the folder it writes. Nothing tested it,
// because a build script that is never run has no failing assertion to notice.
//
// `logos.ts` imports only a TYPE from `palette.ts`, which `transpileModule` erases, so the two
// transpile independently and merge into one namespace.
function loadBrand() {
  const ts = require('typescript');
  const load = (rel, tmpName) => {
    const js = ts.transpileModule(fs.readFileSync(rel, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const tmp = path.join('.next', 'cache', tmpName);
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, js);
    return import(pathToFileURL(path.resolve(tmp)).href);
  };
  return Promise.all([
    load('lib/branding/palette.ts', 'brand-palette.mjs'),
    load('lib/branding/logos.ts', 'brand-logos.mjs'),
  ]).then(([palette, logos]) => ({ ...palette, ...logos }));
}

const arg = (f) => { const i = process.argv.indexOf(f); return i === -1 ? undefined : process.argv[i + 1]; };
const OUT = path.resolve(arg('--out') ?? 'dist/brand-guide');

const P = await loadBrand();

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── pieces ──────────────────────────────────────────────────────────────────────────────────────

const swatch = (c) => {
  const inkOn = c.ink === 'white' ? '#FFFFFF' : '#0F1419';
  return `      <div class="sw">
        <div class="chip" style="background:${c.hex};color:${inkOn}">
          <span>${c.group === 'core' ? 'CORE' : ''}</span>
          <span class="ink" style="background:${inkOn};color:${c.hex}">${c.ink === 'white' ? 'WHITE INK' : 'DARK INK'}</span>
        </div>
        <div class="body">
          <h5>${esc(c.name)}</h5>
          <code>${c.hex}</code>
          <div class="vals">RGB ${c.rgb.join(' ')}<br>CMYK ${c.cmyk.join(' ')}</div>
          <p class="use">${esc(c.use)}</p>
          ${c.sampledFrom ? `<p class="src">Sampled from ${esc(c.sampledFrom)}</p>` : ''}
        </div>
      </div>`;
};

const logoCard = (l) => `      <div class="card">
        <div class="plate plate--${l.plate ?? 'white'}"><img src="assets/${l.file}" alt="${esc(l.name)}"></div>
        <div class="cbody">
          ${l.primary ? '<span class="tag">Primary</span>' : ''}
          <h4>${esc(l.name)}</h4>
          <p>${esc(l.note)}</p>
        </div>
      </div>`;

const SAMPLE_SIZE = {
  'Oswald': '2.4rem', 'Archivo Black': '2rem', 'Bebas Neue': '2.6rem', 'Alfa Slab One': '1.9rem',
  'Rye': '1.75rem', 'Inter': '1.35rem', 'Source Sans 3': '1.25rem', 'Roboto Condensed': '1.4rem',
  'Source Serif 4': '1.4rem', 'JetBrains Mono': '1.15rem',
};
const WEIGHT = {
  'Oswald': 700, 'Roboto Condensed': 700, 'Inter': 600, 'JetBrains Mono': 700, 'Source Serif 4': 700,
};
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 &amp; ° ′ ″';
const ALPHA_CAPS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789 &amp; ° ′ ″';

const fontSpec = (f) => `      <div class="font">
        <div class="fhead"><span class="fname">${esc(f.name)}</span><span class="frole">${esc(f.purpose)}</span></div>
        <div class="fspec">
          <p class="fsample" style="font-family:${f.stack};font-size:${SAMPLE_SIZE[f.name] ?? '1.6rem'};font-weight:${WEIGHT[f.name] ?? 400}${f.capsOnly ? ';letter-spacing:.05em' : ''}">${esc(f.sample)}</p>
          <p class="falpha" style="font-family:${f.stack}">${f.capsOnly ? ALPHA_CAPS : ALPHA}</p>
        </div>
        <div class="fuse"><strong>Use for:</strong> ${esc(f.use)}${f.capsOnly ? ' <strong>Caps only</strong> — it has no true lowercase.' : ''}</div>
      </div>`;

const inkRow = (c) => {
  const good = c.ink === 'white' ? c.contrastVsWhite : c.contrastVsInk;
  const bad = c.ink === 'white' ? c.contrastVsInk : c.contrastVsWhite;
  return `        <tr><td><span class="dot" style="background:${c.hex}"></span>${esc(c.name)} <code>${c.hex}</code></td>` +
    `<td><strong>${c.ink === 'white' ? 'White' : 'Ink Black'}</strong></td>` +
    `<td><span class="r ok">${good.toFixed(2)}:1</span></td>` +
    `<td><span class="r no">${bad.toFixed(2)}:1</span></td></tr>`;
};

const bannedTile = (p) => {
  const fg = P.colourByName(p.fg), bg = P.colourByName(p.bg);
  if (!fg || !bg) return '';
  return `      <div class="combo">
        <div class="demo" style="background:${bg.hex};color:${fg.hex}">
          <span class="big">Starr Surveying</span><span class="small">Unreadable</span>
        </div>
        <div class="cap"><span>${esc(p.fg)} on ${esc(p.bg)}</span><span class="r no">${p.ratio.toFixed(2)}:1</span></div>
      </div>`;
};

const printRow = (c) => `        <tr><td><span class="dot" style="background:${c.hex}"></span>${esc(c.name)}</td>` +
  `<td>${esc(P.GROUP_LABELS[c.group].split(' ')[0])}</td><td><code>${c.hex}</code></td>` +
  `<td><code>${c.rgb.join(' ')}</code></td><td><code>${c.cmyk.join(' ')}</code></td>` +
  `<td>${c.ink === 'white' ? 'White' : 'Dark'}</td></tr>`;

const hexBlock = P.BRAND_COLOURS
  .map((c) => `${c.name.padEnd(16)}${c.hex}  ${c.ink === 'white' ? 'white ink' : 'dark ink'}`)
  .join('\n');

const colourSections = P.GROUP_ORDER.map((g) => {
  const items = P.coloursInGroup(g);
  if (!items.length) return '';
  return `    <h3>${esc(P.GROUP_LABELS[g])}</h3>\n    <div class="grid g4">\n${items.map(swatch).join('\n')}\n    </div>`;
}).join('\n\n');

const logoSections = P.LOGO_KIND_ORDER.map((k) => {
  const items = P.logosOfKind(k);
  if (!items.length) return '';
  const wide = k === 'apparel' || k === 'lockup';
  return `    <h3>${esc(P.LOGO_KIND_LABELS[k])}</h3>\n    <div class="grid ${wide ? 'g3' : 'g4'}">\n${items.map(logoCard).join('\n')}\n    </div>`;
}).join('\n\n');

// ── THE COLOURWAY MATRIX ────────────────────────────────────────────────────────────────────
//
// A vendor's question is almost never "what does the badge look like" — it is "what do I have in
// forest green", asked while quoting a garment. The portal answers that by opening a colourway;
// paper cannot open anything, so here it is a table: a row per mark, a column per colourway, and
// the answer is a column you read straight down.
const wayHead = P.RECOLOUR_WAYS.map((w) => `<th>${esc(w.label)}</th>`).join('');
const wayRows = P.RECOLOUR_MARKS.map((m) => {
  const cells = P.RECOLOUR_WAYS.map((w) => {
    const f = P.recolourFile(m.slug, w.id);
    return `<td><img src="assets/${f}" alt="${esc(m.label)} in ${esc(w.label)}" loading="lazy"></td>`;
  }).join('');
  return `        <tr><th scope="row">${esc(m.label)}</th>${cells}</tr>`;
}).join('\n');

const wayNotes = P.RECOLOUR_WAYS.map((w) => {
  const swatches = w.colours.map((n) => {
    const c = P.colourByName(n);
    return c ? `<i style="background:${c.hex}" title="${esc(c.name)} ${c.hex}"></i>` : '';
  }).join('');
  return `      <li><span class="ways">${swatches}</span><strong>${esc(w.label)}</strong> — ${esc(w.note)}</li>`;
}).join('\n');

const whiteInk = P.BRAND_COLOURS.filter((c) => c.ink === 'white');
const darkInk = P.BRAND_COLOURS.filter((c) => c.ink === 'dark');
const darkInkCount = darkInk.filter((c) => c.hex !== '#FFFFFF').length;

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Starr Surveying — Brand &amp; Style Guide</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${P.googleFontsHref()}" rel="stylesheet">
<style>
  :root{--ink:#0F1419;--slate:#4B5563;--steel:#9CA3AF;--mist:#E5E7EB;--cream:#F5EFE3;
        --navy:#1D3095;--midnight:#152050;--red:#BD1218;
        --pass:#047857;--warn:#B54708;--fail:#B42318}
  *{box-sizing:border-box}
  body{margin:0;background:var(--cream);color:var(--ink);
       font:15px/1.6 Inter,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
  .wrap{max-width:1240px;margin:0 auto;padding:0 30px 90px}
  header{background:var(--midnight);color:#fff;position:relative;overflow:hidden}
  header::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,rgba(189,18,24,.9) 0%,rgba(189,18,24,0) 46%)}
  header .inner{max-width:1240px;margin:0 auto;padding:58px 30px 50px;position:relative;z-index:1}
  header h1{font-family:Oswald,sans-serif;font-weight:700;font-size:2.9rem;margin:0 0 6px;text-transform:uppercase;line-height:1}
  header .sub{font-family:'Bebas Neue',sans-serif;font-size:1.3rem;letter-spacing:.16em;opacity:.9;margin-bottom:14px}
  header p{margin:0;max-width:64ch;font-size:1rem;opacity:.94}
  header .meta{margin-top:22px;font-size:.76rem;letter-spacing:.14em;text-transform:uppercase;opacity:.8}
  nav{background:var(--ink);color:#fff;padding:15px 30px}
  nav ul{max-width:1240px;margin:0 auto;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:6px 22px}
  nav a{color:#fff;text-decoration:none;font-size:.79rem;letter-spacing:.06em;text-transform:uppercase;opacity:.75;font-weight:500}
  nav a:hover{opacity:1;text-decoration:underline}
  h2{font-family:Oswald,sans-serif;font-weight:600;text-transform:uppercase;letter-spacing:.03em;font-size:1.55rem;
     margin:60px 0 4px;padding-bottom:11px;border-bottom:3px solid var(--navy);display:flex;align-items:baseline;gap:.6rem;scroll-margin-top:16px}
  h2 .n{font-family:'Bebas Neue',sans-serif;color:var(--red);font-size:1.45rem}
  h3{font-family:Oswald,sans-serif;font-weight:600;font-size:.95rem;text-transform:uppercase;letter-spacing:.09em;color:var(--slate);margin:34px 0 13px}
  .lede{color:var(--slate);margin:13px 0 24px;max-width:76ch;font-size:.95rem}
  .grid{display:grid;gap:17px}
  .g4{grid-template-columns:repeat(auto-fill,minmax(min(215px,100%),1fr))}
  .g3{grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr))}
  .g2{grid-template-columns:repeat(auto-fill,minmax(min(400px,100%),1fr))}
  .sw,.card,.combo,.font{background:#fff;border:1px solid var(--mist);border-radius:12px;overflow:hidden}
  .chip{height:94px;display:flex;align-items:flex-end;justify-content:space-between;gap:.5rem;padding:.6rem .7rem;font-size:.68rem;font-weight:700;letter-spacing:.05em}
  .ink{font-size:.58rem;padding:2px 7px;border-radius:999px;font-weight:700;letter-spacing:.06em;white-space:nowrap}
  .body,.cbody{padding:.8rem .95rem}
  .sw h5,.card h4{margin:0 0 .25rem;font-family:Oswald,sans-serif;font-weight:600;font-size:.9rem;text-transform:uppercase;letter-spacing:.04em}
  .sw code{font-family:'JetBrains Mono',monospace;font-size:.82rem;font-weight:700;display:block;margin-bottom:5px}
  .vals{font-family:'JetBrains Mono',monospace;font-size:.66rem;color:var(--slate);line-height:1.55}
  .use{font-size:.75rem;line-height:1.5;color:var(--slate);margin:.45rem 0 0}
  .src{font-size:.66rem;color:var(--steel);font-style:italic;margin:.35rem 0 0;line-height:1.4}
  .card p{margin:0;font-size:.8rem;line-height:1.5;color:var(--slate)}
  .tag{display:inline-block;font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;font-weight:700;padding:2px 7px;border-radius:999px;margin-bottom:.4rem;background:#EFF6FF;color:#1E40AF}
  .plate{display:flex;align-items:center;justify-content:center;padding:1rem;min-height:148px}
  .plate img{max-width:100%;max-height:128px;height:auto;display:block}
  .plate--white{background:#fff}.plate--mist{background:#E5E7EB}.plate--cream{background:#F5EFE3}
  .plate--dark{background:#0F1419}.plate--none{padding:0;min-height:0}
  .plate--none img{width:100%;max-height:none}
  .fhead{display:flex;justify-content:space-between;align-items:baseline;gap:.8rem;flex-wrap:wrap;padding:.7rem 1.1rem;background:var(--navy);color:#fff}
  .fname{font-family:Oswald,sans-serif;font-weight:600;font-size:1rem;text-transform:uppercase;letter-spacing:.05em}
  .frole{font-size:.72rem;letter-spacing:.09em;text-transform:uppercase;opacity:.85}
  .fspec{padding:1.2rem 1.1rem .4rem}
  .fsample{margin:0 0 .6rem;line-height:1.15;word-break:break-word}
  .falpha{font-size:.84rem;color:var(--slate);line-height:1.55;margin:0 0 .5rem;word-break:break-word}
  .fuse{padding:.7rem 1.1rem .9rem;border-top:1px solid var(--mist);font-size:.83rem;color:var(--slate);line-height:1.55}
  .fuse strong{color:var(--ink)}
  .font{margin-bottom:16px}
  .demo{padding:24px 16px;text-align:center}
  .demo .big{display:block;font-family:Oswald,sans-serif;font-weight:700;font-size:1.15rem;letter-spacing:.03em;text-transform:uppercase}
  .demo .small{display:block;font-family:'Bebas Neue',sans-serif;font-size:.78rem;letter-spacing:.14em;margin-top:4px;opacity:.92}
  .cap{padding:9px 13px;font-size:.75rem;display:flex;justify-content:space-between;gap:8px;border-top:1px solid var(--mist)}
  .cap span:first-child{color:var(--slate)}
  .r{font-family:'JetBrains Mono',monospace;font-weight:700;white-space:nowrap}
  .r.ok{color:var(--pass)}.r.mid{color:var(--warn)}.r.no{color:var(--fail)}
  .scroll{overflow-x:auto;border:1px solid var(--mist);border-radius:12px;background:#fff}
  table{border-collapse:collapse;width:100%;font-size:.84rem;min-width:660px}
  th,td{padding:9px 14px;text-align:left;border-bottom:1px solid var(--mist)}
  th{background:var(--midnight);color:#fff;font-family:Oswald,sans-serif;font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;font-weight:600}
  tbody tr:last-child td{border-bottom:none}
  tbody tr:nth-child(even){background:#FCFBF8}
  td code{font-family:'JetBrains Mono',monospace;font-size:.77rem}
  .dot{display:inline-block;width:14px;height:14px;border-radius:4px;border:1px solid rgba(15,20,25,.2);vertical-align:-2px;margin-right:7px}
  .note{border-radius:11px;padding:15px 19px;margin:24px 0;font-size:.89rem;border:1px solid;border-left-width:5px}
  .note.info{background:#EFF6FF;border-color:#BFDBFE;border-left-color:var(--navy)}
  .note.warn{background:#FFFBEB;border-color:#FDE68A;border-left-color:var(--warn)}
  .note.stop{background:#FEF2F2;border-color:#FECACA;border-left-color:var(--fail)}
  /* colourway matrix — a row per mark, a column per colourway. The sticky row header keeps the
     mark name beside its thumbnails once the table is scrolled sideways, which it will be on any
     screen narrower than the eight columns. */
  .waylist{list-style:none;padding:0;margin:0 0 22px;display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:9px}
  .waylist li{font-size:.84rem;color:var(--slate);display:flex;align-items:baseline;gap:9px}
  .waylist strong{color:var(--ink)}
  .ways{flex:0 0 auto;display:inline-flex;gap:2px}
  .ways i{width:13px;height:13px;border-radius:3px;border:1px solid rgba(15,20,25,.2)}
  .matrixwrap{overflow-x:auto;border:1px solid var(--line);border-radius:11px;background:#fff}
  .matrix{border-collapse:collapse;width:100%;min-width:900px}
  .matrix th{background:#F8F9FB;font-size:.73rem;letter-spacing:.03em;text-transform:uppercase;color:var(--slate);padding:9px 7px;text-align:center;border-bottom:1px solid var(--line)}
  .matrix th[scope="row"]{position:sticky;left:0;z-index:1;text-align:left;text-transform:none;letter-spacing:0;font-size:.79rem;color:var(--ink);white-space:nowrap;padding-right:14px;border-right:1px solid var(--line)}
  .matrix td{padding:5px;text-align:center;border-bottom:1px solid var(--line);background:#F1F3F6}
  .matrix img{display:block;margin:0 auto;max-width:78px;max-height:62px;width:auto;height:auto}
  .matrix tr:last-child td,.matrix tr:last-child th{border-bottom:0}
  pre.copy{margin:0;padding:19px;font-family:'JetBrains Mono',monospace;font-size:.76rem;line-height:1.75;overflow-x:auto;background:#fff}
  footer{margin-top:66px;padding-top:24px;border-top:3px solid var(--navy);color:var(--slate);font-size:.84rem}
  @media(max-width:760px){header h1{font-size:1.9rem}header .inner{padding:36px 20px 32px}.wrap{padding:0 18px 60px}h2{font-size:1.22rem}}
  @media print{body{background:#fff}nav{display:none}
    .sw,.card,.combo,.font,.scroll{break-inside:avoid}
    header,.chip,.demo,.plate,th{-webkit-print-color-adjust:exact;print-color-adjust:exact}h2{break-after:avoid}}
</style>
</head>
<body>

<header><div class="inner">
  <div class="sub">Starr Surveying</div>
  <h1>Brand &amp; Style Guide</h1>
  <p>The approved logo library, ${P.BRAND_COLOURS.length} brand colours with the ink rule, and ${P.BRAND_FONTS.length} typefaces
     chosen for different jobs. Every colour pairing here has been measured rather than eyeballed.
     Built for logos, apparel, signage, vehicle wraps, print and digital.</p>
  <div class="meta">Generated ${new Date().toISOString().slice(0, 10)} · ${P.BRAND_LOGOS.length} marks + ${P.allRecolourFiles().length} colourways · ${P.BRAND_COLOURS.length} colours · ${P.BRAND_FONTS.length} typefaces</div>
</div></header>

<nav><ul>
  <li><a href="#logos">01 Logos</a></li>
  <li><a href="#colourways">01b Colourways</a></li>
  <li><a href="#colour">02 Colour</a></li>
  <li><a href="#ink">03 The Ink Rule</a></li>
  <li><a href="#never">04 Never Pair</a></li>
  <li><a href="#type">05 Typography</a></li>
  <li><a href="#print">06 Print &amp; Production</a></li>
</ul></nav>

<div class="wrap">

  <div class="note info">
    <strong>This file is generated.</strong> It is built from the same list that drives the brand
    page inside the Starr Surveying admin, so the two cannot disagree. If a colour or a caption looks
    wrong, it is wrong in one place and fixing it there re-issues this document.
  </div>

  <div class="note stop">
    <strong>The one rule to remember.</strong> Every colour takes <em>either</em> white ink
    <em>or</em> dark ink. <strong>White fails on all ${darkInkCount} light and bright colours</strong> — worst on
    Hi-Vis Green at 1.58:1 and Safety Orange at 3.15:1, which are exactly the two people reach for
    white on. A hi-vis vest with a white logo is a blank vest from ten feet. Every swatch below is
    tagged with the ink it takes, and section 03 is the table to check before ordering.
  </div>

  <h2 id="logos"><span class="n">01</span>Logo Library</h2>
  <p class="lede">${P.BRAND_LOGOS.length} approved marks. Pick by the <strong>shape of the space</strong> first — square,
     wide, or tiny — and only then by colourway. The full circular badge needs 1.25&Prime; in print
     and 2&Prime; in embroidery; below that use the roundel or the star mark. Clear space on every
     mark is one star-height on all four sides.</p>

${logoSections}

  <div class="note warn">
    <strong>Camouflage needs a patch, not embroidery.</strong> Camo is designed to break up shapes,
    which is exactly what it does to a logo, and contrast maths does not apply because the background
    is four tones at once. Order the roundel as a patch with a white merrowed border — the border
    becomes the background and the camo never touches the mark.
  </div>

  <h2 id="colourways"><span class="n">01b</span>Colourways</h2>
  <p class="lede">${P.RECOLOUR_MARKS.length} marks in ${P.RECOLOUR_WAYS.length} colourways — ${P.allRecolourFiles().length} files, all in
     <code>assets/</code>. Generated from the red-and-navy originals rather than redrawn, so they
     are structurally identical to the marks above. Each colourway&rsquo;s own ink and paper clear
     4.5:1 against each other, so the mark holds together on any garment the colourway suits.
     <strong>One Colour</strong> is the single-ink way and <strong>Reversed</strong> is it knocked
     out of navy — those two are the cheapest to reproduce and the widest-working of the set.</p>

  <ul class="waylist">
${wayNotes}
  </ul>

  <div class="matrixwrap">
    <table class="matrix">
      <thead><tr><th></th>${wayHead}</tr></thead>
      <tbody>
${wayRows}
      </tbody>
    </table>
  </div>

  <h2 id="colour"><span class="n">02</span>Colour System</h2>
  <p class="lede">${P.BRAND_COLOURS.length} approved colours. Wherever a card says <em>sampled</em>, that value was read
     off existing Starr artwork rather than chosen — the core red came back as a cluster between
     <code>#B40C18</code> and <code>#CC1824</code> with <code>#BD1218</code> in the middle of it,
     which is why the core did not move.</p>

${colourSections}

  <h2 id="ink"><span class="n">03</span>The Ink Rule</h2>
  <p class="lede">Sorted by ink: the ${whiteInk.length} colours that take white first, then the ${darkInk.length} that take dark.
     This is the table to check before choosing a garment — it answers the question in one line.</p>
  <div class="scroll"><table>
    <thead><tr><th>Garment / background</th><th>Correct ink</th><th>Contrast</th><th>The other ink measures</th></tr></thead>
    <tbody>
${[...whiteInk, ...darkInk].map(inkRow).join('\n')}
    </tbody>
  </table></div>

  <h2 id="never"><span class="n">04</span>Never Pair These</h2>
  <p class="lede">Rendered in the real colours so the failure is visible rather than asserted.</p>
  <div class="grid g4">
${P.NEVER_PAIR.map(bannedTile).join('\n')}
  </div>
  <div class="note warn">
    <strong>${esc(P.NEVER_PAIR[0].fg)} on ${esc(P.NEVER_PAIR[0].bg)} is the one that matters.</strong> ${esc(P.NEVER_PAIR[0].why)}
  </div>

  <h2 id="type"><span class="n">05</span>Typography</h2>
  <p class="lede">${P.BRAND_FONTS.length} typefaces, each with a job. All are SIL Open Font License — free for commercial
     use including goods the firm sells, embeddable in a PDF sent to a printer, and downloadable by
     searching the family name at <code>fonts.google.com</code>. The specimens below are set in the
     live fonts; with no internet connection each falls back to the second name in its stack.</p>

${P.BRAND_FONTS.map(fontSpec).join('\n')}

  <h2 id="print"><span class="n">06</span>Print &amp; Production</h2>
  <div class="note warn">
    <strong>About Pantone.</strong> No Pantone numbers are listed, on purpose. Pantone is a licensed
    matching system and a number converted from a screen value is a guess that costs money when a run
    comes back wrong. Give your printer the CMYK values below and ask them to pull the nearest
    Pantone from a current Color Bridge book against a physical proof. When they confirm the chips,
    record those numbers — then they are real.
  </div>

  <div class="scroll"><table>
    <thead><tr><th>Colour</th><th>Group</th><th>HEX</th><th>RGB</th><th>CMYK</th><th>Ink</th></tr></thead>
    <tbody>
${P.BRAND_COLOURS.map(printRow).join('\n')}
    </tbody>
  </table></div>

  <h3>The brand gradient</h3>
  <p class="lede">Website hero only. Never attempt it in embroidery, or in any one- or two-colour print.</p>
  <div style="height:88px;border-radius:12px;background:linear-gradient(135deg,#BD1218 20%,#1D3095 80%);
              display:flex;align-items:center;justify-content:center;color:#fff;
              font-family:'JetBrains Mono',monospace;font-size:.84rem;font-weight:700">
    linear-gradient(135deg, #BD1218 20%, #1D3095 80%)
  </div>

  <h3>Quick copy</h3>
  <div class="scroll"><pre class="copy">${esc(hexBlock)}

FONTS
${P.BRAND_FONTS.map((f) => `  ${f.name.padEnd(18)}${f.purpose}`).join('\n')}

ONE-COLOUR JOBS
  Use Midnight Navy #152050 — legible on the widest range of surfaces.</pre></div>

  <footer>
    <strong>Starr Surveying Brand &amp; Style Guide.</strong> Generated from
    <code>lib/branding/palette.ts</code>. Colour values are sampled from existing artwork or taken
    from the live brand tokens; contrast figures are WCAG 2.1 relative-luminance calculations against
    the real hex values. CMYK values are mathematical conversions — always confirm against a physical
    proof before a production run. Typefaces are SIL Open Font License and free for commercial use.
  </footer>

</div>
</body>
</html>
`;

// ── write ───────────────────────────────────────────────────────────────────────────────────────
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), HTML);

let copied = 0;
const missing = [];
// The colourways go in the folder as well as the originals. The guide is handed to a vendor who
// may have no network at the counter, and a page of 144 images with no files behind them is worse
// than a page that never mentioned them.
for (const file of [...P.BRAND_LOGOS.map((l) => l.file), ...P.allRecolourFiles()]) {
  const from = path.join('public', 'branding', file);
  if (!fs.existsSync(from)) { missing.push(file); continue; }
  fs.copyFileSync(from, path.join(OUT, 'assets', file));
  copied++;
}

console.log(`brand guide → ${OUT}`);
console.log(`  ${P.BRAND_COLOURS.length} colours · ${P.BRAND_FONTS.length} fonts · ${copied} assets`);
if (missing.length) {
  console.error(`  MISSING ${missing.length} asset(s): ${missing.join(', ')}`);
  process.exit(1);
}
