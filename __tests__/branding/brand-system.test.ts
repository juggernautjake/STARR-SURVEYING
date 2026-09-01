// __tests__/branding/brand-system.test.ts
//
// ── THE ONE DEFECT THIS PAGE CAN HAVE SILENTLY ──────────────────────────────────────────────────
//
// A brand page is mostly data, so most of it cannot break in an interesting way. The exception is
// the file list: `BRAND_LOGOS` names 34 files under `/branding/`, and a name that does not match
// anything on disk renders as a broken image on the portal and a 404 on the downloads tab. Nothing
// throws, nothing warns, and nobody notices until somebody needs that file — which is exactly the
// *authored but not wired* shape this repo keeps finding.
//
// So the first block walks `public/branding` and holds the manifest against it, in both directions:
// a listed file that does not exist, and a file on disk that nothing lists.
//
// The second block is about the ink rule. Every colour claims WHITE or DARK, and each claim is
// stored beside the two measured ratios that justify it. Those numbers were computed once; if
// somebody edits a hex and forgets the ratios, the page will confidently print a wrong instruction
// to a printer. Recomputing them here from the hex is the only way that claim stays true.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  BRAND_COLOURS, BRAND_FONTS, NEVER_PAIR, CORE_COLOURS, GROUP_ORDER, GROUP_LABELS, colourByName, coloursInGroup, googleFontsHref,
} from '@/lib/branding/palette';
import * as palette from '@/lib/branding/palette';
import * as logos from '@/lib/branding/logos';
import {
  BRAND_LOGOS, LOGO_KIND_ORDER, logosOfKind, logoSrc, BRANDING_ASSET_BASE,
  RECOLOUR_MARKS, RECOLOUR_WAYS, allRecolourFiles, recolourFile,
} from '@/lib/branding/logos';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public', 'branding');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ── contrast, recomputed rather than trusted ───────────────────────────────────────────────────
const srgb = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const lum = ([r, g, b]: readonly number[]) =>
  0.2126 * srgb(r!) + 0.7152 * srgb(g!) + 0.0722 * srgb(b!);
const parse = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const contrast = (a: string, b: string) => {
  const [l1, l2] = [lum(parse(a)), lum(parse(b))].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
};

const WHITE = '#FFFFFF';
const INK = '#0F1419';

describe('the file manifest matches what is on disk', () => {
  const onDisk = fs.existsSync(PUBLIC_DIR)
    ? fs.readdirSync(PUBLIC_DIR).filter((f) => /\.(png|jpe?g|svg|webp)$/i.test(f))
    : [];

  it('control: the assets directory exists and is not empty', () => {
    // Without this every assertion below would pass vacuously against an empty list.
    expect(fs.existsSync(PUBLIC_DIR), `${PUBLIC_DIR} does not exist`).toBe(true);
    expect(onDisk.length).toBeGreaterThanOrEqual(30);
  });

  it('every logo the page lists is a real file', () => {
    const missing = BRAND_LOGOS.filter((l) => !onDisk.includes(l.file)).map((l) => l.file);
    expect(missing, `listed in BRAND_LOGOS and not in public/branding:\n  ${missing.join('\n  ')}`)
      .toEqual([]);
  });

  it('and every file on disk is listed, so nothing is orphaned', () => {
    // The reverse direction, and the one that caught the real defect. An asset nobody lists is
    // weight shipped for no reason, and it is usually a mark somebody meant to document.
    //
    // A generated colourway counts as listed when its family is declared — 144 hand-written
    // entries would be 144 chances to typo a filename. What this cannot let through is a family
    // that exists on disk and in no list at all, which is exactly what had happened: the
    // generator wrote eighteen families and the data module named four.
    const listed = new Set([
      ...BRAND_LOGOS.map((l) => l.file),
      ...allRecolourFiles(),
    ]);
    const orphans = onDisk.filter((f) => !listed.has(f));
    expect(orphans, `in public/branding and listed nowhere:\n  ${orphans.join('\n  ')}`).toEqual([]);
  });

  it('and every generated colourway the page offers is a real file', () => {
    // The other direction for the derived list. `allRecolourFiles()` is what the profile strips
    // and the colourways section build their links from, so a family declared and never
    // generated is a colourway button that 404s.
    const missing = allRecolourFiles().filter((f) => !onDisk.includes(f));
    expect(missing, `offered by the portal and not on disk:\n  ${missing.join('\n  ')}`).toEqual([]);
    expect(allRecolourFiles().length).toBe(RECOLOUR_MARKS.length * RECOLOUR_WAYS.length);
  });

  it('the colourway families match the generator that writes them', () => {
    // The one place the two lists can still disagree, and the drift that caused the defect. The
    // script owns the slugs; this reads its MARKS table rather than trusting a second copy.
    const script = read('scripts/recolour-brand-marks.mjs');
    const table = script.slice(script.indexOf('const MARKS = ['), script.indexOf('];', script.indexOf('const MARKS = [')));
    const slugs = [...table.matchAll(/slug: '([a-z-]+)'/g)].map((m) => m[1]!).sort();

    // Control: the parse found something. A regex that matched nothing would make every
    // comparison below pass against an empty list.
    expect(slugs.length, 'the MARKS table in the generator did not parse').toBeGreaterThan(10);

    expect(RECOLOUR_MARKS.map((m) => m.slug).sort(),
      'the portal and scripts/recolour-brand-marks.mjs disagree about which families exist')
      .toEqual(slugs);
  });

  it('every colourway family names a source mark that exists', () => {
    for (const m of RECOLOUR_MARKS) {
      expect(BRAND_LOGOS.some((l) => l.file === m.source),
        `family ${m.slug} claims to come from ${m.source}, which is not a listed mark`).toBe(true);
      expect(onDisk, `${recolourFile(m.slug, RECOLOUR_WAYS[0]!.id)} is not on disk`)
        .toContain(recolourFile(m.slug, RECOLOUR_WAYS[0]!.id));
    }
  });
  it('no file is listed twice', () => {
    const seen = new Set<string>();
    const dupes = BRAND_LOGOS.filter((l) => (seen.has(l.file) ? true : (seen.add(l.file), false)));
    expect(dupes.map((d) => d.file)).toEqual([]);
  });

  it('logoSrc builds a path the app actually serves', () => {
    expect(logoSrc('badge-primary.png')).toBe('/branding/badge-primary.png');
    expect(BRANDING_ASSET_BASE.startsWith('/')).toBe(true);
  });

  it('every logo has a caption and a kind that renders', () => {
    for (const l of BRAND_LOGOS) {
      expect(l.name.trim().length, `${l.file} has no name`).toBeGreaterThan(0);
      expect(l.note.trim().length, `${l.file} has no note`).toBeGreaterThan(20);
      expect(LOGO_KIND_ORDER, `${l.file} has kind "${l.kind}", which is not in LOGO_KIND_ORDER`)
        .toContain(l.kind);
    }
  });

  it('every kind in the order has at least one logo', () => {
    // A section header with nothing under it looks like a loading failure.
    for (const kind of LOGO_KIND_ORDER) {
      expect(logosOfKind(kind).length, `no logos of kind ${kind}`).toBeGreaterThan(0);
    }
  });
});

describe('the ink rule is measured, not asserted', () => {
  it('every stored ratio matches the hex it is stored beside', () => {
    // The load-bearing check. A hex edited without updating its ratios would leave the page telling
    // a printer to use an ink that fails, in a confident table with a number next to it.
    for (const c of BRAND_COLOURS) {
      const vsWhite = contrast(c.hex, WHITE);
      const vsInk = contrast(c.hex, INK);
      expect(vsWhite, `${c.name}: stored contrastVsWhite ${c.contrastVsWhite}, actual ${vsWhite.toFixed(2)}`)
        .toBeCloseTo(c.contrastVsWhite, 1);
      expect(vsInk, `${c.name}: stored contrastVsInk ${c.contrastVsInk}, actual ${vsInk.toFixed(2)}`)
        .toBeCloseTo(c.contrastVsInk, 1);
    }
  });

  it('and the ink each colour claims is the one that actually wins', () => {
    for (const c of BRAND_COLOURS) {
      const winner = contrast(c.hex, WHITE) >= contrast(c.hex, INK) ? 'white' : 'dark';
      expect(c.ink, `${c.name} claims ${c.ink} ink but ${winner} measures higher`).toBe(winner);
    }
  });

  it('the winning ink clears 4.5:1 on every colour', () => {
    // If a brand colour has no legible ink at all it should not be in the palette.
    for (const c of BRAND_COLOURS) {
      const best = Math.max(contrast(c.hex, WHITE), contrast(c.hex, INK));
      expect(best, `${c.name} (${c.hex}) has no ink that clears 4.5:1 — best is ${best.toFixed(2)}`)
        .toBeGreaterThanOrEqual(4.5);
    }
  });

  it('control: this would catch a colour with no readable ink', () => {
    // There genuinely is such a colour, and it is worth knowing where it sits. Sweeping the greys
    // against white and Ink Black, the worst is #7A7A7A: white gives 4.28:1 and dark gives 4.31:1,
    // so NEITHER ink clears 4.5 and the check above has a real threshold rather than passing
    // everything by construction.
    //
    // The band is narrow — by #949494 dark ink is back to 6.10:1 — which is exactly why the
    // assertion is worth having: a mid grey added to the palette would look unremarkable and be
    // the one colour on the page with no legible ink.
    const worst = Math.max(contrast('#7A7A7A', WHITE), contrast('#7A7A7A', INK));
    expect(worst, 'the worst-case grey now has a readable ink — re-derive this control')
      .toBeLessThan(4.5);
    expect(Math.max(contrast('#949494', WHITE), contrast('#949494', INK))).toBeGreaterThan(4.5);
  });

  it('white genuinely fails on every dark-ink colour', () => {
    // The claim the Overview and Colours tabs both make in prose. Seven colours, and the sentence
    // "white fails on all of them" has to stay true or the page is lying in bold type.
    const darkInk = BRAND_COLOURS.filter((c) => c.ink === 'dark' && c.hex !== WHITE);
    expect(darkInk.length).toBeGreaterThanOrEqual(7);
    for (const c of darkInk) {
      expect(contrast(c.hex, WHITE), `white on ${c.name} is ${contrast(c.hex, WHITE).toFixed(2)}:1 — it passes now`)
        .toBeLessThan(4.5);
    }
  });

  it('the two worst cases are the ones the copy names', () => {
    // Hi-Vis Green and Safety Orange are called out by name in three places. If either stopped
    // being the example, the prose would be pointing at the wrong colour.
    expect(contrast('#C7D805', WHITE)).toBeLessThan(2);
    expect(contrast('#F26522', WHITE)).toBeLessThan(3.5);
  });
});

describe('the never-pair list', () => {
  it('names colours that exist', () => {
    for (const p of NEVER_PAIR) {
      expect(colourByName(p.fg), `NEVER_PAIR references unknown colour "${p.fg}"`).toBeDefined();
      expect(colourByName(p.bg), `NEVER_PAIR references unknown colour "${p.bg}"`).toBeDefined();
    }
  });

  it('and every one of them really does fail', () => {
    // A banned pair that actually passes is worse than no list: it teaches people the guidance is
    // decorative.
    for (const p of NEVER_PAIR) {
      const actual = contrast(colourByName(p.fg)!.hex, colourByName(p.bg)!.hex);
      expect(actual, `${p.fg} on ${p.bg} measures ${actual.toFixed(2)}:1 — it no longer fails`)
        .toBeLessThan(4.5);
      expect(actual, `${p.fg} on ${p.bg}: stored ${p.ratio}, actual ${actual.toFixed(2)}`)
        .toBeCloseTo(p.ratio, 1);
    }
  });

  it('leads with red on navy, which is the one that matters', () => {
    expect(NEVER_PAIR[0]?.fg).toBe('Starr Red');
    expect(NEVER_PAIR[0]?.bg).toBe('Starr Navy');
  });

  it('every entry explains itself', () => {
    for (const p of NEVER_PAIR) {
      expect(p.why.trim().length, `${p.fg} on ${p.bg} has no reason`).toBeGreaterThan(30);
    }
  });
});

describe('the palette holds together', () => {
  it('has the four core colours the owner names', () => {
    expect(CORE_COLOURS.map((c) => c.name))
      .toEqual(['Starr Red', 'Starr Navy', 'White', 'Ink Black']);
  });

  it('every group in the order has colours, and every colour is in a group in the order', () => {
    for (const g of GROUP_ORDER) {
      expect(coloursInGroup(g).length, `group ${g} is empty`).toBeGreaterThan(0);
      expect(GROUP_LABELS[g], `group ${g} has no label`).toBeTruthy();
    }
    for (const c of BRAND_COLOURS) {
      expect(GROUP_ORDER, `${c.name} is in group "${c.group}", which is not rendered`).toContain(c.group);
    }
  });

  it('no hex appears twice', () => {
    const seen = new Map<string, string>();
    for (const c of BRAND_COLOURS) {
      const prev = seen.get(c.hex.toUpperCase());
      expect(prev, `${c.name} and ${prev} are both ${c.hex}`).toBeUndefined();
      seen.set(c.hex.toUpperCase(), c.name);
    }
  });

  it('every hex is a full 6-digit value', () => {
    // A 3-digit hex renders fine in CSS and is ambiguous on a purchase order.
    for (const c of BRAND_COLOURS) {
      expect(c.hex, `${c.name} is not #RRGGBB`).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('rgb matches the hex', () => {
    for (const c of BRAND_COLOURS) {
      expect(c.rgb, `${c.name}: rgb does not match ${c.hex}`).toEqual(parse(c.hex));
    }
  });

  it('cmyk is in range and consistent with the hex', () => {
    for (const c of BRAND_COLOURS) {
      for (const v of c.cmyk) {
        expect(v, `${c.name}: cmyk component ${v} out of range`).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
      // K is 1 - max(r,g,b), which is the one component that cannot drift without the hex changing.
      const [r, g, b] = c.rgb.map((x) => x / 255);
      const k = Math.round((1 - Math.max(r!, g!, b!)) * 100);
      expect(c.cmyk[3], `${c.name}: K should be ${k} for ${c.hex}`).toBe(k);
    }
  });

  it('every colour says what it is for', () => {
    for (const c of BRAND_COLOURS) {
      expect(c.use.trim().length, `${c.name} has no use note`).toBeGreaterThan(15);
    }
  });
});

describe('typography', () => {
  it('has ten faces covering all three roles', () => {
    expect(BRAND_FONTS).toHaveLength(10);
    for (const role of ['display', 'body', 'technical'] as const) {
      expect(BRAND_FONTS.filter((f) => f.role === role).length, `no ${role} faces`).toBeGreaterThan(0);
    }
  });

  it('every stack has a real fallback after the webfont', () => {
    // The specimens load from Google. If that fails the page must degrade to something, not to
    // whatever the browser picks — and `font-family: "Rye"` alone degrades to Times.
    for (const f of BRAND_FONTS) {
      const parts = f.stack.split(',').map((s) => s.trim());
      expect(parts.length, `${f.name} has no fallback in its stack`).toBeGreaterThanOrEqual(2);
      expect(parts[0]).toContain(f.name);
      expect(parts[parts.length - 1], `${f.name} does not end in a generic family`)
        .toMatch(/^(sans-serif|serif|monospace)$/);
    }
  });

  it('the Google Fonts href covers every family, derived rather than typed', () => {
    const href = googleFontsHref();
    for (const f of BRAND_FONTS) {
      expect(href, `${f.name} is not in the font href`).toContain(f.name.replace(/ /g, '+'));
    }
    expect(href).toContain('display=swap');
  });

  it('control: the href is derived, so adding a font would change it', () => {
    // If `googleFontsHref` were a hard-coded string the loop above would pass forever while a new
    // font silently rendered as a fallback.
    const src = read('lib/branding/palette.ts');
    const at = src.indexOf('export function googleFontsHref');
    expect(src.slice(at, at + 400)).toContain('BRAND_FONTS.map');
  });

  it('every face says what it is for and what it is not for', () => {
    for (const f of BRAND_FONTS) {
      expect(f.purpose.trim().length, `${f.name} has no purpose`).toBeGreaterThan(3);
      expect(f.use.trim().length, `${f.name} has no use note`).toBeGreaterThan(60);
      expect(f.sample.trim().length, `${f.name} has no specimen text`).toBeGreaterThan(3);
    }
  });

  it('Bebas is flagged caps-only, because it has no lowercase', () => {
    // Not cosmetic: a designer setting sentence case in Bebas gets caps anyway and thinks the file
    // is broken.
    expect(BRAND_FONTS.find((f) => f.name === 'Bebas Neue')?.capsOnly).toBe(true);
  });
});

describe('the standalone guide can actually be generated', () => {
  // ── IT HAD NEVER RUN ──────────────────────────────────────────────────────────────────────
  //
  // `build-brand-guide.mjs` loaded `palette.ts` and then read `P.BRAND_LOGOS`, `P.logosOfKind`
  // and `P.LOGO_KIND_ORDER` — all of which live in `logos.ts`. It threw on its ninth line and
  // had never produced a folder, while the Downloads tab told the owner to go and take that
  // folder. A build script nobody runs has no failing assertion to notice it.
  //
  // Running the script here would copy 178 files on every test run. Reading every `P.<name>` it
  // reaches for and holding them against what the two modules actually export catches the same
  // defect for the cost of a regex.
  const script = read('scripts/build-brand-guide.mjs');

  it('every value the generator reads is exported by a module it actually loads', () => {
    // The load-bearing word is *loads*. Checking the names against both modules would have
    // passed on the broken script — `logos.ts` does export `BRAND_LOGOS`, it just was not being
    // read. So this parses the paths the script transpiles and admits only those.
    const loaded = [...script.matchAll(/load\( *'lib\/branding\/([a-z]+)\.ts'/g)].map((m) => m[1]!);
    const used = [...new Set([...script.matchAll(/\bP\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]!))];

    // Two controls. Either regex silently matching nothing would make the comparison below
    // vacuous, which is how the script came to be broken and green at the same time.
    expect(used.length, 'no P.<name> references parsed out of the generator').toBeGreaterThan(8);
    expect(loaded.length, 'no brand module paths parsed out of the generator').toBeGreaterThan(0);

    const namespaces: Record<string, Record<string, unknown>> = {
      palette: palette as unknown as Record<string, unknown>,
      logos: logos as unknown as Record<string, unknown>,
    };
    const exported = new Set(loaded.flatMap((name) => Object.keys(namespaces[name] ?? {})));

    const unreachable = used.filter((n) => !exported.has(n));
    expect(unreachable,
      `the generator reads ${unreachable.join(", ")} — not exported by the module(s) it loads (${loaded.join(", ")})`)
      .toEqual([]);
  });
  it('and it loads both modules, not just the palette', () => {
    // `toContain('lib/branding/logos.ts')` was the first version of this and it was worthless: the
    // script's own header comment names both paths, so it passed with the load call deleted.
    // Mutation-tested — removing the load now turns both of these red.
    const loads = [...script.matchAll(/load\( *'lib\/branding\/([a-z]+)\.ts'/g)].map((m) => m[1]!);
    expect(loads.sort()).toEqual(['logos', 'palette']);
  });
});

describe('the page is wired', () => {
  const PAGE = 'app/admin/branding/page.tsx';

  it('the portal renders every tab it declares', () => {
    const src = read(PAGE);
    for (const id of ['overview', 'logos', 'colours', 'type', 'pairings', 'blocks', 'downloads']) {
      expect(src, `tab "${id}" is declared and never rendered`).toContain(`active === '${id}'`);
    }
  });

  it('and declares every tab it renders', () => {
    const src = read(PAGE);
    const rendered = [...src.matchAll(/active === '([a-z]+)'/g)].map((m) => m[1]!);
    for (const id of rendered) {
      expect(src, `tab "${id}" is rendered and never declared`).toMatch(new RegExp(`id: '${id}'`));
    }
    expect(rendered.length).toBe(7);
  });

  it('uses the shared keyboard helper rather than a hand-rolled arrow dance', () => {
    // E1b: four portals hand-rolled this and all four forgot Home and End.
    //
    // Asserting the NAME appears was the first version, and renaming the call site survived it —
    // the import line still contained the string. Second time today a name check passed for a
    // renamed usage. This reads the keydown handler and requires the call inside it.
    const src = read(PAGE);
    const at = src.indexOf('onKeyDown');
    expect(at, 'the tab bar has no keyboard handler at all').toBeGreaterThan(-1);
    const handler = src.slice(at, at + 420);
    expect(handler, 'the keydown handler no longer calls the shared helper')
      .toMatch(/tabMoveTarget\(/);
    expect(handler, 'the helper is called but its answer is ignored').toContain('select(next)');
  });

  it('is registered in the route registry and gated in middleware, with the same roles', () => {
    // The two lists drifting is how a nav entry ends up pointing at a 403.
    const registry = read('lib/admin/route-registry.ts');
    const middleware = read('middleware.ts');

    const regLine = registry.split('\n').find((l) => l.includes("href: '/admin/branding'"));
    const mwLine = middleware.split('\n').find((l) => l.includes("prefix: '/admin/branding'"));
    expect(regLine, '/admin/branding is not in the route registry').toBeTruthy();
    expect(mwLine, '/admin/branding is not gated in middleware').toBeTruthy();

    const rolesIn = (line: string) => {
      const m = line.match(/roles: \[([^\]]+)\]/);
      return m ? m[1]!.split(',').map((r) => r.trim().replace(/['"]/g, '')).sort() : [];
    };
    expect(rolesIn(regLine!), 'the nav offers the page to a different set than middleware admits')
      .toEqual(rolesIn(mwLine!));
    expect(rolesIn(regLine!).length).toBeGreaterThan(0);
  });

  it('control: the role comparison can fail', () => {
    const a = "roles: ['admin', 'developer']";
    const b = "roles: ['admin']";
    const rolesIn = (line: string) => {
      const m = line.match(/roles: \[([^\]]+)\]/);
      return m ? m[1]!.split(',').map((r) => r.trim().replace(/['"]/g, '')).sort() : [];
    };
    expect(rolesIn(a)).not.toEqual(rolesIn(b));
  });

  it('the tabs read the palette rather than hard-coding a second copy of it', () => {
    // The whole reason the module exists. A tab with its own hex list is a second palette.
    for (const tab of ['ColoursTab', 'TypeTab', 'LogosTab', 'DownloadsTab', 'OverviewTab']) {
      expect(read(`app/admin/branding/_tabs/${tab}.tsx`), `${tab} does not read the palette module`)
        .toContain("from '@/lib/branding/palette'");
    }
  });
});
