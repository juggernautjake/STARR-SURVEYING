/* ============================================================================
   planet3d-model.js — build a REAL 3D planet mesh from a saved `.planet3d`
   config (Phase U, slice 5). Faithful port of the generator's surface / cloud /
   atmosphere / night / ring pipeline so the live 3D map viewer renders the exact
   world the DM designed — no baked frames. Imports the vendored Three singleton.

   export buildPlanetModel(config, opts) -> { group, update(dt, sunDirWorld), dispose }
     config : the object stored in a .planet3d (generator's config())
     opts   : { anisotropy?:number, radius?:number, segments?:number }

   (The animated lightning storm-flash layer is intentionally omitted for now —
   it's a rarely-used, heavy extra; tracked as a follow-up.)
   ============================================================================ */
import * as THREE from 'three';

/* ---------- helpers (verbatim from the generator) ---------- */
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeNoise(seed) { const p = new Uint8Array(256); for (let i = 0; i < 256; i++) p[i] = i; let rng = mulberry(seed); for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } const perm = new Uint8Array(512); for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; const fade = t => t * t * t * (t * (t * 6 - 15) + 10), lerp = (a, b, t) => a + t * (b - a); function grad(h, x, y) { const u = h & 1 ? x : -x, v = h & 2 ? y : -y; return u + v; } return function (x, y) { const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, xf = x - Math.floor(x), yf = y - Math.floor(y), u = fade(xf), v = fade(yf); const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1], ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1]; const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u), x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u); return (lerp(x1, x2, v) + 1) / 2; }; }
function fbm(noise, lon, lat, freq, oct) { let amp = 1, sum = 0, norm = 0, f = freq; for (let o = 0; o < oct; o++) { const ang = lon * Math.PI * 2; const v = noise(Math.cos(ang) * f + 100, lat * f + 100) * 0.5 + noise(Math.sin(ang) * f + 200, lat * f + 200) * 0.5; sum += v * amp; norm += amp; amp *= 0.5; f *= 2; } return sum / norm; }
function warp(noise, wn, lon, lat, cs, det, w) { const wx = fbm(wn, lon, lat, cs * 0.5, 3) - 0.5, wy = fbm(wn, lon + 3.3, lat + 1.7, cs * 0.5, 3) - 0.5; return fbm(noise, lon + wx * w, lat + wy * w, cs, det); }
function hx(h) { h = (h || '#000000').replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
function mix(a, b, t) { t = Math.max(0, Math.min(1, t)); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

const TYPES = {
  terran: { ocean: [26, 74, 124], shore: [58, 122, 140], low: [74, 124, 58], high: [122, 106, 74], peak: [200, 200, 208], city: 1 },
  ocean: { ocean: [18, 58, 108], shore: [42, 106, 140], low: [58, 138, 122], high: [90, 154, 106], peak: [208, 224, 232], city: 0.6 },
  jungle: { ocean: [26, 90, 90], shore: [42, 122, 90], low: [42, 122, 42], high: [74, 154, 58], peak: [138, 218, 106], city: 0.8 },
  desert: { ocean: [58, 106, 124], shore: [200, 168, 104], low: [216, 168, 96], high: [184, 136, 72], peak: [240, 224, 192], city: 0.5 },
  ice: { ocean: [90, 122, 154], shore: [168, 200, 224], low: [216, 232, 240], high: [232, 240, 248], peak: [255, 255, 255], city: 0.3 },
  volcanic: { ocean: [42, 20, 20], shore: [90, 42, 26], low: [122, 48, 32], high: [192, 57, 43], peak: [255, 138, 58], city: 0.2, lava: true },
  toxic: { ocean: [58, 90, 26], shore: [90, 122, 42], low: [122, 176, 74], high: [168, 216, 104], peak: [200, 248, 120], city: 0.4 },
  barren: { ocean: [70, 70, 84], shore: [100, 100, 116], low: [120, 120, 138], high: [150, 150, 168], peak: [200, 200, 216], city: 0 },
  gas: { ocean: [168, 136, 88], shore: [200, 168, 120], low: [232, 216, 184], high: [216, 184, 136], peak: [240, 232, 208], bands: true, city: 0 },
};

function texFromCanvas(cv, aniso) { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso || 1; return t; }

// The representative surface colour of a planet config — a sea-level-weighted blend of its own
// TYPES palette (ocean vs land, with a touch of polar ice). Used so a far/small planet that renders
// as a flat impostor still shows its true colours instead of a default. Returns a #rrggbb string.
export function planetDominantColor(config) {
  const cfg = Object.assign({ type: 'terran', sea: 0.52, ice: 0.15 }, config || {});
  const T = TYPES[cfg.type] || TYPES.terran;
  const toHex = c => '#' + c.map(v => ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2)).join('');
  if (T.bands) return toHex(mix(mix(T.low, T.high, 0.5), T.shore, 0.25));   // gas giant → band average
  const sea = Math.max(0, Math.min(1, cfg.sea != null ? cfg.sea : 0.52));
  const ice = Math.max(0, Math.min(1, cfg.ice != null ? cfg.ice : 0.15));
  const land = mix(T.low, T.high, 0.4);
  let c = mix(land, T.ocean, sea * 0.85);                                   // more sea → bluer/oceanic
  if (ice > 0.25) c = mix(c, T.peak, (ice - 0.25) * 0.5);                   // icy worlds pale out
  return toHex(c);
}

// A small, cheap procedural planet FACE for the far/small impostor: the planet's actual surface
// (same sea/land/ice/band maths as the full model) sampled onto a lit, sphere-projected disc, so a
// tiny planet still shows real continents / bands / ice caps and a faint atmosphere — not a flat coin.
// Returns a canvas (transparent outside the disc) to use as a texture. `S` = pixel diameter (~96).
export function planetImpostorCanvas(config, S) {
  S = S || 96;
  const cfg = Object.assign({ type: 'terran', seed: 1, sea: 0.52, cscale: 2.2, coast: 0.5, ice: 0.15 }, config || {});
  const T = TYPES[cfg.type] || TYPES.terran;
  const cv = document.createElement('canvas'); cv.width = cv.height = S; const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S), d = img.data;
  const noise = makeNoise(cfg.seed), wn = makeNoise(cfg.seed + 999);
  const R = S / 2 - 1, cx = S / 2, cy = S / 2;
  const lx = -0.48, ly = -0.55, lz = 0.68, llen = Math.hypot(lx, ly, lz);   // light from the upper-left
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const idx = (py * S + px) * 4;
      const nx = (px - cx) / R, ny = (py - cy) / R, r2 = nx * nx + ny * ny;
      if (r2 > 1) { d[idx + 3] = 0; continue; }                             // outside the sphere → clear
      const nz = Math.sqrt(1 - r2);
      const lat = 0.5 - Math.asin(Math.max(-1, Math.min(1, ny))) / Math.PI;  // equirectangular projection
      const lon = 0.5 + Math.atan2(nx, nz) / (2 * Math.PI), latC = Math.abs(lat - 0.5) * 2;
      let col;
      if (T.bands) { const band = 0.5 + 0.5 * Math.sin(lat * Math.PI * 8), turb = fbm(noise, lon, lat * 3, cfg.cscale * 1.5, 4) * 0.4; col = mix(T.low, T.high, Math.min(1, band * 0.6 + turb)); }
      else {
        let e = warp(noise, wn, lon, lat, cfg.cscale, 5, 0.35); const dS = e - cfg.sea; e = cfg.sea + Math.sign(dS) * Math.pow(Math.abs(dS), 1 - cfg.coast * 0.6);
        if (latC > (1 - cfg.ice) + (e - 0.5) * 0.2) { const s = 0.9 + fbm(noise, lon + 70, lat + 70, cfg.cscale * 2, 3) * 0.2; col = [T.peak[0] * s, T.peak[1] * s, T.peak[2] * s]; }
        else if (e < cfg.sea) { const dep = e / cfg.sea, deep = [T.ocean[0] * 0.45, T.ocean[1] * 0.5, T.ocean[2] * 0.62]; col = mix(deep, T.ocean, Math.pow(dep, 0.7)); }
        else { const l = (e - cfg.sea) / (1 - cfg.sea); if (l < 0.06) col = mix(T.shore, T.low, l / 0.06); else if (l < 0.45) col = mix(T.low, [T.low[0] * 1.05, T.low[1] * 1.05, T.low[2] * 0.95], (l - 0.06) / 0.39); else if (l < 0.78) col = mix(T.low, T.high, (l - 0.45) / 0.33); else col = mix(T.high, T.peak, (l - 0.78) / 0.22); const m = fbm(noise, lon + 20, lat + 20, cfg.cscale * 3, 3); col = [col[0] * (0.9 + m * 0.2), col[1] * (0.9 + m * 0.2), col[2] * (0.9 + m * 0.2)]; }
      }
      const diff = Math.max(0, (nx * lx + ny * ly + nz * lz) / llen);
      const sh = (0.34 + 0.82 * diff) * (0.62 + 0.38 * nz);                 // diffuse light + limb darkening
      d[idx] = Math.min(255, col[0] * sh); d[idx + 1] = Math.min(255, col[1] * sh); d[idx + 2] = Math.min(255, col[2] * sh); d[idx + 3] = 255;
      if (cfg.lava > 0.001 && !T.bands) {                                    // self-lit lava cracks (glow even on the dark side)
        const vein = Math.min(Math.abs(fbm(noise, lon, lat, cfg.cscale * 1.5, 4) - 0.5), Math.abs(fbm(wn, lon + 3.1, lat + 1.7, cfg.cscale * 2.6, 3) - 0.5));
        const hw = 0.012 + cfg.lava * 0.11;
        if (vein < hw) { const t = 1 - vein / hw, g = (0.6 + 0.4 * t) * (0.7 + 0.3 * nz); d[idx] = Math.min(255, 255 * g); d[idx + 1] = Math.min(255, (70 + 175 * t) * g); d[idx + 2] = Math.min(255, (10 + 150 * t * t) * g); }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  if (cfg.atmoOn !== false) {                                               // faint atmosphere rim
    const [ar, ag, ab] = hx(cfg.atmoColor || '#5aa0e8');
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, R * 0.72, cx, cy, R);
    g.addColorStop(0, `rgba(${ar},${ag},${ab},0)`); g.addColorStop(0.82, `rgba(${ar},${ag},${ab},0.05)`); g.addColorStop(1, `rgba(${ar},${ag},${ab},0.5)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  return cv;
}

/* ---------- texture generation (config-driven; verbatim maths) ---------- */
function genPlanet(cfg, aniso) {
  const W = 1024, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H), d = img.data, noise = makeNoise(cfg.seed), wn = makeNoise(cfg.seed + 999);
  const T = TYPES[cfg.type] || TYPES.terran, sea = cfg.sea, cs = cfg.cscale, ice = cfg.ice, sharp = cfg.coast;
  const land = new Uint8Array(W * H), spec = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) { const lat = y / H, latC = Math.abs(lat - 0.5) * 2;
    for (let x = 0; x < W; x++) { const lon = x / W, idx = (y * W + x) * 4, i = y * W + x; let col;
      if (T.bands) { const band = 0.5 + 0.5 * Math.sin(lat * Math.PI * 8); const turb = fbm(noise, lon, lat * 3, cs * 1.5, 5) * 0.4; col = mix(T.low, T.high, Math.min(1, band * 0.6 + turb)); land[i] = 0; }
      else { let e = warp(noise, wn, lon, lat, cs, 6, 0.35); const dS = e - sea; e = sea + Math.sign(dS) * Math.pow(Math.abs(dS), 1 - sharp * 0.6);
        if (latC > (1 - ice) + (e - 0.5) * 0.2) { const s = 0.9 + fbm(noise, lon + 70, lat + 70, cs * 2, 3) * 0.2; col = [T.peak[0] * s, T.peak[1] * s, T.peak[2] * s]; land[i] = 0; }
        else if (e < sea) { const dep = e / sea; const deep = [T.ocean[0] * 0.45, T.ocean[1] * 0.5, T.ocean[2] * 0.62]; col = mix(deep, T.ocean, Math.pow(dep, 0.7)); if (dep > 0.82) col = mix(col, mix(T.ocean, T.shore, (dep - 0.82) / 0.18), (dep - 0.82) / 0.18); land[i] = 0; spec[i] = 1; }
        else { const l = (e - sea) / (1 - sea); if (l < 0.06) col = mix(T.shore, T.low, l / 0.06); else if (l < 0.45) col = mix(T.low, [T.low[0] * 1.05, T.low[1] * 1.05, T.low[2] * 0.95], (l - 0.06) / 0.39); else if (l < 0.78) col = mix(T.low, T.high, (l - 0.45) / 0.33); else col = mix(T.high, T.peak, (l - 0.78) / 0.22); const m = fbm(noise, lon + 20, lat + 20, cs * 3, 3); col = [col[0] * (0.9 + m * 0.2), col[1] * (0.9 + m * 0.2), col[2] * (0.9 + m * 0.2)]; land[i] = 1; if (T.lava && fbm(noise, lon + 50, lat + 50, cs * 2, 4) > 0.62) col = mix([255, 120, 40], [255, 220, 80], ((i * 97) % 100) / 100); }
      }
      d[idx] = col[0]; d[idx + 1] = col[1]; d[idx + 2] = col[2]; d[idx + 3] = 255;
    } }
  ctx.putImageData(img, 0, 0);
  const scv = document.createElement('canvas'); scv.width = W; scv.height = H; const sctx = scv.getContext('2d'), si = sctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) { const v = spec[i] ? 205 : 12; si.data[i * 4] = si.data[i * 4 + 1] = si.data[i * 4 + 2] = v; si.data[i * 4 + 3] = 255; }
  sctx.putImageData(si, 0, 0);
  return { tex: texFromCanvas(cv, aniso), specTex: texFromCanvas(scv, aniso), land, W, H };
}
// Night-side city lights. `density` (0–1) controls how much of the land glows: low → a few scattered
// clusters (high noise threshold, low probability), high → the land is blanketed in bright sprawl.
function genCity(land, W, H, seed, color, aniso, density) {
  density = Math.max(0, Math.min(1, density == null ? 0.5 : density));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const n = makeNoise(seed + 7), [r, g, b] = hx(color), img = ctx.getImageData(0, 0, W, H), d = img.data, rng = mulberry(seed + 3);
  const thresh = 0.82 - density * 0.44, prob = 0.22 + density * 0.74;   // few → blanketed
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, idx = i * 4;
    if (land[i]) { const cl = fbm(n, x / W, y / H, 8, 4); if (cl > thresh && rng() < prob) { const br = (0.45 + rng() * 0.5) * (0.7 + density * 0.5); d[idx] = Math.min(255, r * br); d[idx + 1] = Math.min(255, g * br); d[idx + 2] = Math.min(255, b * br); d[idx + 3] = 255; } }
  }
  ctx.putImageData(img, 0, 0); return texFromCanvas(cv, aniso);
}
// A glowing lava-crack emissive map: black everywhere except a branching vein network (min of two
// warped noise ridges), painted deep-orange at the edges → bright yellow-white at the crack centre.
// `cfg.lava` (0–1) widens the veins so higher intensity = a surface riven with molten rivers.
function genLava(cfg, aniso) {
  const W = 1024, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H), d = img.data;
  const n = makeNoise((cfg.seed | 0) + 321), n2 = makeNoise((cfg.seed | 0) + 654);
  const inten = Math.max(0, Math.min(1, cfg.lava || 0)), cs = (cfg.cscale || 2.2) * 1.5, halfW = 0.012 + inten * 0.12;
  for (let y = 0; y < H; y++) { const lat = y / H;
    for (let x = 0; x < W; x++) { const lon = x / W, idx = (y * W + x) * 4;
      const vein = Math.min(Math.abs(fbm(n, lon, lat, cs, 5) - 0.5), Math.abs(fbm(n2, lon + 3.1, lat + 1.7, cs * 1.7, 4) - 0.5));
      if (vein < halfW) { const t = 1 - vein / halfW; d[idx] = 255; d[idx + 1] = Math.min(255, 70 + 175 * t); d[idx + 2] = Math.min(255, 10 + 150 * t * t); d[idx + 3] = 255; }
      else { d[idx] = d[idx + 1] = d[idx + 2] = 0; d[idx + 3] = 255; }
    } }
  ctx.putImageData(img, 0, 0); return texFromCanvas(cv, aniso);
}
function genStorms(seed, count, intensity) { const rng = mulberry((seed | 0) + 555), out = []; for (let i = 0; i < count; i++) { const u = rng(), v = 0.22 + rng() * 0.56; out.push({ u, v, rad: 0.10 + rng() * 0.10 + intensity * 0.14, dir: v < 0.5 ? 1 : -1, arms: 2 + Math.floor(rng() * 3), tight: 5 + intensity * 12, eye: 0.12 + rng() * 0.10 }); } return out; }
function genClouds(p, aniso) {
  const W = 1024, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), d = img.data;
  const noise = makeNoise(p.seed), wn = makeNoise(p.seed + 4242), [r, g, b] = hx(p.tint || '#ffffff');
  const cov = p.cov, def = p.def, band = p.band, bandN = p.bandN, shear = p.shear, swirl = p.swirl, scale = p.scale, det = p.detail;
  const storms = p.storms || [], nSt = storms.length;
  const thresh = 1 - cov, edge = 0.32 * (1 - def) + 0.02;
  for (let y = 0; y < H; y++) { const lat = y / H, latScale = Math.sin(lat * Math.PI) || 1e-4;
    for (let x = 0; x < W; x++) { const lon = x / W, idx = (y * W + x) * 4;
      const lonS = lon + shear * 0.14 * Math.sin(lat * Math.PI * bandN);
      const wx = fbm(wn, lon, lat, scale * 0.35, 3) - 0.5, wy = fbm(wn, lon + 3.3, lat + 1.7, scale * 0.35, 3) - 0.5;
      let c = fbm(noise, lonS + wx * swirl, lat * 1.4 + wy * swirl, scale, det);
      let bf = 0.5 + 0.5 * Math.sin(lat * Math.PI * bandN) + (fbm(noise, lon + 5, lat + 5, scale * 0.6, 2) - 0.5) * 0.35;
      bf = bf < 0 ? 0 : bf > 1 ? 1 : bf;
      c *= 1 - band * (1 - bf);
      for (let s = 0; s < nSt; s++) { const st = storms[s]; let dlon = lon - st.u; if (dlon > 0.5) dlon -= 1; else if (dlon < -0.5) dlon += 1; const dx = dlon * 2 * latScale, dy = lat - st.v, rr = Math.sqrt(dx * dx + dy * dy); if (rr < st.rad) { const t = rr / st.rad; const spiral = 0.5 + 0.5 * Math.sin(Math.atan2(dy, dx) * st.arms + st.dir * t * st.tight); let sv = (1 - t) * (0.55 + 0.45 * spiral) * (0.55 + 0.9 * p.stormI); if (t < st.eye) sv *= t / st.eye; if (sv > c) c = sv; } }
      const a = Math.max(0, Math.min(1, (c - (thresh - edge)) / (2 * edge)));
      const bright = 0.62 + 0.38 * Math.min(1, Math.max(0, (c - thresh) / 0.32));
      d[idx] = r * bright; d[idx + 1] = g * bright; d[idx + 2] = b * bright; d[idx + 3] = a * 255;
    } }
  ctx.putImageData(img, 0, 0); return texFromCanvas(cv, aniso);
}
function makeRingTex(color, aniso) { const W = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = 16; const ctx = cv.getContext('2d'); const [r, g, b] = hx(color); const n = makeNoise(4); for (let x = 0; x < W; x++) { const t = x / W; const gap = fbm(n, t * 3, 0.5, 6, 4); const a = t < 0.12 ? 0 : (0.35 + gap * 0.6) * (t > 0.9 ? (1 - t) / 0.1 : 1); ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`; ctx.fillRect(x, 0, 1, 16); } return texFromCanvas(cv, aniso); }

/* ---------- the builder ---------- */
export function buildPlanetModel(config, opts) {
  opts = opts || {};
  const cfg = Object.assign({ type: 'terran', seed: 1, sea: 0.52, cscale: 2.2, coast: 0.5, ice: 0.15, spin: 1 }, config || {});
  const aniso = opts.anisotropy || 1, R = opts.radius || 1, seg = opts.segments || 72;
  const core = new THREE.Group();
  const disposables = [];

  const surf = genPlanet(cfg, aniso); disposables.push(surf.tex, surf.specTex);
  const planetMat = new THREE.MeshStandardMaterial({ map: surf.tex, metalnessMap: surf.specTex, roughness: 0.82, metalness: 0.4 });
  // molten lava flow: a glowing emissive crack network over the crust (self-lit, so it glows on the
  // night side too). cfg.lava (0–1) scales both how riven the surface is and how bright the glow.
  const lavaI = Math.max(0, Math.min(1, cfg.lava || 0));
  if (lavaI > 0.001) {
    planetMat.emissive = new THREE.Color(0xffffff);
    planetMat.emissiveMap = genLava(cfg, aniso);
    planetMat.emissiveIntensity = 0.75 + lavaI * 1.35;
    disposables.push(planetMat.emissiveMap);
  }
  // Destroyed / cataclysm planets: assemble the crust from partial-sphere pieces (no CSG) so a molten
  // core shows through the breaks, and scatter a rocky debris field. cfg.destroyed picks the variant;
  // cfg.destroyI (0–1) scales the break gap, core glow and debris amount.
  const destroyed = (cfg.destroyed && cfg.destroyed !== 'none') ? cfg.destroyed : null;
  const destroyI = Math.max(0, Math.min(1, cfg.destroyI != null ? +cfg.destroyI : 0.6));
  let planet;
  if (destroyed) {
    planet = new THREE.Group(); core.add(planet);
    const moltenMat = new THREE.MeshStandardMaterial({ color: 0x1a0603, emissive: new THREE.Color(0xff5a1e), emissiveIntensity: 1.0 + destroyI * 1.8, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb454) });   // exposed molten core (fully self-lit)
    disposables.push(planetMat, moltenMat, coreMat);
    const hS = Math.max(10, seg >> 1);
    const crustPiece = (phiStart, phiLen) => { const g = new THREE.SphereGeometry(R, seg, hS, phiStart, phiLen); const m = new THREE.Mesh(g, planetMat); planet.add(m); disposables.push(g); return m; };
    const moltenCore = (rr) => { const g = new THREE.SphereGeometry(rr, 32, 24); const m = new THREE.Mesh(g, coreMat); planet.add(m); disposables.push(g); return m; };
    const gap = R * (0.12 + destroyI * 0.5);
    if (destroyed === 'split') {
      const a = new THREE.Mesh(new THREE.SphereGeometry(R, seg, seg, 0, Math.PI), planetMat); a.position.x = gap;
      const b = new THREE.Mesh(new THREE.SphereGeometry(R, seg, seg, Math.PI, Math.PI), planetMat); b.position.x = -gap;
      planet.add(a, b); disposables.push(a.geometry, b.geometry);
      moltenCore(R * 0.5);
      for (const s of [1, -1]) { const cg = new THREE.CircleGeometry(R * 0.98, 40); const cm = new THREE.Mesh(cg, moltenMat); cm.position.x = s * gap; cm.rotation.y = Math.PI / 2; planet.add(cm); disposables.push(cg); }
    } else if (destroyed === 'chunk') { crustPiece(0, Math.PI * 2 - (0.7 + destroyI * 0.9)); moltenCore(R * 0.55); }
    else if (destroyed === 'cored') { crustPiece(0, Math.PI * 2 - (0.5 + destroyI * 0.6)); moltenCore(R * 0.62); }
    else if (destroyed === 'holed') {
      const s = new THREE.Mesh(new THREE.SphereGeometry(R, seg, seg), planetMat); planet.add(s); disposables.push(s.geometry);
      const bore = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.24, R * 0.24, R * 2.3, 24, 1, true), moltenMat); bore.rotation.z = Math.PI / 2; planet.add(bore); disposables.push(bore.geometry);
      moltenCore(R * 0.26);
    } else if (destroyed === 'fractured') {
      const pieces = 5; for (let i = 0; i < pieces; i++) { const m = crustPiece(i / pieces * Math.PI * 2, Math.PI * 2 / pieces * 0.86); const ang = i / pieces * Math.PI * 2; m.position.set(Math.cos(ang) * gap * 0.6, Math.sin(ang) * gap * 0.6, 0); }
      moltenCore(R * 0.5);
    } else { crustPiece(0, Math.PI * 2 - (0.7 + destroyI * 0.9)); moltenCore(R * 0.55); }
    // debris field — rocky chunks around the wreck, count/spread scaled by intensity
    const dN = Math.round(6 + destroyI * 26); let ds = ((cfg.seed || 7) >>> 0) || 7; const drnd = () => { ds = (ds * 1664525 + 1013904223) >>> 0; return ds / 4294967296; };
    const debrisMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x6a5a50), roughness: 0.95, metalness: 0.05, flatShading: true }); disposables.push(debrisMat);
    for (let k = 0; k < dN; k++) { const g = new THREE.IcosahedronGeometry(R * (0.03 + drnd() * 0.1), 0); const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) { const f = 0.6 + drnd() * 0.7; pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f, pos.getZ(i) * f); } g.computeVertexNormals(); const m = new THREE.Mesh(g, debrisMat); const ang = drnd() * 6.28, rad = R * (1.15 + drnd() * (0.6 + destroyI * 1.2)); m.position.set(Math.cos(ang) * rad, Math.sin(ang) * rad, (drnd() - 0.5) * R * 0.6); m.rotation.set(drnd() * 6, drnd() * 6, drnd() * 6); planet.add(m); disposables.push(g); }
  } else {
    planet = new THREE.Mesh(new THREE.SphereGeometry(R, seg, seg), planetMat); core.add(planet);
    disposables.push(planet.geometry, planetMat);
  }

  // night-side city lights (additive, masked to the dark hemisphere in world space)
  let night = null;
  const T = TYPES[cfg.type] || TYPES.terran;
  const cityD = cfg.city != null ? Math.max(0, Math.min(1, +cfg.city)) : 0;   // opt-in: no city lights unless the DM dials them up
  if (!destroyed && cfg.cityOn !== false && cityD > 0) {
    const nightMat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    nightMat.onBeforeCompile = sh => {
      sh.uniforms.sunDir = { value: new THREE.Vector3(1, 0, 0) };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWN=normalize(mat3(modelMatrix)*normal);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 sunDir;\nvarying vec3 vWN;').replace('#include <dithering_fragment>', '#include <dithering_fragment>\nfloat n=clamp(-dot(normalize(vWN),normalize(sunDir))*1.6+0.25,0.0,1.0);\ngl_FragColor.rgb*=n;gl_FragColor.a*=n;');
      nightMat.userData.shader = sh;
    };
    nightMat.map = genCity(surf.land, surf.W, surf.H, cfg.seed, cfg.lightColor || '#ffd98a', aniso, cityD);
    night = new THREE.Mesh(new THREE.SphereGeometry(R + 0.002, seg, seg), nightMat); core.add(night);
    disposables.push(night.geometry, nightMat, nightMat.map);
  }

  // clouds
  let clouds = null;
  if (!destroyed && cfg.cloudsOn !== false) {
    const p = { seed: cfg.cloudSeed != null ? cfg.cloudSeed : cfg.seed + 1, cov: cfg.cloudCov != null ? cfg.cloudCov : 0.5, tint: cfg.cloudTint || '#ffffff', scale: cfg.cloudScale || 2.6, detail: cfg.cloudDetail || 5, def: cfg.cloudDef != null ? cfg.cloudDef : 0.5, band: cfg.cloudBand != null ? cfg.cloudBand : 0.4, bandN: cfg.cloudBandN || 7, shear: cfg.cloudShear != null ? cfg.cloudShear : 0.4, swirl: cfg.cloudSwirl != null ? cfg.cloudSwirl : 0.3, storms: genStorms(cfg.cloudSeed != null ? cfg.cloudSeed : cfg.seed + 1, cfg.storms || 0, cfg.stormI || 0), stormI: cfg.stormI || 0 };
    const cloudMat = new THREE.MeshStandardMaterial({ map: genClouds(p, aniso), transparent: true, depthWrite: false, roughness: 1, opacity: cfg.cloudOpacity != null ? cfg.cloudOpacity : 0.85 });
    clouds = new THREE.Mesh(new THREE.SphereGeometry(R + 0.03, seg, seg), cloudMat); core.add(clouds);
    disposables.push(clouds.geometry, cloudMat, cloudMat.map);
  }

  // atmosphere (feathered fresnel rim, matches the generator post-slice-1)
  let atmo = null;
  if (!destroyed && cfg.atmoOn !== false) {
    const atmoMat = new THREE.ShaderMaterial({ transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
      uniforms: { c: { value: new THREE.Color(cfg.atmoColor || '#5aa0e8') }, density: { value: cfg.atmoDensity != null ? cfg.atmoDensity : 1 }, sunDir: { value: new THREE.Vector3(1, 0, 0) } },
      vertexShader: 'varying vec3 vN;varying vec3 vWP;void main(){vN=normalize(mat3(modelMatrix)*normal);vWP=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec3 vN;varying vec3 vWP;uniform vec3 c;uniform float density;uniform vec3 sunDir;void main(){vec3 V=normalize(cameraPosition-vWP);float f=pow(1.0-abs(dot(vN,V)),2.0);float s=clamp(dot(normalize(vN),normalize(sunDir))*0.5+0.5,0.0,1.0);gl_FragColor=vec4(c,f*density*mix(0.4,1.0,s));}' });
    atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.14, 48, 48), atmoMat); core.add(atmo);
    disposables.push(atmo.geometry, atmoMat);
  }

  // ring
  let ring = null;
  if (cfg.ringOn) {
    const w = cfg.ringW != null ? cfg.ringW : 0.5, inner = R * 1.35, outer = R * (1.35 + 0.9 * w + 0.15);
    const g = new THREE.RingGeometry(inner, outer, 128);
    const pos = g.attributes.position, uv = g.attributes.uv, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const rad = v.length(); uv.setXY(i, (rad - inner) / (outer - inner), 0.5); }
    const ringMat = new THREE.MeshBasicMaterial({ map: makeRingTex(cfg.ringColor || '#c8b48a', aniso), side: THREE.DoubleSide, transparent: true, depthWrite: false, opacity: 0.9 });
    ring = new THREE.Mesh(g, ringMat); ring.rotation.x = Math.PI / 2; core.add(ring);
    disposables.push(g, ringMat, ringMat.map);
  }

  // lightning — brief additive flashes over the storm cells; cadence from lightRate (matches the 2D art's
  // storms/lightning). depthTest stays on so the opaque planet occludes far-side flashes. (2D<->3D parity.)
  const flashes = []; let flashPeriod = 1;
  if (!destroyed && cfg.lightOn && (cfg.storms | 0) > 0) {
    const cells = genStorms(cfg.cloudSeed != null ? cfg.cloudSeed : cfg.seed + 1, cfg.storms | 0, cfg.stormI || 0);
    flashPeriod = Math.max(0.35, 2.6 - (cfg.lightRate != null ? +cfg.lightRate : 0.5) * 2.2);
    const lightning = new THREE.Group(), tex = coronaTex(), col = new THREE.Color(cfg.boltColor || '#bfe0ff'), lrng = mulberry((cfg.seed | 0) + 131);
    for (const st of cells) {
      const phi = st.u * Math.PI * 2, theta = st.v * Math.PI, rr = R + 0.05;
      const mat = new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
      const sp = new THREE.Sprite(mat);
      sp.position.set(-Math.cos(phi) * Math.sin(theta) * rr, Math.cos(theta) * rr, Math.sin(phi) * Math.sin(theta) * rr);
      const sz = (0.22 + (st.rad || 0.15)) * R; sp.scale.set(sz, sz, sz);
      sp.userData.phase = lrng() * flashPeriod;
      lightning.add(sp); flashes.push(sp); disposables.push(mat);
    }
    disposables.push(tex); planet.add(lightning);
  }

  const spin = cfg.spin != null ? cfg.spin : 1;
  const _sun = new THREE.Vector3(1, 0.3, 0.6).normalize();
  const lavaBase = 0.75 + lavaI * 1.35; let _t = 0, _tl = 0;

  return {
    group: core,
    update(dt, sunDirWorld) {
      const sd = sunDirWorld || _sun;
      planet.rotation.y += spin * 0.12 * dt;
      if (lavaI > 0.001) { _t += dt; planetMat.emissiveIntensity = lavaBase * (0.86 + 0.14 * Math.sin(_t * 1.8)); }   // subtle molten shimmer
      if (night) { night.rotation.y = planet.rotation.y; const sh = night.material.userData.shader; if (sh) sh.uniforms.sunDir.value.copy(sd); }
      if (clouds) clouds.rotation.y += (spin * 0.12 + 0.05) * dt;
      if (atmo) atmo.material.uniforms.sunDir.value.copy(sd);
      if (flashes.length) { _tl += dt; for (const sp of flashes) { const tt = (((_tl + sp.userData.phase) % flashPeriod) / flashPeriod); // strobe: bright onset then quick decay, dark for the rest of the period
        sp.material.opacity = tt < 0.02 ? 1 : tt < 0.05 ? 0.25 : tt < 0.08 ? 0.9 : tt < 0.13 ? 0.2 * (1 - (tt - 0.08) / 0.05) : 0; } }
    },
    dispose() { disposables.forEach(o => { try { o.dispose(); } catch (e) { /* noop */ } }); }
  };
}

/* ---------- 3D star model ---------- */
function coronaTex() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return texFromCanvas(cv, 1);
}
function raysTex(seed) {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const ctx = cv.getContext('2d');
  ctx.translate(S / 2, S / 2);
  let r = (seed | 0) >>> 0; const rnd = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
  const N = 16;
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2 + rnd() * 0.25, len = S * 0.5 * (0.45 + rnd() * 0.55), w = 0.015 + rnd() * 0.05;
    const g = ctx.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a - w) * len, Math.sin(a - w) * len); ctx.lineTo(Math.cos(a + w) * len, Math.sin(a + w) * len); ctx.closePath(); ctx.fill();
  }
  return texFromCanvas(cv, 1);
}

// Build a glowing 3D star: bright body + fresnel glow shell + corona bloom + rotating flare rays,
// Three independently-coloured parts + effects, matching the 2D star:
//   c1 = CORE body · c2 = immediate GLOW (fresnel shell + corona bloom) · c3 = DIFFUSE light + rays.
// brightness scales opacity/emissive; breathe{on,speed,depth} drives the pulse; raySpec + `rays`
// control the sun rays; coronaSize sizes the glow/diffuse reach. Returns { group, update(dt), dispose }.
export function buildStarModel(config, opts) {
  opts = opts || {};
  const cfg = config || {};
  const R = opts.radius || 1, seg = opts.segments || 40;
  const core = new THREE.Color(cfg.c1 || cfg.color || '#ffd98a');
  const glowC = new THREE.Color(cfg.c2 || cfg.c1 || '#ffb36b');
  const diffC = new THREE.Color(cfg.c3 || '#fff2c8');
  const br = cfg.brightness != null ? cfg.brightness : 1;
  const csz = cfg.coronaSize != null ? cfg.coronaSize : 1;
  const bre = cfg.breathe || { on: true, speed: 1, depth: 0.12 };
  const rs = cfg.raySpec || { count: 14, length: 1, intensity: 0.5 };
  const grp = new THREE.Group(); const dis = [];

  // CORE — bright central sphere (brightness pushes it toward white for a hot look).
  const bodyMat = new THREE.MeshBasicMaterial({ color: core.clone().lerp(new THREE.Color('#ffffff'), Math.min(0.85, 0.42 + br * 0.16)) });
  const body = new THREE.Mesh(new THREE.SphereGeometry(R * 0.6, seg, seg), bodyMat); grp.add(body); dis.push(body.geometry, bodyMat);

  // IMMEDIATE GLOW — a fresnel shell in the glow colour hugging the core.
  const glowMat = new THREE.ShaderMaterial({ transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: { c: { value: glowC.clone() }, i: { value: Math.min(1.4, br) } },
    vertexShader: 'varying vec3 vN;varying vec3 vWP;void main(){vN=normalize(mat3(modelMatrix)*normal);vWP=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec3 vN;varying vec3 vWP;uniform vec3 c;uniform float i;void main(){vec3 V=normalize(cameraPosition-vWP);float f=pow(1.0-abs(dot(vN,V)),1.5);gl_FragColor=vec4(c,f*i);}' });
  const glowMesh = new THREE.Mesh(new THREE.SphereGeometry(R * 0.98, seg, seg), glowMat); grp.add(glowMesh); dis.push(glowMesh.geometry, glowMat);

  const corTex = coronaTex();
  // Immediate-glow corona bloom (glow colour).
  const corMat = new THREE.SpriteMaterial({ map: corTex, color: glowC.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: Math.min(1, 0.8 * br) });
  const baseCor = R * 3.2 * csz;
  const corSpr = new THREE.Sprite(corMat); corSpr.scale.set(baseCor, baseCor, 1); grp.add(corSpr); dis.push(corMat, corTex);
  // Diffuse light — a wider, fainter halo (diffuse colour) reaching out with coronaSize.
  const difMat = new THREE.SpriteMaterial({ map: corTex, color: diffC.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: Math.min(1, 0.34 * br) });
  const difS = R * 4.7 * csz;
  const difSpr = new THREE.Sprite(difMat); difSpr.scale.set(difS, difS, 1); grp.add(difSpr); dis.push(difMat);

  // SUN RAYS (diffuse colour) — rotating ray sprite; hidden when rays:false or count 0.
  let rayMat = null;
  if (cfg.rays !== false && (rs.count == null || rs.count > 0)) {
    const rTex = raysTex(cfg.seed || 7);
    rayMat = new THREE.SpriteMaterial({ map: rTex, color: diffC.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: Math.min(1, (rs.intensity != null ? rs.intensity : 0.5) * 1.1 * br) });
    const rayS = R * 3.0 * (1 + ((rs.length != null ? rs.length : 1) - 1) * 0.5) * csz;
    const raySpr = new THREE.Sprite(rayMat); raySpr.scale.set(rayS, rayS, 1); grp.add(raySpr); dis.push(rayMat, rTex);
  }

  const spin = cfg.spin != null ? cfg.spin : 1;
  const bDepth = (bre && bre.on !== false) ? (bre.depth != null ? bre.depth : 0.12) : 0;
  const bSpeed = (bre && bre.speed != null) ? bre.speed : 1;
  const baseCorOp = corMat.opacity; let t0 = 0;
  return {
    group: grp,
    update(dt) {
      t0 += dt; body.rotation.y += 0.15 * spin * dt; if (rayMat) rayMat.rotation += 0.12 * dt;
      if (bDepth > 0) {
        const s = Math.sin(t0 * 1.6 * bSpeed), p = 1 + s * bDepth;
        corSpr.scale.set(baseCor * p, baseCor * p, 1);
        corMat.opacity = Math.min(1, baseCorOp * (0.85 + s * 0.25));
      }
    },
    dispose() { dis.forEach(o => { try { o.dispose(); } catch (e) { /* noop */ } }); }
  };
}

// ---------- space station: a hub + a rotating habitat ring (lit windows) + solar-panel arrays + a
// comms mast. Reads unmistakably as a station both top-down and tilted. Returns { group, update, dispose }.
// Nine distinct 3D station builds, one per `stype`, matching the 2D silhouettes:
//   ring · wheel · hub · starfort · spire · array · drydock · derelict · husk
// Colour scheme is shared (metal=c1, dark=c2, lit=c3, solar=blue panel). Returns { group, update, dispose }.
export function buildStationModel(config, opts) {
  opts = opts || {}; const cfg = config || {}, R = opts.radius || 1;
  const core = new THREE.Group(), dis = [];
  const metal = new THREE.MeshStandardMaterial({ color: new THREE.Color(cfg.c1 || '#b9c4d4'), metalness: 0.82, roughness: 0.34 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(cfg.c2 || '#33405c'), metalness: 0.5, roughness: 0.55 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x16386e, metalness: 0.3, roughness: 0.4, emissive: new THREE.Color(0x0a1c44), emissiveIntensity: 0.5 });
  const lit = new THREE.MeshBasicMaterial({ color: new THREE.Color(cfg.c3 || '#ffe08a') });   // window / beacon glow
  dis.push(metal, dark, panel, lit);
  const add = (geo, mat, x, y, z, rx, ry, rz, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0); (parent || core).add(m); dis.push(geo); return m; };
  const solarWing = (sx, boom) => {   // a boom + blue solar panel with spars, mirrored by sign sx
    add(new THREE.CylinderGeometry(R * 0.022, R * 0.022, boom, 8), metal, sx * (boom * 0.5 + R * 0.5), 0, 0, 0, 0, Math.PI / 2);
    const px = sx * (boom + R * 0.5 + R * 0.25);
    add(new THREE.BoxGeometry(R * 0.5, R * 0.92, R * 0.02), panel, px, 0, 0);
    add(new THREE.BoxGeometry(R * 0.52, R * 0.05, R * 0.03), dark, px, 0, R * 0.015);
    add(new THREE.BoxGeometry(R * 0.02, R * 0.92, R * 0.03), dark, px, 0, R * 0.015);
  };
  const litRing = (rad, count, parent, zoff) => {   // evenly spaced window blocks around a circle
    for (let i = 0; i < count; i++) { const a = i / count * Math.PI * 2; const w = new THREE.Mesh(new THREE.BoxGeometry(R * 0.06, R * 0.035, R * 0.05), lit); w.position.set(Math.cos(a) * rad, Math.sin(a) * rad, (zoff || 0)); (parent || core).add(w); dis.push(w.geometry); }
  };
  const hub = (rad) => { add(new THREE.CylinderGeometry(rad, rad, R * 0.5, 18), metal, 0, 0, 0, Math.PI / 2, 0, 0); add(new THREE.SphereGeometry(rad * 1.2, 20, 14), metal, 0, 0, 0); add(new THREE.SphereGeometry(rad * 0.55, 12, 10), lit, 0, 0, rad * 1.6); };
  const stype = cfg.stype || 'ring';
  let spinGroup = null, spinRate = 0.4, drift = 0.03, tumble = null;

  if (stype === 'ring') {
    hub(R * 0.18);
    const ring = new THREE.Group();
    const torus = new THREE.Mesh(new THREE.TorusGeometry(R * 0.64, R * 0.1, 16, 44), metal); ring.add(torus); dis.push(torus.geometry);
    litRing(R * 0.64, 20, ring, R * 0.1);
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; const sp = new THREE.Mesh(new THREE.BoxGeometry(R * 0.64, R * 0.05, R * 0.05), metal); sp.position.set(Math.cos(a) * R * 0.32, Math.sin(a) * R * 0.32, 0); sp.rotation.z = a; ring.add(sp); dis.push(sp.geometry); }
    core.add(ring); spinGroup = ring; spinRate = 0.45;
    solarWing(-1, R * 0.46); solarWing(1, R * 0.46);
    add(new THREE.CylinderGeometry(R * 0.016, R * 0.016, R * 0.6, 8), metal, 0, 0, R * 0.42, Math.PI / 2, 0, 0);
    add(new THREE.SphereGeometry(R * 0.07, 12, 10), lit, 0, 0, R * 0.74);
  } else if (stype === 'wheel') {   // cartwheel: heavy outer rim + thin inner rim + many spokes
    hub(R * 0.14);
    const ring = new THREE.Group();
    const outer = new THREE.Mesh(new THREE.TorusGeometry(R * 0.74, R * 0.09, 14, 48), metal); ring.add(outer); dis.push(outer.geometry);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(R * 0.42, R * 0.035, 12, 36), dark); ring.add(inner); dis.push(inner.geometry);
    litRing(R * 0.74, 28, ring, R * 0.09);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const sp = new THREE.Mesh(new THREE.BoxGeometry(R * 0.72, R * 0.035, R * 0.045), metal); sp.position.set(Math.cos(a) * R * 0.37, Math.sin(a) * R * 0.37, 0); sp.rotation.z = a; ring.add(sp); dis.push(sp.geometry); }
    core.add(ring); spinGroup = ring; spinRate = 0.55;
  } else if (stype === 'hub') {   // central node with radial docking arms + end pods (no big ring)
    hub(R * 0.24);
    const arms = 6;
    for (let i = 0; i < arms; i++) {
      const a = i / arms * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
      const boom = add(new THREE.BoxGeometry(R * 0.66, R * 0.07, R * 0.07), metal, dx * R * 0.5, dy * R * 0.5, 0); boom.rotation.z = a;
      add(new THREE.CylinderGeometry(R * 0.12, R * 0.12, R * 0.18, 12), metal, dx * R * 0.86, dy * R * 0.86, 0, Math.PI / 2, 0, 0);   // docking pod
      add(new THREE.SphereGeometry(R * 0.05, 10, 8), lit, dx * R * 0.86, dy * R * 0.86, R * 0.1);
    }
    add(new THREE.SphereGeometry(R * 0.12, 16, 12), lit, 0, 0, R * 0.02); spinRate = 0; drift = 0.12;
  } else if (stype === 'starfort') {   // six-point gold star fort with a lit core
    const pts = 6;
    for (let i = 0; i < pts; i++) {
      const a = i / pts * Math.PI * 2;
      const spike = add(new THREE.ConeGeometry(R * 0.2, R * 0.62, 4), metal, Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, 0, Math.PI / 2, 0, 0);
      spike.rotation.z = a - Math.PI / 2;
    }
    add(new THREE.CylinderGeometry(R * 0.42, R * 0.42, R * 0.16, 6), metal, 0, 0, 0, Math.PI / 2, 0, 0);   // hex keep
    add(new THREE.TorusGeometry(R * 0.24, R * 0.05, 10, 6), dark, 0, 0, R * 0.09);
    add(new THREE.SphereGeometry(R * 0.14, 16, 12), lit, 0, 0, R * 0.12); spinRate = 0.12; drift = 0.08;
  } else if (stype === 'spire') {   // sharp four-point in-plane star + glowing core
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2;
      const spike = add(new THREE.ConeGeometry(R * 0.12, R * 0.95, 4), metal, Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, 0, Math.PI / 2, 0, 0);
      spike.rotation.z = a - Math.PI / 2;
    }
    add(new THREE.OctahedronGeometry(R * 0.26, 0), metal, 0, 0, 0);
    add(new THREE.SphereGeometry(R * 0.16, 18, 14), lit, 0, 0, 0); spinRate = 0.22; drift = 0.05;
  } else if (stype === 'array') {   // central truss with stacked solar panels along ±x
    add(new THREE.BoxGeometry(R * 0.16, R * 1.1, R * 0.16), metal, 0, 0, 0);
    add(new THREE.SphereGeometry(R * 0.13, 14, 10), lit, 0, 0, R * 0.12);
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
      const yy = (k - 1) * R * 0.42;
      add(new THREE.CylinderGeometry(R * 0.018, R * 0.018, R * 0.34, 6), metal, sx * R * 0.28, yy, 0, 0, 0, Math.PI / 2);
      const p = add(new THREE.BoxGeometry(R * 0.44, R * 0.34, R * 0.02), panel, sx * R * 0.62, yy, 0); p.rotation.y = sx * 0.25;
    }
    spinRate = 0; drift = 0.06;
  } else if (stype === 'drydock') {   // open rectangular cradle holding a capsule + clamp arms
    add(new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(R * 0.18, R * 0.7, 6, 12) : new THREE.CylinderGeometry(R * 0.18, R * 0.18, R * 1.0, 14), metal, 0, 0, 0, 0, 0, Math.PI / 2);
    for (const sy of [-1, 1]) {
      add(new THREE.BoxGeometry(R * 1.1, R * 0.05, R * 0.05), dark, 0, sy * R * 0.44, 0);   // long rails
      for (const sx of [-1, 1]) add(new THREE.BoxGeometry(R * 0.05, R * 0.44, R * 0.05), dark, sx * R * 0.52, sy * R * 0.22, 0);   // uprights
      for (const sx of [-1, 0, 1]) { const c = add(new THREE.BoxGeometry(R * 0.05, R * 0.3, R * 0.05), metal, sx * R * 0.4, sy * R * 0.3, 0); c.rotation.z = sy * 0.4; add(new THREE.SphereGeometry(R * 0.03, 8, 6), lit, sx * R * 0.4, sy * R * 0.16, 0); }
    }
    spinRate = 0; drift = 0.05;
  } else if (stype === 'derelict') {   // broken, gapped ring — dark, cold, a few sparks
    const t = new THREE.TorusGeometry(R * 0.66, R * 0.1, 12, 40, Math.PI * 1.35); const tm = new THREE.Mesh(t, dark); tm.rotation.z = 0.5; core.add(tm); dis.push(t);
    add(new THREE.SphereGeometry(R * 0.16, 16, 12), dark, 0, 0, 0);
    add(new THREE.BoxGeometry(R * 0.5, R * 0.05, R * 0.05), dark, R * 0.2, R * 0.28, 0, 0, 0, 0.7);   // snapped spoke
    for (let i = 0; i < 4; i++) { const a = Math.PI * 1.4 + i * 0.22; add(new THREE.SphereGeometry(R * 0.03, 6, 6), lit, Math.cos(a) * R * 0.66, Math.sin(a) * R * 0.66, 0); }   // flickering sparks at the break
    core.rotation.z = 0.3; spinRate = 0; tumble = { x: 0.02, y: 0.015, z: 0.05 };
  } else if (stype === 'husk') {   // dark angular hull fragment tumbling in the dark
    const frag = add(new THREE.BoxGeometry(R * 0.9, R * 0.5, R * 0.35), dark, 0, 0, 0, 0.3, 0.5, 0.2);
    add(new THREE.BoxGeometry(R * 0.4, R * 0.6, R * 0.3), dark, R * 0.45, R * 0.15, 0, 0.6, 0.2, -0.3);
    add(new THREE.ConeGeometry(R * 0.22, R * 0.5, 5), metal, -R * 0.42, -R * 0.12, 0, 0, 0, 1.9);   // torn spar
    add(new THREE.SphereGeometry(R * 0.04, 6, 6), lit, R * 0.1, -R * 0.05, R * 0.14);   // one light still on
    spinRate = 0; tumble = { x: 0.06, y: 0.04, z: 0.03 };
  } else {   // fallback → ring
    hub(R * 0.18);
    const torus = add(new THREE.TorusGeometry(R * 0.64, R * 0.1, 16, 44), metal, 0, 0, 0);
    litRing(R * 0.64, 20, core, R * 0.1);
    solarWing(-1, R * 0.46); solarWing(1, R * 0.46);
  }

  const spin = cfg.spin != null ? cfg.spin : 1;
  return {
    group: core,
    update(dt) {
      if (spinGroup) spinGroup.rotation.z += spinRate * spin * dt;
      if (tumble) { core.rotation.x += tumble.x * spin * dt; core.rotation.y += tumble.y * spin * dt; core.rotation.z += tumble.z * spin * dt; }
      else core.rotation.z += drift * spin * dt;
    },
    dispose() { dis.forEach(o => { try { o.dispose(); } catch (e) { /* noop */ } }); }
  };
}

// ---------- asteroid / debris: an irregular, faceted rock (seeded vertex displacement) that tumbles.
// Clearly a lumpy rock, not a sphere. Returns { group, update, dispose }.
export function buildAsteroidModel(config, opts) {
  opts = opts || {}; const cfg = config || {}, R = opts.radius || 1;
  const core = new THREE.Group(), dis = [];
  const seed = (cfg.seed || 1) >>> 0;
  const hash = (x, y, z) => { const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 0.123) * 43758.5453; return n - Math.floor(n); };
  const geo = new THREE.IcosahedronGeometry(R * 0.92, 3);
  const pos = geo.attributes.position, v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i); n.copy(v).normalize();
    const lump = 0.66 + 0.42 * hash(Math.round(n.x * 3), Math.round(n.y * 3), Math.round(n.z * 3)) + 0.16 * hash(n.x * 8, n.y * 8, n.z * 8);
    const crater = hash(n.x * 5 + 2, n.y * 5 + 2, n.z * 5 + 2) > 0.86 ? 0.78 : 1;   // occasional dents
    v.copy(n).multiplyScalar(R * 0.92 * Math.max(0.5, Math.min(1.18, lump)) * crater);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const base = new THREE.Color(cfg.c1 || '#7c736a');
  const mat = new THREE.MeshStandardMaterial({ color: base, roughness: 0.96, metalness: 0.04, flatShading: true });
  const rock = new THREE.Mesh(geo, mat); core.add(rock); dis.push(geo, mat);
  // a couple of tiny companion rocks so it reads as a debris body
  for (let k = 0; k < 2; k++) {
    const g2 = new THREE.IcosahedronGeometry(R * (0.12 + hash(k, k, k) * 0.08), 1);
    const m2 = new THREE.Mesh(g2, mat); const a = hash(k + 3, k + 5, k + 7) * 6.283, rr = R * (1.05 + hash(k + 1, k + 2, k + 4) * 0.25);
    m2.position.set(Math.cos(a) * rr, Math.sin(a) * rr, (hash(k, k + 9, k) - 0.5) * R * 0.5); core.add(m2); dis.push(g2);
  }
  const tx = (hash(1, 2, 3) - 0.5) * 0.7, ty = (hash(4, 5, 6) - 0.5) * 0.7, tz = (hash(7, 8, 9) - 0.5) * 0.5;
  return {
    group: core,
    update(dt) { rock.rotation.x += tx * dt; rock.rotation.y += ty * dt; core.rotation.z += tz * dt; },   // slow tumble
    dispose() { dis.forEach(o => { try { o.dispose(); } catch (e) { /* noop */ } }); }
  };
}
