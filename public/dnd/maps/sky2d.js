/* ============================================================================
   sky2d.js — a 2D canvas backdrop that mirrors the 3D viewer's `bg3d` template,
   so the flat map resembles the 3D sky. Shared by Map Studio and the player
   Console (window.Sky2D). Pure function of (bg3d, seed): same seed → same look
   as the 3D scene's arrangement/palette. The static parts (stars, nebula,
   galaxy, black hole, asteroids) bake once to an offscreen; each frame blits it
   and draws only the animated glow-pulse + a few twinkling glimmer stars.
   ============================================================================ */
(function () {
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function rgb(hex) { hex = (hex || '#000000').replace('#', ''); if (hex.length === 3) hex = hex.split('').map(c => c + c).join(''); return [parseInt(hex.slice(0, 2), 16) || 0, parseInt(hex.slice(2, 4), 16) || 0, parseInt(hex.slice(4, 6), 16) || 0]; }
  function rgba(hex, a) { const c = rgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
  const DEF = { template: 'deepspace', seed: 1, parallax: true, layers: 3, density: 1, nebula: true, baseColor: '#010a13', glow: { on: false, colors: ['#3b2a6b', '#0a4a5a'], pulse: false, speed: 1 } };
  const NEB_PALS = [['#6a3aaa', '#0ac8b9', '#c94f9a', '#4a86c9'], ['#c0392b', '#e67e22', '#8e44ad'], ['#16a085', '#2980b9', '#8e44ad'], ['#c94f9a', '#5b2a86', '#3060ff'], ['#00b894', '#0984e3', '#6c5ce7']];

  const Sky2D = {
    canvas: null, ctx: null, cfg: null, _static: null, _glimmers: [], _raf: null, _t: 0, _w: 0, _h: 0,

    mount(canvas) {
      if (this.canvas === canvas) return;
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this._loop = this._loop.bind(this);
      if (!this._ro && 'ResizeObserver' in window) { this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(canvas.parentElement || canvas); }
      this.resize();
      if (!this._raf) this._raf = requestAnimationFrame(this._loop);
    },
    set(cfg) {
      this.cfg = Object.assign({}, DEF, cfg || {}, { glow: Object.assign({}, DEF.glow, (cfg && cfg.glow) || {}) });
      if (!this._w) this.resize(); else this._build();
    },
    resize() {
      if (!this.canvas) return;
      const p = this.canvas.parentElement, w = (p ? p.clientWidth : this.canvas.clientWidth) || 800, h = (p ? p.clientHeight : this.canvas.clientHeight) || 600;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.max(1, Math.round(w * dpr)); this.canvas.height = Math.max(1, Math.round(h * dpr));
      this.canvas.style.width = '100%'; this.canvas.style.height = '100%';
      this._w = this.canvas.width; this._h = this.canvas.height;
      if (this.cfg) this._build();
    },

    _starColor(r) { const t = r(); if (t > 0.93) return '#ffcc8c'; if (t > 0.8) return '#9ec7ff'; const w = 200 + (r() * 55 | 0); return `rgb(${(w * 0.93) | 0},${(w * 0.97) | 0},${w})`; },

    // Bake the static sky (everything except the pulse/twinkle) to an offscreen canvas.
    _build() {
      if (!this.ctx || !this.cfg || !this._w) return;
      const cfg = this.cfg, W = this._w, H = this._h, S = Math.min(W, H), r = rng(cfg.seed || 1);
      const off = this._static && this._static.width === W && this._static.height === H ? this._static : (this._static = document.createElement('canvas'));
      off.width = W; off.height = H; const c = off.getContext('2d');
      c.clearRect(0, 0, W, H);
      c.fillStyle = cfg.baseColor || '#010a13'; c.fillRect(0, 0, W, H);
      if (cfg.glow.on && !cfg.glow.pulse) this._paintGlow(c, W, H, cfg.glow, 1);
      const tpl = cfg.template || 'deepspace', density = cfg.density != null ? cfg.density : 1;
      this._glimmers = [];
      c.globalCompositeOperation = 'lighter';
      if (tpl === 'deepspace' || tpl === 'stars' || tpl === 'nebula' || tpl === 'milkyway') this._paintFiller(c, W, H, r, density);   // expansive tiny filler bed on star backgrounds
      if (tpl === 'solid' || tpl === 'glow') { /* nothing more */ }
      else if (tpl === 'spiral') this._paintSpiral(c, W, H, S, r, density);
      else if (tpl === 'blackhole') { this._paintStars(c, W, H, r, density * 0.5, 'deepspace'); this._paintBlackhole(c, W, H, S, r); }
      else if (tpl === 'asteroids') { this._paintStars(c, W, H, r, density * 0.4, 'deepspace'); this._paintAsteroids(c, W, H, r, density); }
      else if (tpl === 'milkyway') { this._paintStars(c, W, H, r, density * 0.7, 'deepspace'); this._paintMilkyway(c, W, H, r, density); }
      else if (tpl === 'wormhole') { this._paintStars(c, W, H, r, density * 0.4, 'deepspace'); this._paintWormhole(c, W, H, S, r); }
      else { this._paintStars(c, W, H, r, density, tpl); }
      if (tpl !== 'solid' && tpl !== 'glow' && (cfg.nebula || tpl === 'nebula')) this._paintNebula(c, W, H, r, tpl === 'nebula' ? 9 : 4);
      c.globalCompositeOperation = 'source-over';
    },

    _paintGlow(c, W, H, glow, alpha) {
      const cols = (glow.colors && glow.colors.length ? glow.colors : ['#3b2a6b', '#0a4a5a']);
      const R = Math.max(W, H) * 0.72, g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, R);
      cols.forEach((col, i) => { const stop = cols.length === 1 ? 0 : (i / (cols.length - 1)) * 0.8; g.addColorStop(stop, rgba(col, (i === 0 ? 0.5 : 0.3) * alpha)); });
      g.addColorStop(1, 'rgba(0,0,0,0)');
      const op = c.globalCompositeOperation; c.globalCompositeOperation = 'lighter';
      c.fillStyle = g; c.fillRect(0, 0, W, H); c.globalCompositeOperation = op;
    },

    _paintFiller(c, W, H, r, density) {   // dense bed of tiny dim generic stars, always filling the view
      const n = Math.min(5000, Math.round(W * H / 1500 * density));
      for (let i = 0; i < n; i++) {
        const w = 140 + (r() * 90 | 0);
        c.globalAlpha = 0.25 + r() * 0.4; c.fillStyle = `rgb(${(w * 0.9) | 0},${(w * 0.95) | 0},${w})`;
        c.beginPath(); c.arc(r() * W, r() * H, 0.4 + Math.pow(r(), 3) * 1.0, 0, 7); c.fill();
      }
      c.globalAlpha = 1;
    },
    _paintStars(c, W, H, r, density, tpl) {
      const dense = tpl === 'stars' ? 1.9 : tpl === 'nebula' ? 0.6 : 1.0;
      const n = Math.min(4200, Math.round(W * H / 2600 * density * dense));
      for (let i = 0; i < n; i++) {
        const x = r() * W, y = r() * H, glimmer = r() < 0.03;
        const sz = glimmer ? (1.6 + r() * 2.2) : (0.35 + Math.pow(r(), 3) * 1.7);
        const col = this._starColor(r);
        c.globalAlpha = glimmer ? 0.9 : (0.4 + r() * 0.5);
        c.fillStyle = col; c.beginPath(); c.arc(x, y, sz, 0, 7); c.fill();
        if (glimmer && this._glimmers.length < 40) this._glimmers.push({ x, y, sz: sz * 1.4, col, phase: r() * 6.28 });
      }
      c.globalAlpha = 1;
    },

    _paintNebula(c, W, H, r, count) {
      const pal = NEB_PALS[(r() * NEB_PALS.length) | 0];
      for (let i = 0; i < count; i++) {
        const cx = r() * W, cy = r() * H, rad = Math.max(W, H) * (0.14 + r() * 0.22), col = pal[i % pal.length];
        const g = c.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(0, rgba(col, 0.16 + r() * 0.12)); g.addColorStop(0.6, rgba(col, 0.05)); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.beginPath(); c.arc(cx, cy, rad, 0, 7); c.fill();
      }
    },

    _paintSpiral(c, W, H, S, r, density) {
      const arms = 2 + ((r() * 3) | 0), tight = 2 + r() * 1.6, RMAX = S * 0.5, cx = W / 2, cy = H / 2;
      const coreCols = ['#ffd9a0', '#ffc0e6', '#a8d4ff', '#ffe6b0', '#d0b0ff'], armCols = ['#9eb4ff', '#ff9ee6', '#9effe8', '#ffdb9e'];
      const core = coreCols[(r() * coreCols.length) | 0], arm = rgb(armCols[(r() * armCols.length) | 0]), cc = rgb(core);
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, RMAX * 0.6);
      g.addColorStop(0, rgba(core, 0.8)); g.addColorStop(0.4, rgba(core, 0.25)); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(cx, cy, RMAX * 0.6, 0, 7); c.fill();
      const n = Math.min(5200, Math.round(4600 * density));
      for (let i = 0; i < n; i++) {
        const a2 = i % arms, rr = Math.pow(r(), 0.6), rad = rr * RMAX, ang = a2 * (6.2831 / arms) + rr * tight * 6.2831 + (r() - 0.5) * (0.6 / (rr + 0.12));
        const sc = (r() - 0.5) * RMAX * 0.05 * (0.4 + rr);
        const x = cx + Math.cos(ang) * rad + sc, y = cy + Math.sin(ang) * rad + (r() - 0.5) * RMAX * 0.05 * (0.4 + rr);
        const cw = 1 - rr, cr = cc[0] * cw + arm[0] * (1 - cw), cg = cc[1] * cw + arm[1] * (1 - cw), cb = cc[2] * cw + arm[2] * (1 - cw);
        c.globalAlpha = 0.4 + r() * 0.5; c.fillStyle = `rgb(${cr | 0},${cg | 0},${cb | 0})`;
        c.beginPath(); c.arc(x, y, r() < 0.03 ? 2 + r() * 2 : 0.4 + Math.pow(r(), 3) * 1.6, 0, 7); c.fill();
      }
      c.globalAlpha = 1;
    },

    _paintBlackhole(c, W, H, S, r) {
      const cx = W / 2, cy = H / 2, R = S * 0.16;
      const cols = [['#ffb060', '#ff5030'], ['#7fd0ff', '#3060ff'], ['#ff90e0', '#a040ff'], ['#ffe090', '#ff8020']][(r() * 4) | 0];
      const halo = c.createRadialGradient(cx, cy, R * 0.7, cx, cy, R * 3.4);
      halo.addColorStop(0, rgba(cols[0], 0.55)); halo.addColorStop(0.5, rgba(cols[1], 0.22)); halo.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = halo; c.beginPath(); c.arc(cx, cy, R * 3.4, 0, 7); c.fill();
      c.save(); c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#000'; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.fill();          // event horizon
      c.globalCompositeOperation = 'lighter'; c.strokeStyle = rgba(cols[0], 0.95); c.lineWidth = Math.max(2, R * 0.09);
      c.beginPath(); c.ellipse(cx, cy, R * 1.32, R * 0.5, 0, 0, 7); c.stroke();        // accretion ring (tilted)
      c.restore();
    },

    _paintAsteroids(c, W, H, r, density) {
      const n = Math.min(1600, Math.round(W * H / 5200 * density));
      for (let i = 0; i < n; i++) {
        const x = r() * W, y = r() * H, g = 70 + (r() * 90 | 0), br = r() < 0.3 ? 16 : 0, sz = 0.6 + Math.pow(r(), 2) * 2.6;
        c.globalAlpha = 0.35 + r() * 0.5; c.fillStyle = `rgb(${g + br},${(g + br * 0.6) | 0},${g})`;
        c.beginPath(); c.arc(x, y, sz, 0, 7); c.fill();
      }
      c.globalAlpha = 1;
    },

    _paintMilkyway(c, W, H, r, density) {   // a bright luminous band of dense stars across the sky
      const ang = (r() - 0.5) * 1.4 + 0.5, cx = W / 2, cy = H / 2, len = Math.hypot(W, H);
      const pal = [['#eae0ff', '#8a6ad0'], ['#fff0e0', '#d0a06a'], ['#e0f0ff', '#6a9ad0'], ['#ffe8f2', '#c06a9a']][(r() * 4) | 0];
      c.save(); c.translate(cx, cy); c.rotate(ang);
      const band = c.createLinearGradient(0, -len * 0.16, 0, len * 0.16);   // soft glow across the band
      band.addColorStop(0, 'rgba(0,0,0,0)'); band.addColorStop(0.5, rgba(pal[0], 0.16)); band.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = band; c.fillRect(-len, -len * 0.16, len * 2, len * 0.32);
      const n = Math.min(4200, Math.round(W * H / 900 * density));
      for (let i = 0; i < n; i++) {
        const u = (r() - 0.5) * len * 1.4, v = (r() - 0.5) * len * 0.16 * (0.4 + Math.abs(r() - 0.5));
        const glim = r() < 0.03; c.globalAlpha = glim ? 0.9 : 0.35 + r() * 0.5;
        const col = r() < 0.5 ? pal[0] : pal[1]; c.fillStyle = col;
        c.beginPath(); c.arc(u, v, glim ? 1.4 + r() * 1.4 : 0.4 + Math.pow(r(), 3) * 1.3, 0, 7); c.fill();
      }
      c.globalAlpha = 1; c.restore();
    },

    _paintWormhole(c, W, H, S, r) {   // glowing concentric rings receding to a bright core
      const cx = W / 2, cy = H / 2;
      const cols = [['#7fd0ff', '#3060ff', '#a040ff'], ['#ff9ee6', '#a040ff', '#3060ff'], ['#7fffe0', '#00b894', '#0984e3'], ['#ffd090', '#ff6a30', '#a0306a']][(r() * 4) | 0];
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, S * 0.14);
      g.addColorStop(0, cols[0]); g.addColorStop(0.5, rgba(cols[0], 0.4)); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(cx, cy, S * 0.14, 0, 7); c.fill();
      for (let i = 0; i < 8; i++) {
        const t = i / 8, R = S * (0.08 + t * 0.5);
        c.strokeStyle = rgba(cols[i % cols.length], 0.5 * (1 - t * 0.55)); c.lineWidth = Math.max(1.5, S * 0.012 * (1 + t));
        c.beginPath(); c.ellipse(cx, cy, R, R * 0.42, 0, 0, 7); c.stroke();
      }
    },

    _loop() {
      this._raf = requestAnimationFrame(this._loop);
      this._t += 0.016; this._draw();
    },
    _draw() {
      const ctx = this.ctx, cfg = this.cfg; if (!ctx || !cfg || !this._static) return;
      const W = this._w, H = this._h;
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.drawImage(this._static, 0, 0);
      if (cfg.glow.on && cfg.glow.pulse) {
        const a = 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(this._t * 1.3 * (cfg.glow.speed || 1)));
        this._paintGlow(ctx, W, H, cfg.glow, a);
      }
      if (this._glimmers.length) {   // a few twinkling stars over the baked field
        ctx.globalCompositeOperation = 'lighter';
        for (const g of this._glimmers) {
          const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this._t * 2 + g.phase));
          ctx.globalAlpha = tw; ctx.fillStyle = g.col;
          ctx.beginPath(); ctx.arc(g.x, g.y, g.sz, 0, 7); ctx.fill();
          ctx.globalAlpha = tw * 0.5; ctx.fillRect(g.x - g.sz * 3, g.y - 0.4, g.sz * 6, 0.8); ctx.fillRect(g.x - 0.4, g.y - g.sz * 3, 0.8, g.sz * 6);
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
    },
    // Stop animating (e.g. when the 3D viewer takes over and hides the 2D map).
    setActive(on) { if (on && !this._raf) { this._raf = requestAnimationFrame(this._loop); } else if (!on && this._raf) { cancelAnimationFrame(this._raf); this._raf = null; } }
  };
  window.Sky2D = Sky2D;
})();
