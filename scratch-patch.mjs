import fs from 'node:fs';
const p = 'scratch-gis-visual.mjs';
let s = fs.readFileSync(p, 'utf8');

const oldLum = `  const lum = (c) => { const m = c.match(/[\d.]+/g); if (!m) return 1;
    const [r,g,b] = m.slice(0,3).map(Number).map(v => { const s=v/255; return s<=0.03928?s/12.92:Math.pow((s+0.055)/1.055,2.4); });
    return 0.2126*r+0.7152*g+0.0722*b; };`;
const newLum = `  // Modern computed colours come back as \`color(srgb 0.53 0.88 0.76)\` — 0-1 floats, not 0-255.
  // Dividing those by 255 makes every themed colour read as near-black, which is what produced a
  // confident list of "failures" against CSS that was correct.
  const lum = (c) => { const m = c.match(/[\d.]+/g); if (!m) return 1;
    const srgb = c.startsWith('color(');
    const [r,g,b] = m.slice(srgb ? 0 : 0, srgb ? 3 : 3).map(Number)
      .map(v => { const s = srgb ? v : v/255; return s<=0.03928?s/12.92:Math.pow((s+0.055)/1.055,2.4); });
    return 0.2126*r+0.7152*g+0.0722*b; };`;
if (s.split(oldLum).length - 1 !== 1) throw new Error('lum anchor');
s = s.replace(oldLum, newLum);

const oldBg = `if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg) && !/, 0\)$/.test(bg)) return bg;`;
const newBg = `// \`!/, 0\)$/\` also matched \`rgb(0, 0, 0)\` — pure black. It skipped every black surface and
    // walked to the white default, reporting white-on-white on the high-contrast dark palette.
    if (bg && !/^rgba\(.*,\s*0\)$/.test(bg) && bg !== 'transparent') return bg;`;
if (s.split(oldBg).length - 1 !== 1) throw new Error('bg anchor');
s = s.replace(oldBg, newBg);

fs.writeFileSync(p, s);
console.log('ok');
