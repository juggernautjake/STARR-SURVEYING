# Contrast sweep — how to run it

A paste-into-devtools (or Playwright `evaluate`) version of the measurement used in the final-QA
walkthrough's skin sweep. The maths lives in **`lib/dnd/theme-contrast.ts`** and is unit-tested
(`__tests__/dnd/contrast.test.ts`); this is the DOM half, which can't be.

That module already owned WCAG contrast for the theme-token audit. The sweep needed two things it lacked —
`flattenStack` (it composited a single layer, not a stack) and `aaThresholdForSize` (it had per-ROLE
thresholds, not the per-SIZE rule WCAG states) — so those were added there. A second contrast module was
written first and deleted: the repo's own `no-orphan-modules` guard caught it as unreachable, which was the
right call twice over, since it was also a duplicate.

## Why it isn't just `color` vs `background-color`

A sheet in this app is translucent panels over a skin base. Reading the first non-transparent background
you meet and comparing against it **produces false alarms**: an early version of this sweep read
`rgba(0, 0, 0, 0.08)` as pure black, scored purple text on a light pink page at 1.62:1, and flagged 42
healthy samples. Every translucent layer has to be composited onto the first opaque one beneath before the
ratio means anything.

The other easy mistake is the threshold. WCAG AA wants **4.5:1** for body text but only **3:1** for large
text (≥24px, or ≥18.66px bold) — so a 23px headline at 3.85 is a genuine miss while the same colour at
24px is fine.

## The snippet

```js
(() => {
  const parse = (c) => { const m = (c || '').match(/[\d.]+/g); if (!m || m.length < 3) return null;
    return { r: +m[0], g: +m[1], b: +m[2], a: m[3] != null ? +m[3] : 1 }; };
  const over = (t, b) => ({ r: t.r*t.a + b.r*(1-t.a), g: t.g*t.a + b.g*(1-t.a), b: t.b*t.a + b.b*(1-t.a), a: 1 });
  const bgOf = (el) => {
    const stack = []; let n = el;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; }
      n = n.parentElement;
    }
    const base = parse(getComputedStyle(document.documentElement).backgroundColor) ?? { r:255,g:255,b:255,a:1 };
    let out = stack.length && stack[stack.length-1].a >= 1 ? stack.pop() : { ...base, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) out = over(stack[i], out);
    return out;
  };
  const lum = (c) => { const f = [c.r, c.g, c.b].map(v => { const s = v/255;
    return s <= 0.03928 ? s/12.92 : Math.pow((s+0.055)/1.055, 2.4); });
    return 0.2126*f[0] + 0.7152*f[1] + 0.0722*f[2]; };
  const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg);
    return +(((Math.max(a,b) + 0.05) / (Math.min(a,b) + 0.05)).toFixed(2)); };

  const rows = [...document.querySelectorAll('*')]
    .filter(e => e.children.length === 0 && (e.innerText || '').trim().length > 1)
    .map(e => { const cs = getComputedStyle(e); const fg = parse(cs.color); if (!fg) return null;
      const size = parseFloat(cs.fontSize) || 16;
      const bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
      const need = (size >= 24 || (bold && size >= 18.66)) ? 3 : 4.5;
      const r = ratio(fg, bgOf(e));
      return { r, need, pass: r >= need, size, text: (e.innerText || '').trim().slice(0, 30) }; })
    .filter(Boolean)
    .sort((a, b) => a.r - b.r);

  const fails = rows.filter(x => !x.pass);
  console.table(fails.slice(0, 25));
  return { sampled: rows.length, failing: fails.length,
           median: rows[Math.floor(rows.length / 2)]?.r };
})()
```

## Reading the result

- Judge each row against **its own** `need`, not a flat 4.5 — that column is why.
- A handful of failures on decorative glyphs is usually noise; the signal is a real **control** failing, or
  the *same* element failing on every skin (which is what identified the roller tabs as a token problem
  rather than a theme problem).
- Run it once per skin. The light skins (`streamer` / `donata` / `jack`) are the ones `skin-tokens.ts`
  calls out, but the defects found so far were skin-independent.

## Outstanding

The roller template tabs and animation toggle were changed from `--hx-muted` to `--hx-text` in slice 19
based on their measured before-values (2.78 dark / 2.83 light). **Those two labels have not been
re-measured in place** — the Playwright context wedged before it could be done. Re-running this snippet on
a PF2 sheet and confirming they now clear 4.5 is a small, specific debt.
