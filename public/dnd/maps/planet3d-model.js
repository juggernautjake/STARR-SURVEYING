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
function genCity(land, W, H, seed, color, aniso) { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); const n = makeNoise(seed + 7), [r, g, b] = hx(color); const img = ctx.getImageData(0, 0, W, H), d = img.data, rng = mulberry(seed + 3); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, idx = i * 4; if (land[i]) { const cl = fbm(n, x / W, y / H, 8, 4); if (cl > 0.72 && rng() < 0.5) { const br = 0.5 + rng() * 0.5; d[idx] = r * br; d[idx + 1] = g * br; d[idx + 2] = b * br; d[idx + 3] = 255; } } } ctx.putImageData(img, 0, 0); return texFromCanvas(cv, aniso); }
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
  const planet = new THREE.Mesh(new THREE.SphereGeometry(R, seg, seg), planetMat); core.add(planet);
  disposables.push(planet.geometry, planetMat);

  // night-side city lights (additive, masked to the dark hemisphere in world space)
  let night = null;
  const T = TYPES[cfg.type] || TYPES.terran;
  if (cfg.cityOn !== false && T.city > 0) {
    const nightMat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    nightMat.onBeforeCompile = sh => {
      sh.uniforms.sunDir = { value: new THREE.Vector3(1, 0, 0) };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWN=normalize(mat3(modelMatrix)*normal);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 sunDir;\nvarying vec3 vWN;').replace('#include <dithering_fragment>', '#include <dithering_fragment>\nfloat n=clamp(-dot(normalize(vWN),normalize(sunDir))*1.6+0.25,0.0,1.0);\ngl_FragColor.rgb*=n;gl_FragColor.a*=n;');
      nightMat.userData.shader = sh;
    };
    nightMat.map = genCity(surf.land, surf.W, surf.H, cfg.seed, cfg.lightColor || '#ffd98a', aniso);
    night = new THREE.Mesh(new THREE.SphereGeometry(R + 0.002, seg, seg), nightMat); core.add(night);
    disposables.push(night.geometry, nightMat, nightMat.map);
  }

  // clouds
  let clouds = null;
  if (cfg.cloudsOn !== false) {
    const p = { seed: cfg.cloudSeed != null ? cfg.cloudSeed : cfg.seed + 1, cov: cfg.cloudCov != null ? cfg.cloudCov : 0.5, tint: cfg.cloudTint || '#ffffff', scale: cfg.cloudScale || 2.6, detail: cfg.cloudDetail || 5, def: cfg.cloudDef != null ? cfg.cloudDef : 0.5, band: cfg.cloudBand != null ? cfg.cloudBand : 0.4, bandN: cfg.cloudBandN || 7, shear: cfg.cloudShear != null ? cfg.cloudShear : 0.4, swirl: cfg.cloudSwirl != null ? cfg.cloudSwirl : 0.3, storms: genStorms(cfg.cloudSeed != null ? cfg.cloudSeed : cfg.seed + 1, cfg.storms || 0, cfg.stormI || 0), stormI: cfg.stormI || 0 };
    const cloudMat = new THREE.MeshStandardMaterial({ map: genClouds(p, aniso), transparent: true, depthWrite: false, roughness: 1, opacity: cfg.cloudOpacity != null ? cfg.cloudOpacity : 0.85 });
    clouds = new THREE.Mesh(new THREE.SphereGeometry(R + 0.03, seg, seg), cloudMat); core.add(clouds);
    disposables.push(clouds.geometry, cloudMat, cloudMat.map);
  }

  // atmosphere (feathered fresnel rim, matches the generator post-slice-1)
  let atmo = null;
  if (cfg.atmoOn !== false) {
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

  const spin = cfg.spin != null ? cfg.spin : 1;
  const _sun = new THREE.Vector3(1, 0.3, 0.6).normalize();

  return {
    group: core,
    update(dt, sunDirWorld) {
      const sd = sunDirWorld || _sun;
      planet.rotation.y += spin * 0.12 * dt;
      if (night) { night.rotation.y = planet.rotation.y; const sh = night.material.userData.shader; if (sh) sh.uniforms.sunDir.value.copy(sd); }
      if (clouds) clouds.rotation.y += (spin * 0.12 + 0.05) * dt;
      if (atmo) atmo.material.uniforms.sunDir.value.copy(sd);
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
// coloured from the body's look (c1/c3). Returns { group, update(dt), dispose } like the planet.
export function buildStarModel(config, opts) {
  opts = opts || {};
  const cfg = config || {};
  const R = opts.radius || 1, seg = opts.segments || 40;
  const c1 = new THREE.Color(cfg.c1 || cfg.color || '#ffd98a');
  const c3 = new THREE.Color(cfg.c3 || '#fff2c8');
  const core = new THREE.Group(); const dis = [];

  const bodyMat = new THREE.MeshBasicMaterial({ color: c1.clone().lerp(new THREE.Color('#ffffff'), 0.55) });
  const body = new THREE.Mesh(new THREE.SphereGeometry(R * 0.62, seg, seg), bodyMat); core.add(body); dis.push(body.geometry, bodyMat);

  const glowMat = new THREE.ShaderMaterial({ transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: { c: { value: c1.clone() } },
    vertexShader: 'varying vec3 vN;varying vec3 vWP;void main(){vN=normalize(mat3(modelMatrix)*normal);vWP=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec3 vN;varying vec3 vWP;uniform vec3 c;void main(){vec3 V=normalize(cameraPosition-vWP);float f=pow(1.0-abs(dot(vN,V)),1.5);gl_FragColor=vec4(c,f);}' });
  const glow = new THREE.Mesh(new THREE.SphereGeometry(R * 0.95, seg, seg), glowMat); core.add(glow); dis.push(glow.geometry, glowMat);

  const corTex = coronaTex();
  const corMat = new THREE.SpriteMaterial({ map: corTex, color: c1.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 });
  const corSpr = new THREE.Sprite(corMat); corSpr.scale.set(R * 3.4, R * 3.4, 1); core.add(corSpr); dis.push(corMat, corTex);

  const rTex = raysTex(cfg.seed || 7);
  const rayMat = new THREE.SpriteMaterial({ map: rTex, color: c3.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 });
  const raySpr = new THREE.Sprite(rayMat); raySpr.scale.set(R * 3.0, R * 3.0, 1); core.add(raySpr); dis.push(rayMat, rTex);

  const spin = cfg.spin != null ? cfg.spin : 1; let t0 = 0;
  return {
    group: core,
    update(dt) {
      t0 += dt; body.rotation.y += 0.15 * spin * dt; rayMat.rotation += 0.12 * dt;
      const pulse = 1 + Math.sin(t0 * 1.6) * 0.06;
      corSpr.scale.set(R * 3.4 * pulse, R * 3.4 * pulse, 1);
      corMat.opacity = 0.72 + Math.sin(t0 * 1.6) * 0.15;
    },
    dispose() { dis.forEach(o => { try { o.dispose(); } catch (e) { /* noop */ } }); }
  };
}
