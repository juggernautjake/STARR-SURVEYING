/* ============================================================================
   map3d.js — the real-time 3D map viewer (Phase U, slice 4 scaffold).
   An ES module (loaded with the vendored-Three importmap) that renders the map
   in a single WebGL scene which *behaves like the 2D viewer*: an orthographic,
   top-down-by-default camera with constrained orbit, pan and zoom. It reads the
   live map from the global `mapData()` and wires its own 2D⇄3D toggle button.

   This slice proves the pipeline: bodies render as flat discs on the z=0 plane
   at their 2D positions, with a starfield backdrop. Slice 5 swaps planets for
   real 3D meshes (from their saved config); slice 6 adds TransformControls;
   slice 7 adds image/text/HTML objects. Everything is view-only for now.

   Coordinate mapping: 2D world (x, y) with y pointing DOWN → 3D (x, -y, 0) so
   the scene reads identically to the 2D map but gains real depth/rotation.
   ============================================================================ */
let THREE = null, OrbitControls = null, TransformControls = null, CSS3DRenderer = null, CSS3DObject = null, buildPlanetModel = null, buildStarModel = null, buildStationModel = null, buildAsteroidModel = null, planetDominantColor = null, planetImpostorCanvas = null;

async function loadThree() {
  if (THREE) return;
  THREE = await import('three');
  ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
  ({ TransformControls } = await import('three/addons/controls/TransformControls.js'));
  ({ CSS3DRenderer, CSS3DObject } = await import('three/addons/renderers/CSS3DRenderer.js'));
  ({ buildPlanetModel, buildStarModel, buildStationModel, buildAsteroidModel, planetDominantColor, planetImpostorCanvas } = await import('/dnd/maps/planet3d-model.js'));
}

const NAVY = 0x010a13;
const MAX_LIVE_PLANETS = 16;   // LOD guard: beyond this, extra 3D worlds fall back to flat discs

// Programmable deep-space background. Saved on the map as `bg3d`, so the DM's choice publishes to
// players. `template` selects the overall look; `seed` reshuffles every generated arrangement.
const BG_DEFAULT = {
  template: 'deepspace',   // deepspace | stars | spiral | nebula | blackhole | asteroids | solid | glow
  seed: 1,
  parallax: true, layers: 3, density: 1,
  nebula: true,
  baseColor: '#010a13',
  glow: { on: false, colors: ['#3b2a6b', '#0a4a5a'], pulse: false, speed: 1 }
};

const Map3D = {
  _ready: false, _shown: false, _raf: null,
  container: null, renderer: null, scene: null, camera: null, controls: null,
  bodyGroup: null, _map: null, _ro: null, _planets: [],

  // Build the renderer/scene once. `container` is the #gl3d div inside #canvas.
  async mount(container) {
    if (this._ready) return true;
    try { await loadThree(); } catch (e) { console.error('[map3d] Three.js failed to load', e); return false; }
    this.container = container;
    this._editable = typeof window.map3dApply === 'function';   // DM Studio edits; Console is read-only
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });   // alpha so hybrid mode can render transparent
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    renderer.setClearColor(NAVY, 1);
    this._mode = this._mode || 'full';   // 'full' = own sky + all objects; 'overlay' = transparent, only 3D bodies (hybrid)
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
    container.appendChild(renderer.domElement);

    const hint = document.createElement('div');
    hint.textContent = this._editable
      ? 'Click a body to select · G move · R rotate · S scale · Esc deselect · drag pan · wheel zoom · right-drag tilt'
      : 'Drag to pan · wheel to zoom · right-drag to tilt';
    hint.style.cssText = 'position:absolute;left:10px;bottom:8px;z-index:2;color:#a09b8c;font:11px/1.4 system-ui,sans-serif;background:rgba(6,4,15,.62);padding:4px 9px;border-radius:6px;pointer-events:none;max-width:70%';
    container.appendChild(hint);

    const scene = new THREE.Scene();
    // Orthographic so the map keeps its flat, 2D-like feel; user zoom via camera.zoom.
    const H = 500;
    const cam = new THREE.OrthographicCamera(-H * (w / h), H * (w / h), H, -H, -50000, 50000);
    cam.position.set(0, 0, 2000);
    cam.up.set(0, 1, 0);

    const controls = new OrbitControls(cam, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.12;
    controls.zoomToCursor = true;               // wheel zoom homes in on the cursor
    controls.screenSpacePanning = true;         // pan like a 2D map
    controls.minPolarAngle = 0;                  // straight top-down …
    controls.maxPolarAngle = Math.PI * 0.48;     // … up to an almost-flat tilt
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xfff4e0, 1.4); key.position.set(1, 1, 2); scene.add(key);
    this.scene = scene; this.renderer = renderer;
    this._bg = this._bg || Object.assign({}, BG_DEFAULT, { glow: Object.assign({}, BG_DEFAULT.glow) });
    this._buildBackground(); this._buildShooters();   // programmable sky + colourful meteors
    const sectorGroup = new THREE.Group(); scene.add(sectorGroup); this._sectorGroup = sectorGroup;   // sector/system regions (behind bodies)
    const bodyGroup = new THREE.Group(); scene.add(bodyGroup);

    // Move/rotate/scale gizmo — only when an editor bridge exists (the DM Studio). The player
    // Console has no `map3dApply`, so it stays read-only (pan/zoom/orbit, no editing gizmo).
    let tc = null;
    if (this._editable) {
      tc = new TransformControls(cam, renderer.domElement);
      tc.setSize(0.9);
      tc.addEventListener('dragging-changed', e => { controls.enabled = !e.value; });
      tc.addEventListener('mouseDown', () => { if (window.map3dBeginEdit) window.map3dBeginEdit(); });
      tc.addEventListener('objectChange', () => this._writeBack());
      scene.add(tc);
    }

    // CSS3D overlay — renders real DOM (rich text now; the future `html` kind next) in 3D space,
    // composited above the WebGL canvas and sharing the same camera.
    const css = new CSS3DRenderer();
    css.setSize(w, h);
    css.domElement.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2';
    container.appendChild(css.domElement);
    const cssScene = new THREE.Scene();

    this.renderer = renderer; this.cssRenderer = css; this.scene = scene; this.cssScene = cssScene;
    this.camera = cam; this.controls = controls; this.bodyGroup = bodyGroup;
    this.tcontrols = tc; this._ray = new THREE.Raycaster(); this._selected = null;
    this._ready = true;

    // click-to-select (vs. drag-to-pan) + G/R/S to switch gizmo mode
    const el = renderer.domElement;
    el.addEventListener('pointerdown', e => { this._downXY = [e.clientX, e.clientY]; if (e.button === 2) this._rDownXY = [e.clientX, e.clientY]; this._hideCtxMenu(); });
    el.addEventListener('pointerup', e => this._onPointerUp(e));
    el.addEventListener('contextmenu', e => this._onContextMenu(e));
    this._onKey = e => {
      if (!this._shown || !this.tcontrols) return;
      const k = e.key.toLowerCase();
      if (k === 'g') this.tcontrols.setMode('translate'); else if (k === 'r') this.tcontrols.setMode('rotate'); else if (k === 's') this.tcontrols.setMode('scale');
      else if (k === 'escape') this._deselect();
    };
    window.addEventListener('keydown', this._onKey);

    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
    return true;
  },

  _onPointerUp(e) {
    if (!this._downXY) return;
    const moved = Math.hypot(e.clientX - this._downXY[0], e.clientY - this._downXY[1]);
    this._downXY = null;
    if (moved > 4 || (this.tcontrols && this.tcontrols.dragging)) return;   // that was a pan / gizmo drag, not a pick
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this._ray.setFromCamera(ndc, this.camera);
    const hits = this._ray.intersectObjects(this.bodyGroup.children, true);
    if (hits.length) {
      let poi = hits[0].object; while (poi && poi.userData.poiId === undefined && poi.parent) poi = poi.parent;
      if (poi && poi.userData.poiId !== undefined) { if (window.map3dSelectPoi) window.map3dSelectPoi(poi.userData.instId, poi.userData.poiId); return; }
      let o = hits[0].object; while (o && o.userData.id === undefined && o.parent) o = o.parent;
      if (o && o.userData.id !== undefined) return this._select(o);
    }
    this._deselect();
  },
  _select(holder) { this._selected = holder; if (this.tcontrols) this.tcontrols.attach(holder); if (window.map3dSelect) window.map3dSelect(holder.userData.id); },
  _deselect() { this._selected = null; if (this.tcontrols) this.tcontrols.detach(); if (window.map3dSelect) window.map3dSelect(null); },

  // Raycast a client point to the body holder under it (or null).
  _pickHolder(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this._ray.setFromCamera(ndc, this.camera);
    const hits = this._ray.intersectObjects(this.bodyGroup.children, true);
    if (hits.length) { let o = hits[0].object; while (o && o.userData.id === undefined && o.parent) o = o.parent; if (o && o.userData.id !== undefined) return o; }
    return null;
  },
  // Right-click a body → a small "Focus" menu (a right-DRAG is an orbit, so only a click shows it).
  _onContextMenu(e) {
    e.preventDefault();
    const moved = this._rDownXY ? Math.hypot(e.clientX - this._rDownXY[0], e.clientY - this._rDownXY[1]) : 0;
    this._rDownXY = null;
    if (moved > 5) return;                               // that was a rotate-drag, not a menu click
    const holder = this._pickHolder(e.clientX, e.clientY);
    if (!holder) { this._hideCtxMenu(); return; }
    this._showCtxMenu(e.clientX, e.clientY, holder);
  },
  _ensureCtxMenu() {
    if (this._ctxMenu) return this._ctxMenu;
    const m = document.createElement('div');
    m.style.cssText = 'position:absolute;z-index:6;display:none;min-width:130px;background:rgba(8,14,26,.96);border:1px solid #29406a;border-radius:7px;padding:4px;font:12px/1.4 system-ui,sans-serif;color:#cfe0ff;box-shadow:0 6px 20px rgba(0,0,0,.5)';
    this.container.appendChild(m); this._ctxMenu = m;
    document.addEventListener('pointerdown', ev => { if (this._ctxMenu && !this._ctxMenu.contains(ev.target)) this._hideCtxMenu(); });
    return m;
  },
  _showCtxMenu(clientX, clientY, holder) {
    const m = this._ensureCtxMenu();
    const rect = this.container.getBoundingClientRect();
    const item = (label, fn) => { const b = document.createElement('div'); b.textContent = label; b.style.cssText = 'padding:6px 10px;border-radius:5px;cursor:pointer'; b.onmouseenter = () => b.style.background = 'rgba(60,110,200,.28)'; b.onmouseleave = () => b.style.background = ''; b.onclick = () => { this._hideCtxMenu(); fn(); }; return b; };
    m.innerHTML = '';
    m.appendChild(item('⊙ Focus', () => this._focusBody(holder)));
    m.appendChild(item('✕ Deselect', () => this._deselect()));
    m.style.left = (clientX - rect.left) + 'px'; m.style.top = (clientY - rect.top) + 'px'; m.style.display = 'block';
  },
  _hideCtxMenu() { if (this._ctxMenu) this._ctxMenu.style.display = 'none'; },

  // Fly the camera to centre + frame a body, and open its info window (selection drives the inspector /
  // the Console's readout). The easing runs in the render loop via `_focusGoal`.
  _focusBody(holder) {
    if (!holder) return;
    const r = Math.max(4, holder.scale.x || 40);
    this._focusGoal = { x: holder.position.x, y: holder.position.y, zoom: Math.max(0.05, Math.min(40, 220 / r)) };
    this._select(holder);   // opens the info window (inspector / CRT) + attaches the gizmo
  },

  // Gizmo edit → 2D schema. Holder transform: position=body center, scale.x*2=size, rotation=t3d.
  _writeBack() {
    const h = this._selected; if (!h || !this.tcontrols) return;
    const size = Math.max(8, Math.round(2 * h.scale.x));
    if (h.scale.y !== h.scale.x || h.scale.z !== h.scale.x) h.scale.setScalar(h.scale.x);   // keep bodies uniform
    const patch = {
      x: Math.round(h.position.x),        // holder position IS the body centre = the 2D (x,y)
      y: Math.round(-h.position.y),
      size,
      t3d: { rx: +h.rotation.x.toFixed(4), ry: +h.rotation.y.toFixed(4), rz: +h.rotation.z.toFixed(4) }
    };
    if (window.map3dApply) window.map3dApply(h.userData.id, patch);
    this._applyLOD();   // scaling a body up/down promotes/demotes its 3D representation live
  },

  /* ---- programmable deep-space background ------------------------------------------------ */

  // mulberry32 — a tiny, fast, well-dispersed PRNG so a seed reshuffles the whole sky.
  _rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  },
  _pick(rng, arr) { return arr[(rng() * arr.length) | 0]; },
  _hexA(hex, a) { const c = new THREE.Color(hex); return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`; },

  // Set/replace the background config and rebuild the sky.
  setBackground(cfg) {
    this._bg = Object.assign({}, BG_DEFAULT, cfg || {}, { glow: Object.assign({}, BG_DEFAULT.glow, (cfg && cfg.glow) || {}) });
    if (this._ready && this.scene) this._buildBackground();
  },

  // One shared point material for every star layer: per-point size (attribute) so most stars are
  // tiny and a few are large; a per-point phase drives an independent twinkle; flagged "glimmer"
  // points get soft diffraction spikes. Additive over the dark clear-colour reads as real starlight.
  _starMaterial() {
    if (this._starMat) return this._starMat;
    this._starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPix: { value: Math.min(window.devicePixelRatio || 1, 2) } },
      vertexShader: `
        attribute vec3 aColor; attribute float aSize; attribute float aPhase; attribute float aGlow;
        varying vec3 vCol; varying float vTw; varying float vGlow;
        uniform float uTime; uniform float uPix;
        void main(){
          vCol = aColor;
          float tw = 0.55 + 0.45 * sin(uTime*(1.1 + aPhase*0.9) + aPhase*6.2831);
          vTw = mix(0.82, tw, aGlow>0.5 ? 1.0 : 0.45);   // glimmer stars twinkle harder
          vGlow = aGlow;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aSize * uPix;
        }`,
      fragmentShader: `
        precision mediump float;
        varying vec3 vCol; varying float vTw; varying float vGlow;
        void main(){
          vec2 uv = gl_PointCoord - 0.5;
          float core = smoothstep(0.5, 0.0, length(uv));
          float a = core;
          if(vGlow > 0.5){
            float sx = smoothstep(0.5,0.0,abs(uv.x)) * smoothstep(0.11,0.0,abs(uv.y));
            float sy = smoothstep(0.5,0.0,abs(uv.y)) * smoothstep(0.11,0.0,abs(uv.x));
            a = max(a, (sx+sy)*0.9);
          }
          if(a <= 0.003) discard;
          gl_FragColor = vec4(vCol * vTw, a);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
    });
    return this._starMat;
  },
  // Default star tint: mostly cool white, an occasional warm or blue sun.
  _starColorFn() {
    return (rnd) => { const t = rnd(); if (t > 0.93) return [1, 0.8, 0.55]; if (t > 0.8) return [0.62, 0.78, 1]; const w = 0.78 + rnd() * 0.22; return [w * 0.93, w * 0.97, w]; };
  },
  // Build one parallax star layer from a spec. posFn/colorFn take the shared rng.
  _addStarLayer(sp) {
    const n = Math.max(1, sp.count | 0), rnd = sp.rng, colFn = sp.colorFn || this._starColorFn();
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), siz = new Float32Array(n), pha = new Float32Array(n), glo = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = sp.posFn(rnd, i);
      pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = (sp.z || -2000) + (rnd() - 0.5) * (sp.jitterZ || 300);
      const c = colFn(rnd, i); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
      const glow = rnd() < (sp.glowFrac || 0.03) ? 1 : 0; glo[i] = glow;
      // power curve → most stars near the small end, a rare few large; glimmers larger still
      siz[i] = glow ? (sp.sizeMax * 1.5 + rnd() * sp.sizeMax * 1.4) : (sp.sizeMin + Math.pow(rnd(), 3) * (sp.sizeMax - sp.sizeMin));
      pha[i] = rnd();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(pha, 1));
    g.setAttribute('aGlow', new THREE.BufferAttribute(glo, 1));
    const pts = new THREE.Points(g, this._starMaterial());
    pts.userData = { k: sp.k, rot: sp.rot || 0 }; pts.renderOrder = -10; pts.frustumCulled = false;
    this.scene.add(pts); this._bgObjs.push(pts); this._starPts.push(pts);
    return pts;
  },

  // A soft radial sprite (glow / galaxy core / accretion halo) built from a colour list.
  _radialSprite(cols, scale, z, opacity, k, ry) {
    const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    const list = cols.length ? cols : ['#3b2a6b'];
    list.forEach((c, i) => { const stop = list.length === 1 ? 0 : (i / (list.length - 1)) * 0.8; g.addColorStop(stop, this._hexA(c, i === 0 ? 0.6 : 0.34)); });
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    const m = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    const sp = new THREE.Sprite(m); sp.scale.set(scale, scale * (ry || 1), 1); sp.position.set(0, 0, z);
    sp.renderOrder = -9; sp.userData = { k: k != null ? k : 0.85 };
    this.scene.add(sp); this._bgObjs.push(sp);
    return sp;
  },

  _buildBackground() {
    if (!this.scene) return;
    this._disposeBackground();
    this._bgObjs = []; this._starPts = []; this._nebula = []; this._bgSpin = []; this._glowSprite = null; this._bgT = 0;
    const cfg = this._bg || (this._bg = Object.assign({}, BG_DEFAULT));
    if (this._mode === 'overlay') { if (this.renderer) this.renderer.setClearColor(new THREE.Color(0x000000), 0); return; }   // hybrid: the 2D map draws the sky
    if (this.renderer) this.renderer.setClearColor(new THREE.Color(cfg.baseColor || '#010a13'), 1);
    const rng = this._rng(cfg.seed || 1);
    const density = cfg.density != null ? cfg.density : 1;
    const layers = cfg.parallax ? Math.max(1, Math.min(6, cfg.layers || 3)) : 1;
    const tpl = cfg.template || 'deepspace';

    if ((cfg.glow && cfg.glow.on) || tpl === 'glow') this._buildGlow(cfg);

    // A deep, expansive filler bed of tiny generic stars behind the parallax layers on the
    // star-field backgrounds, so those look vast — big enough you can't pan/zoom to its edge.
    if (tpl === 'deepspace' || tpl === 'stars' || tpl === 'nebula' || tpl === 'milkyway') this._addFillerStars(cfg, rng, density);

    if (tpl === 'solid' || tpl === 'glow') { /* colour / glow only — no stars */ }
    else if (tpl === 'spiral') this._buildSpiral(cfg, rng, density);
    else if (tpl === 'blackhole') this._buildBlackhole(cfg, rng, density, layers);
    else if (tpl === 'asteroids') this._buildAsteroids(cfg, rng, density, layers);
    else if (tpl === 'milkyway') this._buildMilkyway(cfg, rng, density, layers);
    else if (tpl === 'wormhole') this._buildWormhole(cfg, rng, density);
    else this._buildStarfield(cfg, rng, density, layers, tpl);   // deepspace | stars | nebula

    const showNeb = tpl !== 'solid' && tpl !== 'glow' && (cfg.nebula || tpl === 'nebula');
    if (showNeb) this._buildNebulaClouds(cfg, rng, tpl === 'nebula' ? 8 : 4, tpl === 'nebula');
  },

  // The expansive filler bed: many tiny, dim, generic stars pinned to the camera (k=1) so they always
  // fill the viewport — a never-ending backdrop behind the parallax layers.
  _addFillerStars(cfg, rng, density) {
    this._addStarLayer({
      rng, count: Math.min(6000, Math.round(3400 * (density != null ? density : 1))), z: -3600, k: 1.0, jitterZ: 160,
      sizeMin: 0.6, sizeMax: 1.25, glowFrac: 0.004,
      colorFn: (r) => { const w = 0.55 + r() * 0.32; return [w * 0.9, w * 0.95, w]; },
      posFn: (r) => [(r() - 0.5) * 26000, (r() - 0.5) * 26000]
    });
  },

  // Plain multi-depth starfield (deepspace / stars / the star bed under a nebula).
  _buildStarfield(cfg, rng, density, layers, tpl) {
    const dense = tpl === 'stars' ? 1.8 : tpl === 'nebula' ? 0.55 : 1.0;
    for (let li = 0; li < layers; li++) {
      const f = layers === 1 ? 0.5 : li / (layers - 1);     // 0 = far, 1 = near
      const k = 0.8 + (0.22 - 0.8) * f;                     // far layers follow more → look distant
      this._addStarLayer({
        rng, count: Math.round((tpl === 'stars' ? 950 : 620) * (1 - f * 0.5) * density * dense),
        z: -3200 + f * 2200, k, jitterZ: 300,
        sizeMin: 0.9 + f * 0.4, sizeMax: 2.0 + f * 2.4, glowFrac: 0.02 + f * 0.03,
        posFn: (r) => [(r() - 0.5) * 9200, (r() - 0.5) * 9200]
      });
    }
  },

  // A spiral galaxy: stars swept into logarithmic arms around a bright coloured core, slowly turning.
  _buildSpiral(cfg, rng, density) {
    const arms = 2 + ((rng() * 3) | 0);                    // 2–4 arms
    const spin = (rng() < 0.5 ? 1 : -1) * (0.012 + rng() * 0.02);
    const armCol = this._pick(rng, [[0.6, 0.72, 1], [1, 0.7, 0.9], [0.7, 1, 0.92], [1, 0.86, 0.6], [0.8, 0.7, 1]]);
    const coreCol = this._pick(rng, ['#ffd9a0', '#ffc0e6', '#a8d4ff', '#ffe6b0', '#d0b0ff']);
    const RMAX = 5200, tight = 2.0 + rng() * 1.6;
    const cc = new THREE.Color(coreCol);
    const pts = this._addStarLayer({
      rng, count: Math.round(4600 * density), z: -2650, k: 0.62, jitterZ: 220, rot: spin,
      sizeMin: 0.9, sizeMax: 3.0, glowFrac: 0.03,
      colorFn: (r) => { const rr = Math.pow(r(), 0.6), cw = 1 - rr, b = 0.5 + r() * 0.6; return [(cc.r * cw + armCol[0] * (1 - cw)) * b, (cc.g * cw + armCol[1] * (1 - cw)) * b, (cc.b * cw + armCol[2] * (1 - cw)) * b]; },
      posFn: (r, i) => { const arm = i % arms, rr = Math.pow(r(), 0.6), rad = rr * RMAX, ang = arm * (6.2831 / arms) + rr * tight * 6.2831 + (r() - 0.5) * (0.6 / (rr + 0.12)), sc = (r() - 0.5) * RMAX * 0.05 * (0.4 + rr); return [Math.cos(ang) * rad + sc, Math.sin(ang) * rad + (r() - 0.5) * RMAX * 0.05 * (0.4 + rr)]; }
    });
    pts.userData.rot = spin;
    const core = this._radialSprite([coreCol], 3400, -2680, 0.85, 0.62);
    this._bgSpin.push({ obj: core, rot: 0, follow: true, k: 0.62 });
  },

  // A black hole: a dark disc ringed by a bright accretion glow, over a sparse star bed.
  _buildBlackhole(cfg, rng, density, layers) {
    this._buildStarfield(cfg, rng, density * 0.5, Math.min(2, layers), 'deepspace');
    const ringCol = this._pick(rng, [['#ffb060', '#ff5030'], ['#7fd0ff', '#3060ff'], ['#ff90e0', '#a040ff'], ['#ffe090', '#ff8020']]);
    const halo = this._radialSprite(ringCol, 2600, -2600, 0.95, 0.7);
    this._bgSpin.push({ obj: halo, rot: 0, follow: true, k: 0.7 });
    // bright thin accretion ring (additive), tilted for a lensed feel
    const ring = new THREE.Mesh(new THREE.RingGeometry(360, 470, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(ringCol[0]), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
    ring.position.set(0, 0, -2590); ring.rotation.x = 1.05; ring.renderOrder = -7;
    this.scene.add(ring); this._bgObjs.push(ring); this._bgSpin.push({ obj: ring, rot: 0.25, follow: true, k: 0.7 });
    // the event horizon — an opaque black disc that occludes the glow behind its centre
    const disc = new THREE.Mesh(new THREE.CircleGeometry(330, 64), new THREE.MeshBasicMaterial({ color: 0x000000, depthWrite: false, depthTest: false }));
    disc.position.set(0, 0, -2585); disc.renderOrder = -6;
    this.scene.add(disc); this._bgObjs.push(disc); this._bgSpin.push({ obj: disc, rot: 0, follow: true, k: 0.7 });
  },

  // An asteroid field: layered belts of small rocky grey specks drifting slowly, over faint stars.
  _buildAsteroids(cfg, rng, density, layers) {
    this._buildStarfield(cfg, rng, density * 0.4, Math.min(2, layers), 'deepspace');
    const rockCol = (r) => { const g = 0.28 + r() * 0.34, br = r() < 0.3 ? 0.06 : 0; return [g + br, g + br * 0.6, g]; };
    const belts = cfg.parallax ? Math.max(2, Math.min(4, cfg.layers || 3)) : 1;
    for (let li = 0; li < belts; li++) {
      const f = belts === 1 ? 0.5 : li / (belts - 1);
      const pts = this._addStarLayer({
        rng, count: Math.round(520 * (1 - f * 0.4) * density), z: -1400 + f * 900, k: 0.62 + (0.2 - 0.62) * f, jitterZ: 260,
        sizeMin: 1.4 + f * 0.6, sizeMax: 3.4 + f * 3.2, glowFrac: 0, colorFn: rockCol,
        posFn: (r) => [(r() - 0.5) * 8600, (r() - 0.5) * 8600]
      });
      pts.userData.drift = [(rng() - 0.5) * 40, (rng() - 0.5) * 40];
    }
  },

  // The Milky Way: a bright luminous band of dense stars across the sky, tilted at a random angle.
  _buildMilkyway(cfg, rng, density, layers) {
    this._buildStarfield(cfg, rng, density * 0.7, Math.min(2, layers), 'deepspace');
    const ang = (rng() - 0.5) * 1.4 + 0.5;
    const bandCol = this._pick(rng, [['#eae0ff', '#8a6ad0'], ['#fff0e0', '#d0a06a'], ['#e0f0ff', '#6a9ad0'], ['#ffe8f2', '#c06a9a']]);
    const band = this._radialSprite(bandCol, 10000, -2800, 0.42, 0.88, 0.17);   // elongated glow
    band.material.rotation = ang;
    const cs = Math.cos(ang), sn = Math.sin(ang);
    this._addStarLayer({   // dense stars concentrated along the band
      rng, count: Math.round(2800 * density), z: -2700, k: 0.72, jitterZ: 200,
      sizeMin: 0.8, sizeMax: 2.6, glowFrac: 0.03, colorFn: this._starColorFn(),
      posFn: (r) => { const u = (r() - 0.5) * 12000, v = (r() - 0.5) * 1400 * (0.4 + Math.abs(r() - 0.5)); return [u * cs - v * sn, u * sn + v * cs]; }
    });
  },

  // A wormhole: a tunnel of glowing, tilted, counter-rotating rings receding into a bright core.
  _buildWormhole(cfg, rng, density) {
    this._buildStarfield(cfg, rng, density * 0.4, 2, 'deepspace');
    const cols = this._pick(rng, [['#7fd0ff', '#3060ff', '#a040ff'], ['#ff9ee6', '#a040ff', '#3060ff'], ['#7fffe0', '#00b894', '#0984e3'], ['#ffd090', '#ff6a30', '#a0306a']]);
    const core = this._radialSprite([cols[0]], 1500, -2500, 0.9, 0.75);
    this._bgSpin.push({ obj: core, rot: 0, follow: true, k: 0.75 });
    const rings = 8;
    for (let i = 0; i < rings; i++) {
      const t = i / rings, R0 = 280 + t * 2500, col = new THREE.Color(cols[i % cols.length]);
      const ring = new THREE.Mesh(new THREE.RingGeometry(R0, R0 + 60 + t * 50, 84), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5 * (1 - t * 0.55), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
      ring.position.set(0, 0, -2500 - i * 45); ring.rotation.x = 1.12; ring.renderOrder = -7;
      this.scene.add(ring); this._bgObjs.push(ring);
      this._bgSpin.push({ obj: ring, rot: (i % 2 ? 0.16 : -0.13) * (1 + t), follow: true, k: 0.75 });
    }
  },

  // Drifting, billowing nebula sprites (reuses the existing cloud texture, now seeded).
  _buildNebulaClouds(cfg, rng, count, vivid) {
    const palettes = [['#6a3aaa', '#0ac8b9', '#c94f9a', '#4a86c9'], ['#c0392b', '#e67e22', '#8e44ad'], ['#16a085', '#2980b9', '#8e44ad'], ['#c94f9a', '#5b2a86', '#3060ff'], ['#00b894', '#0984e3', '#6c5ce7']];
    const pal = this._pick(rng, palettes);
    const texes = [this._nebulaTexture((rng() * 1e6) | 0), this._nebulaTexture((rng() * 1e6) | 0), this._nebulaTexture((rng() * 1e6) | 0)];
    for (let i = 0; i < count; i++) {
      const m = new THREE.SpriteMaterial({ map: texes[i % 3], color: new THREE.Color(pal[i % pal.length]), transparent: true, opacity: (vivid ? 0.2 : 0.14) + rng() * (vivid ? 0.16 : 0.1), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
      m.rotation = rng() * 6.28;
      const sp = new THREE.Sprite(m), scale = 3000 + rng() * 3400;
      sp.scale.set(scale, scale * (0.6 + rng() * 0.45), 1);
      const bx = (rng() - 0.5) * 7400, by = (rng() - 0.5) * 5400;
      sp.position.set(bx, by, -2300 - i * 150);
      sp.userData = { k: 0.55 + rng() * 0.18, rot: (rng() - 0.5) * 0.03, baseX: bx, baseY: by, phase: rng() * 6.28, drift: 80 + rng() * 130 };
      sp.renderOrder = -8;
      this.scene.add(sp); this._bgObjs.push(sp); this._nebula.push(sp);
    }
  },

  // A big central glow of chosen colours (optionally pulsing) over the base colour.
  _buildGlow(cfg) {
    const g = cfg.glow || {}, cols = (g.colors && g.colors.length ? g.colors : ['#3b2a6b', '#0a4a5a']);
    this._glowSprite = this._radialSprite(cols, 9200, -3000, 0.9, 0.85);
    this._glowSprite.userData = Object.assign(this._glowSprite.userData, { pulse: !!g.pulse, speed: g.speed || 1, baseOpacity: 0.9 });
  },

  _disposeBackground() {
    for (const o of (this._bgObjs || [])) {
      this.scene.remove(o);
      o.geometry && o.geometry.dispose && o.geometry.dispose();
      if (o.material && o.material !== this._starMat) { o.material.map && o.material.map.dispose && o.material.map.dispose(); o.material.dispose && o.material.dispose(); }
    }
    this._bgObjs = []; this._starPts = []; this._nebula = []; this._glowSprite = null; this._bgSpin = [];
  },

  _updateBackground(dt) {
    if (!this.scene) return;
    this._bgT = (this._bgT || 0) + dt;
    const t = this.controls.target;
    if (this._starMat) this._starMat.uniforms.uTime.value = this._bgT;
    for (const pts of (this._starPts || [])) {
      const d = pts.userData.drift;
      pts.position.x = t.x * pts.userData.k + (d ? Math.sin(this._bgT * 0.03) * d[0] : 0);
      pts.position.y = t.y * pts.userData.k + (d ? Math.cos(this._bgT * 0.026) * d[1] : 0);
      if (pts.userData.rot) pts.rotation.z += pts.userData.rot * dt;
    }
    for (const sp of (this._nebula || [])) {
      const u = sp.userData; sp.material.rotation += u.rot * dt;
      sp.position.x = t.x * u.k + u.baseX + Math.sin(this._bgT * 0.05 + u.phase) * u.drift;
      sp.position.y = t.y * u.k + u.baseY + Math.cos(this._bgT * 0.04 + u.phase) * u.drift;
    }
    for (const o of (this._bgSpin || [])) { if (o.rot) o.obj.rotation.z += o.rot * dt; if (o.follow) { o.obj.position.x = t.x * o.k; o.obj.position.y = t.y * o.k; } }
    if (this._glowSprite && this._glowSprite.userData.pulse) {
      const u = this._glowSprite.userData; this._glowSprite.material.opacity = u.baseOpacity * (0.42 + 0.58 * (0.5 + 0.5 * Math.sin(this._bgT * 1.3 * (u.speed || 1))));
    }
  },

  // A small pool of colourful shooting stars — each a short additive line (bright head → clear tail)
  // that spawns occasionally and streaks off in a random direction, scaled to the current view.
  _buildShooters() {
    this._shooters = [];
    for (let i = 0; i < 4; i++) {   // a small pool — rarely more than one streaks at a time
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      line.visible = false; line.renderOrder = -5; line.frustumCulled = false;
      this.scene.add(line);
      this._shooters.push({ line, active: false, t: 0, life: 0, size: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), color: new THREE.Color() });
    }
    this._nextShoot = 8 + Math.random() * 12;   // first meteor after 8–20s, then one every 20–50s
  },
  _updateShooters(dt) {
    if (!this._shooters || this._mode === 'overlay') return;   // hybrid: no 3D meteors (2D owns ambience)
    const cam = this.camera, tgt = this.controls.target, zoom = cam.zoom || 1;
    const viewW = (cam.right - cam.left) / zoom, viewH = (cam.top - cam.bottom) / zoom;
    const PAL = [[1, 0.95, 0.85], [0.4, 0.85, 1], [1, 0.5, 0.85], [1, 0.8, 0.35], [0.7, 1, 0.6], [1, 0.55, 0.35], [0.7, 0.6, 1], [0.35, 1, 0.9]];
    // One global timer spawns a single meteor every 20–50s, so the sky stays mostly calm.
    this._nextShoot -= dt;
    if (this._nextShoot <= 0) {
      this._nextShoot = 20 + Math.random() * 30;
      const s = this._shooters.find(x => !x.active);
      if (s) {
        s.active = true; s.t = 0; s.size = 0.55 + Math.random() * 1.15;   // varied sizes (small ↔ large)
        s.life = 0.5 + Math.random() * 0.7 + s.size * 0.25; s.line.visible = true;
        s.pos.set(tgt.x + (Math.random() - 0.5) * viewW * 0.9, tgt.y + (Math.random() - 0.5) * viewH * 0.9, -280 - Math.random() * 520);
        const ang = Math.random() * Math.PI * 2, speed = (viewW + viewH) * 0.5 * (0.6 + Math.random() * 0.7) * (0.7 + s.size * 0.3);
        s.vel.set(Math.cos(ang) * speed, Math.sin(ang) * speed, 0);
        const c = PAL[(Math.random() * PAL.length) | 0]; s.color.setRGB(c[0], c[1], c[2]);   // varied colors
      }
    }
    for (const s of this._shooters) {
      if (!s.active) continue;
      s.t += dt; s.pos.addScaledVector(s.vel, dt);
      const frac = s.t / s.life;
      if (frac >= 1) { s.active = false; s.line.visible = false; continue; }
      const spd = Math.hypot(s.vel.x, s.vel.y), tailLen = 0.11 * s.size * spd, inv = 1 / (spd || 1);
      const tx = s.pos.x - s.vel.x * inv * tailLen, ty = s.pos.y - s.vel.y * inv * tailLen;
      const p = s.line.geometry.attributes.position, cA = s.line.geometry.attributes.color;
      const fade = (1 - frac) * (frac < 0.15 ? frac / 0.15 : 1) * (0.75 + s.size * 0.45);   // bigger streaks read brighter
      p.setXYZ(0, s.pos.x, s.pos.y, s.pos.z); p.setXYZ(1, tx, ty, s.pos.z);
      cA.setXYZ(0, s.color.r * fade, s.color.g * fade, s.color.b * fade); cA.setXYZ(1, 0, 0, 0);
      p.needsUpdate = true; cA.needsUpdate = true;
    }
  },

  // A soft, wispy cloud texture built from many overlapping radial blobs with an edge-fade — tinted
  // and stacked additively into billowing gas.
  _nebulaTexture(seed) {
    const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const ctx = cv.getContext('2d');
    let r = seed >>> 0; const rnd = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
    for (let i = 0; i < 46; i++) {
      const x = S * (0.5 + (rnd() - 0.5) * 0.82), y = S * (0.5 + (rnd() - 0.5) * 0.82), rad = S * (0.07 + rnd() * 0.23), a = 0.05 + rnd() * 0.13;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,' + a.toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
    }
    const fall = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    fall.addColorStop(0, 'rgba(0,0,0,0)'); fall.addColorStop(0.68, 'rgba(0,0,0,0)'); fall.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = fall; ctx.fillRect(0, 0, S, S);
    return new THREE.CanvasTexture(cv);
  },
  // Hybrid mode: 'overlay' makes the 3D layer transparent and renders ONLY the 3D-native bodies (the
  // 2D map draws everything else beneath it); 'full' is the standalone 3D viewer with its own sky.
  setMode(mode) {
    this._mode = mode === 'overlay' ? 'overlay' : 'full';
    const overlay = this._mode === 'overlay';
    if (this.renderer) this.renderer.setClearColor(overlay ? new THREE.Color(0x000000) : new THREE.Color((this._bg && this._bg.baseColor) || '#010a13'), overlay ? 0 : 1);
    if (this.controls) this.controls.enabled = !overlay;   // hybrid: the 2D map drives the camera
    if (overlay && this.tcontrols) this.tcontrols.detach();
    if (this._ready) { this._buildBackground(); this._rebuild(); }   // rebuild sky (skipped in overlay) + filtered bodies
  },
  // 3D-native kinds that render as real meshes in the overlay; everything else stays 2D in hybrid.
  _isNative3D(kind) { return kind === 'planet3d' || kind === 'planet' || kind === 'moon' || kind === 'star' || kind === 'station' || kind === 'debris' || kind === 'asteroid'; },

  // Push the current map into the scene. A map may carry a `bg3d` background config (from the DM's
  // Effects panel); applying it here means published maps bring their sky to players automatically.
  setData(map) {
    this._map = map || { instances: [] };
    if (map && map.bg3d) this.setBackground(map.bg3d);
    if (this._ready) this._rebuild();
  },

  // Resolve a planet3d instance's saved config — from the instance's look, or its source asset.
  _planetConfig(it) {
    if (it.look && it.look.cfg3d) return it.look.cfg3d;
    const assets = (this._map && this._map.assets) || [];
    const a = assets.find(x => x.id === it.assetId);
    return (a && (a.cfg3d || a.config)) || null;
  },

  _rebuild() {
    const g = this.bodyGroup; if (!g) return;
    const keepSelId = this._selected && this._selected.userData.id;   // survive live edits → keep the gizmo on the same body
    if (this.tcontrols) this.tcontrols.detach();
    this._selected = null;
    (this._planets || []).forEach(p => p.model.dispose());
    this._planets = [];
    (this._spiralImages || []).forEach(s => { try { s.eng.destroy(); } catch (e) { } });   // stop old spiral engines
    for (let i = g.children.length - 1; i >= 0; i--) { const c = g.children[i]; g.remove(c); c.traverse?.(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); }
    const cs = this.cssScene; if (cs) { while (cs.children.length) cs.remove(cs.children[0]); }
    const insts = (this._map && this._map.instances) || [];
    const aniso = this.renderer.capabilities.getMaxAnisotropy();
    this._bodies = []; this._spinPlanes = []; this._spiralImages = [];
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    const overlay = this._mode === 'overlay';
    for (const it of insts) {
      if (overlay && !this._isNative3D(it.kind)) continue;   // hybrid: 2D handles images/text/html/spingalaxy/etc.
      if (it.kind === 'text') { this._addText(it); minX = Math.min(minX, it.x); minY = Math.min(minY, it.y); maxX = Math.max(maxX, it.x); maxY = Math.max(maxY, it.y); continue; }
      if (it.kind === 'html') { this._addHtml(it); minX = Math.min(minX, it.x); minY = Math.min(minY, it.y); maxX = Math.max(maxX, it.x); maxY = Math.max(maxY, it.y); continue; }
      // The 2D `.inst` element is centred on (x,y) (translate(-50%,-50%)), so the body's CENTRE is
      // (x,y) — NOT its top-left. Mirror that exactly here, or the 3D body lands half its size down-
      // right of its 2D selection ring (visible in hybrid: the ring sits up-left of the planet).
      const s = it.size || 60, cx = it.x, cy = it.y;
      // Every body lives in a holder whose transform IS its 2D transform: position = centre,
      // scale·2 = size, rotation = t3d. This lets one gizmo move/scale/rotate any body uniformly.
      // The 2D layer/z maps to a small depth offset so "bring to front / send to back" orders bodies
      // in 3D exactly as in 2D: front bodies sit above the sectors, `behind` bodies below them.
      const holder = new THREE.Group();
      const zLayer = Math.tanh((it.z || 0) / 20) * 0.4;              // bounded, monotonic in the 2D z
      holder.position.set(cx, -cy, (it.behind ? -3 : 0.5) + zLayer);
      holder.scale.setScalar(Math.max(4, s / 2));
      // Orientation parity: an explicit 3D rotation (t3d, from the gizmo) wins; otherwise the 2D
      // rotation (it.rot, degrees clockwise) maps to the 3D z axis (y is negated, so rot → -rot).
      const _t3 = it.t3d || {};
      holder.rotation.set(_t3.rx || 0, _t3.ry || 0, _t3.rz != null ? _t3.rz : -((it.rot || 0) * Math.PI / 180));
      holder.userData.id = it.id;
      const imgUrl = it.kind === 'image' && it.look ? (it.look.src || it.look.image) : null;
      // planet3d uses its saved cfg3d; 2D planets/moons synthesize a config so they render as real 3D
      // spheres (not flat discs). Stations/debris/asteroids get their own generated 3D meshes.
      const cfg = it.kind === 'planet3d' ? this._planetConfig(it) : ((it.kind === 'planet' || it.kind === 'moon') ? this._genericPlanetCfg(it) : null);
      const genMesh = it.kind === 'station' || it.kind === 'debris' || it.kind === 'asteroid';
      // Every body starts as a cheap disc impostor; _applyLOD() promotes the large ones on-screen to
      // full 3D meshes. Unlimited impostors → a whole system fits; only a few big ones cost a mesh.
      let disc = null;
      if (imgUrl) { const plane = this._imagePlane(it, imgUrl); holder.add(plane); if (plane.userData.spin) this._spinPlanes.push(plane); }
      else { disc = this._discMesh(it, cfg); holder.add(disc); if (disc.userData.spin) this._spinPlanes.push(disc); }
      if (it.pois && it.pois.length) this._addSurfacePois(holder, it);   // surface POIs on the body
      if (it.opacity != null && it.opacity < 1) holder.traverse(o => { if (o.material && !o.material.uniforms) { o.material.transparent = true; o.material.opacity = it.opacity; } });   // fade parity
      g.add(holder);
      // The body's name label (below it), matching the 2D label layer — kinds text/html are their own label.
      // Body name label — only in full 3D. In hybrid (overlay) the visible 2D label layer already
      // draws it (and it's the editable/draggable one), so adding a 3D label here would double it up.
      if (!overlay && it.name && (!it.label || it.label.show !== false)) this._addText({ name: it.name, label: it.label, x: cx, y: it.y + s / 2 + 6 });
      this._bodies.push({ holder, it, disc, isStar: it.kind === 'star', kind: it.kind, cfg, canFull: !imgUrl && (it.kind === 'star' || !!cfg || genMesh), hasModel: false, model: null });
      minX = Math.min(minX, it.x - s / 2); minY = Math.min(minY, it.y - s / 2); maxX = Math.max(maxX, it.x + s / 2); maxY = Math.max(maxY, it.y + s / 2);
    }
    // Framing needs the container's real pixel size, which is only correct once it's visible; store
    // the bounds and (re)frame from show(). Framing here while hidden gives a degenerate zoom.
    this._buildSectors();   // sector/system regions, matching the 2D map's positions/scale
    this._bounds = (insts.length && minX < maxX) ? { minX, minY, maxX, maxY } : null;
    if (this._shown) this._applyLOD();   // re-pick impostor/mesh for the (possibly changed) bodies
    if (keepSelId !== undefined && keepSelId !== null) {   // re-attach the gizmo to the same body after a live edit
      const b = (this._bodies || []).find(x => x.holder.userData.id === keepSelId);
      if (b) this._select(b.holder);
    }
  },

  // Distance/zoom LOD: promote bodies that are large on-screen to full 3D meshes, keep the rest as
  // cheap disc impostors. Hysteresis (promote ≥ PROMOTE px, demote < DEMOTE px) avoids thrash, and a
  // MAX_FULL budget (biggest win first) caps GPU cost regardless of how many bodies the map holds.
  _applyLOD() {
    if (!this._ready || !this._bodies || !this._bodies.length) return;
    const zoom = this.camera.zoom || 1, ph = this.container.clientHeight || 1, frust = (this.camera.top - this.camera.bottom) || 1000;
    const pxPerWorld = zoom * ph / frust, PROMOTE = 90, DEMOTE = 55, MAX_FULL = 14, aniso = this.renderer.capabilities.getMaxAnisotropy();
    const sz = b => b.holder.scale.x * 2;   // LIVE size (gizmo updates holder.scale in real time)
    const cands = this._bodies.filter(b => b.canFull).sort((a, b) => sz(b) - sz(a));
    let full = 0;
    for (const b of cands) { if (b.hasModel) { if (sz(b) * pxPerWorld < DEMOTE) this._demote(b); else full++; } }
    for (const b of cands) {
      if (b.hasModel) continue;
      if (sz(b) * pxPerWorld >= PROMOTE && full < MAX_FULL && this._promote(b, aniso)) full++;
    }
    this._lodZoom = zoom;
  },
  // A 2D planet/moon → a real 3D planet config (buildPlanetModel reads TYPES[type] for colours).
  _genericPlanetCfg(it) {
    const L = it.look || it, valid = ['terran', 'ocean', 'jungle', 'desert', 'ice', 'volcanic', 'toxic', 'barren', 'gas'];
    const lava = L.lava != null ? +L.lava : 0, city = L.city != null ? +L.city : undefined, lightColor = L.lightColor || undefined;
    const destroyed = L.destroyed || undefined, destroyI = L.destroyI != null ? +L.destroyI : undefined;
    if (it.kind === 'moon') return { type: L.mtype === 'ice' ? 'ice' : 'barren', seed: L.seed || 1, sea: 0.02, cscale: 2.6, coast: 0.6, ice: L.mtype === 'ice' ? 0.6 : 0.05, spin: 1, atmoOn: false, lava, city, lightColor, destroyed, destroyI };
    const t = valid.includes(L.ptype) ? L.ptype : (L.ptype === 'rock' ? 'barren' : 'terran');
    return { type: t, seed: L.seed || 1, sea: t === 'gas' ? 0.5 : 0.52, cscale: 2.2, coast: 0.5, ice: t === 'ice' ? 0.5 : 0.15, spin: 1, ring: !!L.ring, atmoOn: L.atmo !== false && ['terran', 'ocean', 'toxic', 'gas', 'jungle'].includes(t), atmoColor: L.atmoColor || undefined, lava, city, lightColor, destroyed, destroyI };
  },
  // Debris field: a cluster of flat-shaded rocky chunks tumbling slowly (distinct from a single asteroid).
  _debrisModel(it) {
    const L = it.look || it, grp = new THREE.Group(), dis = [];
    const base = new THREE.Color(L.c1 || '#8a8a9a'), dark = new THREE.Color(L.c2 || '#5a5a62');
    let seed = ((L.seed || 7) >>> 0) || 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const N = it.kind === 'asteroid' ? 1 : 7;
    for (let k = 0; k < N; k++) {
      const g = new THREE.IcosahedronGeometry(0.22 + rnd() * 0.34, 0), pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) { const f = 0.7 + rnd() * 0.6; pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f, pos.getZ(i) * f); }
      g.computeVertexNormals();
      const m = new THREE.MeshStandardMaterial({ color: base.clone().lerp(dark, rnd() * 0.5), roughness: 0.95, metalness: 0.05, flatShading: true });
      const rock = new THREE.Mesh(g, m); rock.position.set(N === 1 ? 0 : (rnd() - 0.5) * 1.5, N === 1 ? 0 : (rnd() - 0.5) * 1.5, (rnd() - 0.5) * 0.6);
      rock.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6); rock.userData.spin = [(rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.6];
      grp.add(rock); dis.push(g, m);
    }
    return { group: grp, update: (dt) => { for (const r of grp.children) { r.rotation.x += r.userData.spin[0] * dt; r.rotation.y += r.userData.spin[1] * dt; } }, dispose: () => dis.forEach(d => d.dispose && d.dispose()) };
  },
  _promote(b, aniso) {
    try {
      const model = b.isStar ? buildStarModel(b.it.look || {}, { anisotropy: aniso })
        : b.kind === 'station' ? buildStationModel(b.it.look || {}, { anisotropy: aniso })
          : b.kind === 'asteroid' ? buildAsteroidModel(b.it.look || {}, { anisotropy: aniso })
            : b.kind === 'debris' ? this._debrisModel(b.it)
              : buildPlanetModel(b.cfg, { anisotropy: aniso, segments: 64 });
      if (b.disc) b.holder.remove(b.disc);
      if (b.it.opacity != null && b.it.opacity < 1) model.group.traverse(o => { if (o.material && !o.material.uniforms) { o.material.transparent = true; o.material.opacity = b.it.opacity; } });
      b.holder.add(model.group); b.model = model; b.hasModel = true; this._planets.push({ model });
      return true;
    } catch (e) { console.error('[map3d] LOD promote failed', e); return false; }
  },
  _demote(b) {
    if (!b.model) return;
    b.holder.remove(b.model.group);
    this._planets = this._planets.filter(p => p.model !== b.model);
    b.model.dispose(); b.model = null; b.hasModel = false;
    if (b.disc) b.holder.add(b.disc);
  },

  // The dominant, surface-true colour to paint a body's impostor disc with — so a planet that is far
  // away or tiny still reads as its real colours, never a default/random tint.
  _discBaseColor(it) {
    if (it.kind === 'planet3d') {
      const cfg = this._planetConfig(it);
      if (cfg && planetDominantColor) { try { return planetDominantColor(cfg); } catch (e) { /* fall through */ } }
    }
    const L = it.look || {};
    if (it.kind === 'star') return L.c1 || L.color || L.c2 || '#ffd9a0';
    const cs = [L.c1, L.c2, L.c3].filter(Boolean);
    if (cs.length) return this._blendHex(cs);
    return '#8f9bd0';
  },
  _blendHex(list) {
    let r = 0, g = 0, b = 0; for (const h of list) { const c = new THREE.Color(h); r += c.r; g += c.g; b += c.b; }
    const n = list.length || 1; return '#' + new THREE.Color(r / n, g / n, b / n).getHexString();
  },
  // A cheap sphere-like impostor: a radial gradient (lit highlight → true colour → shadow terminator)
  // in the body's real dominant colour, cached per colour. Reads as a shaded planet, not a flat coin.
  _discTexture(hex) {
    this._discTexCache = this._discTexCache || {};
    if (this._discTexCache[hex]) return this._discTexCache[hex];
    const base = new THREE.Color(hex);
    const lit = new THREE.Color(Math.min(1, base.r * 1.35 + 0.05), Math.min(1, base.g * 1.35 + 0.05), Math.min(1, base.b * 1.35 + 0.05));
    const shd = new THREE.Color(base.r * 0.4, base.g * 0.42, base.b * 0.46);
    const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S; const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(S * 0.37, S * 0.35, S * 0.04, S * 0.5, S * 0.5, S * 0.52);  // light from upper-left
    g.addColorStop(0, '#' + lit.getHexString()); g.addColorStop(0.55, hex); g.addColorStop(1, '#' + shd.getHexString());
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, 7); ctx.fill();
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    this._discTexCache[hex] = t; return t;
  },
  // A real procedural planet face for the impostor (continents/bands/ice + atmosphere), cached per
  // config so it costs one small render regardless of how many bodies share the look.
  _planetImpostorTex(cfg) {
    if (!planetImpostorCanvas || !cfg) return null;
    this._impostorCache = this._impostorCache || {};
    const key = [cfg.type, cfg.seed, cfg.sea, cfg.ice, cfg.cscale, cfg.coast, cfg.atmoColor, cfg.atmoOn].join('|');
    if (this._impostorCache[key]) return this._impostorCache[key];
    try {
      const t = new THREE.CanvasTexture(planetImpostorCanvas(cfg, 96)); t.colorSpace = THREE.SRGBColorSpace;
      this._impostorCache[key] = t; return t;
    } catch (e) { return null; }
  },
  // A spiral-galaxy face (arms + coloured core) drawn from a spingalaxy's look, cached per look. The
  // 2D map's diff-rotation is approximated in 3D by spinning the whole disc — the galaxy still turns.
  _spinGalaxyTex(L) {
    L = L || {};
    this._galaxyCache = this._galaxyCache || {};
    const key = [L.c1, L.c2, L.c3, L.arms, L.turns, L.tight].join('|');
    if (this._galaxyCache[key]) return this._galaxyCache[key];
    const S = 160, cv = document.createElement('canvas'); cv.width = cv.height = S; const ctx = cv.getContext('2d');
    const cx = S / 2, cy = S / 2, R = S * 0.46;
    const c1 = new THREE.Color(L.c1 || '#c89aff'), c2 = new THREE.Color(L.c2 || '#6a3aff'), core = L.c3 || '#fff2c8';
    const arms = Math.max(1, Math.min(6, L.arms || 2)), turns = (L.turns != null ? L.turns : 1.1), tight = (L.tight != null ? L.tight : 0.9);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.5);   // bright core
    g.addColorStop(0, core); g.addColorStop(0.4, this._hexA(core, 0.4)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0, 7); ctx.fill();
    let seed = 1234; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let a = 0; a < arms; a++) {
      for (let i = 0; i < 260; i++) {
        const rr = Math.pow(i / 260, 0.62), rad = rr * R;
        const ang = a * (6.2831 / arms) + rr * turns * 6.2831 * (1 + tight) + (rnd() - 0.5) * 0.5 * (1 / (rr + 0.15));
        const sc = (rnd() - 0.5) * R * 0.09 * (0.4 + rr);
        const x = cx + Math.cos(ang) * rad + sc, y = cy + Math.sin(ang) * rad + (rnd() - 0.5) * R * 0.09 * (0.4 + rr);
        const t = rr, cr = c1.r + (c2.r - c1.r) * t, cg = c1.g + (c2.g - c1.g) * t, cb = c1.b + (c2.b - c1.b) * t;
        ctx.globalAlpha = (0.5 + rnd() * 0.5) * (1 - rr * 0.5);
        ctx.fillStyle = `rgb(${(cr * 255) | 0},${(cg * 255) | 0},${(cb * 255) | 0})`;
        ctx.beginPath(); ctx.arc(x, y, rnd() < 0.04 ? 2.2 : 0.7 + rnd() * 1.1, 0, 7); ctx.fill();
      }
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    this._galaxyCache[key] = t; return t;
  },
  // Rasterise a body's 2D art() SVG into a CanvasTexture so a far/zoomed-out impostor looks like the
  // object (a station reads as a station, an asteroid as a rock, a star as a glowing star) instead of a
  // plain orb. Cached per look-signature; async (SVG→Image→canvas), so callers pass onReady to swap the
  // material map in when the raster is ready. Returns the (possibly still-blank) texture, or null.
  _artImpostorTex(it, onReady) {
    if (typeof window === 'undefined' || typeof window.art !== 'function') return null;
    this._artImpCache = this._artImpCache || {};
    const L = it.look || it;
    const key = it.kind + '|' + [L.stype, L.dtype, L.mtype, L.ptype, L.c1, L.c2, L.c3, L.seed, L.rays, L.brightness, L.coronaSize].join(',');
    if (this._artImpCache[key]) { const c = this._artImpCache[key]; if (c.ready) onReady && onReady(c.tex); else c.cbs.push(onReady); return c.tex; }
    let svg;
    try { svg = window.art(Object.assign({ kind: it.kind }, L), false); } catch (e) { return null; }
    if (!svg || svg.trim().indexOf('<svg') !== 0) return null;   // only rasterise true vector art (skip <img>/<div> wrappers)
    svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" ');
    const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const rec = { tex, ready: false, cbs: [onReady] }; this._artImpCache[key] = rec;
    const img = new Image();
    img.onload = () => { try { const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, S, S); ctx.drawImage(img, 0, 0, S, S); tex.needsUpdate = true; } catch (e) { /* noop */ } rec.ready = true; rec.cbs.forEach(cb => cb && cb(tex)); rec.cbs = []; };
    img.onerror = () => { rec.ready = true; };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return tex;
  },
  _discMesh(it, cfg) {   // a unit-radius impostor (holder scales it to size)
    // planet-like kinds (planet3d, 2D planet, moon) get their real surface as the impostor face.
    const pcfg = cfg || (it.kind === 'planet3d' ? this._planetConfig(it) : null);
    if (pcfg) {
      const tex = this._planetImpostorTex(pcfg);
      if (tex) return new THREE.Mesh(new THREE.CircleGeometry(1, 56), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    }
    if (it.kind === 'spingalaxy') {   // a spinning spiral-galaxy disc, animated in 3D like the 2D map
      const tex = this._spinGalaxyTex(it.look || it);
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 56), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      const dur = (it.look && it.look.spinDur) || it.spinDur || 60;   // seconds/rotation → deg/s
      mesh.userData.spin = 360 / Math.max(4, dur);
      return mesh;
    }
    // stations, asteroids/debris, stars, 2D moons/planets/galaxies → rasterise their real 2D art() as the
    // impostor face (a plane, not a disc, so panels/points/glow aren't clipped). Start on the shaded
    // dominant-colour disc, then swap to the art raster once it loads.
    const ART_KINDS = ['station', 'debris', 'asteroid', 'star', 'moon', 'planet', 'galaxy'];
    if (typeof window !== 'undefined' && typeof window.art === 'function' && ART_KINDS.includes(it.kind)) {
      const mat = new THREE.MeshBasicMaterial({ map: this._discTexture(this._discBaseColor(it)), transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      this._artImpostorTex(it, (tex) => { if (tex && mesh.material) { mesh.material.map = tex; mesh.material.needsUpdate = true; } });
      return mesh;
    }
    const hex = this._discBaseColor(it);   // generated art / config-less bodies → shaded true-colour disc
    return new THREE.Mesh(new THREE.CircleGeometry(1, 56), new THREE.MeshBasicMaterial({ map: this._discTexture(hex), transparent: true }));
  },

  // A sector/system outline in 3D coords (2D→3D: y negated), matching the 2D `sectorPath` exactly —
  // straight polygon, or the same closed Catmull-Rom→cubic-Bézier (sampled) for curved edges.
  _sectorOutline(s) {
    const pts = s.points || []; if (pts.length < 3) return null;
    if (!s.curved) return pts.map(p => new THREE.Vector2(p.x, -p.y));
    const n = pts.length, out = [], SEG = 12;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6, c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      for (let t = 0; t < SEG; t++) { const u = t / SEG, m = 1 - u; const x = m * m * m * p1.x + 3 * m * m * u * c1x + 3 * m * u * u * c2x + u * u * u * p2.x, y = m * m * m * p1.y + 3 * m * m * u * c1y + 3 * m * u * u * c2y + u * u * u * p2.y; out.push(new THREE.Vector2(x, -y)); }
    }
    return out;
  },
  _centroid(pts) { let x = 0, y = 0; for (const p of pts) { x += p.x; y += p.y; } const n = pts.length || 1; return { x: x / n, y: y / n }; },
  // Build every sector region: a translucent filled polygon + a coloured border, at the same position
  // and scale as the 2D map, so the two views read as the same region. `z` gives relative layering.
  _buildSectors() {
    const g = this._sectorGroup; if (!g) return;
    for (let i = g.children.length - 1; i >= 0; i--) { const c = g.children[i]; g.remove(c); c.geometry && c.geometry.dispose && c.geometry.dispose(); c.material && c.material.dispose && c.material.dispose(); }
    if (this._mode === 'overlay') return;   // hybrid: sectors are drawn by the 2D map
    // Draw in the same z order as the 2D map (depthTest is off, so paint order sets who's on top) →
    // sending a sector forward/back reorders it identically in both views.
    const sectors = [...((this._map && this._map.sectors) || [])].sort((a, b) => (a.z || 0) - (b.z || 0));
    for (const s of sectors) {
      const outline = this._sectorOutline(s); if (!outline) continue;
      const col = new THREE.Color(s.color || '#5fbf7a');
      const zPos = Math.min(-0.4, -2 + (s.z || 0) * 0.02);   // behind bodies (z=0), ordered by the 2D z field
      const fill = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(outline)), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: (s.fillOpacity != null ? s.fillOpacity : 0.12), side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
      fill.position.z = zPos; fill.renderOrder = -3;
      g.add(fill);
      const border = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outline.map(p => new THREE.Vector3(p.x, p.y, zPos + 0.15))), new THREE.LineBasicMaterial({ color: new THREE.Color(s.borderColor || s.color || '#5fbf7a'), transparent: true, opacity: 0.85 }));
      border.renderOrder = -3; g.add(border);
      if (s.name && (!s.label || s.label.show !== false)) { const c = this._centroid(s.points); this._addText({ name: s.name, label: s.label, x: c.x, y: c.y }); }
    }
  },

  // A small glowing pin texture for surface POIs (cached).
  _poiTex() {
    if (this._poiTexCache) return this._poiTexCache;
    const S = 48, cv = document.createElement('canvas'); cv.width = cv.height = S; const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.95)'); g.addColorStop(0.55, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, 7); ctx.fill();
    this._poiTexCache = new THREE.CanvasTexture(cv); return this._poiTexCache;
  },
  _poiColor(type) { return ({ city: '#ffd24a', ruin: '#c98b5a', station: '#7fd0ff', hazard: '#ff6a4a', resource: '#7ef0a0', landmark: '#c98bff' })[type] || '#ffd24a'; },
  // A body's surface points of interest, placed on the front hemisphere (POI ax/ay → sphere lon/lat),
  // matching the 2D POI layer. Children of the holder, so they move/scale with the body and are picked.
  _addSurfacePois(holder, it) {
    for (const p of (it.pois || [])) {
      const lon = (p.ax || 0) * Math.PI * 0.5, lat = -(p.ay || 0) * Math.PI * 0.5, cl = Math.cos(lat);
      const x = Math.sin(lon) * cl, y = Math.sin(lat), z = Math.cos(lon) * cl;   // unit sphere, +z toward camera
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._poiTex(), color: new THREE.Color(this._poiColor(p.type)), transparent: true, depthTest: false, depthWrite: false }));
      sp.position.set(x * 1.03, y * 1.03, z * 1.03); const sc = 0.17; sp.scale.set(sc, sc, sc);
      sp.renderOrder = 7; sp.userData = { poiId: p.id, instId: it.id };
      holder.add(sp);
    }
  },

  // Free text object → a crisp DOM element in the CSS3D layer, styled from its LabelStyle.
  _addText(it) {
    if (!this.cssScene) return;
    const st = window.mergeLabelStyle ? window.mergeLabelStyle(it.label) : Object.assign({ font: 'Cinzel', size: 28, weight: 600, color: '#f0e6d2', align: 'middle' }, it.label || {});
    const el = document.createElement('div');
    el.textContent = it.name || 'Text';
    const sh = [];
    if (st.shadow) sh.push('0 1px 2px rgba(0,0,0,.85)');
    if (st.glow > 0) { const gc = st.glowColor || '#0ac8b9'; sh.push('0 0 ' + st.glow + 'px ' + gc, '0 0 ' + (st.glow * 2) + 'px ' + gc); }
    el.style.cssText = 'white-space:pre;pointer-events:none;user-select:none;line-height:1.15;' +
      'font-family:' + (window.LABEL_FONT_STACK ? window.LABEL_FONT_STACK(st.font) : 'Cinzel,serif') + ';' +
      'font-size:' + (st.size || 28) + 'px;font-weight:' + (st.weight || 600) + ';color:' + (st.color || '#f0e6d2') + ';' +
      'letter-spacing:' + (st.tracking || 0) + 'px;opacity:' + (st.opacity != null ? st.opacity : 1) + ';' +
      'text-align:' + (st.align === 'start' ? 'left' : st.align === 'end' ? 'right' : 'center') + ';' +
      (st.italic ? 'font-style:italic;' : '') + (st.uppercase ? 'text-transform:uppercase;' : '') +
      (sh.length ? 'text-shadow:' + sh.join(', ') + ';' : '') +
      (st.outline > 0 ? '-webkit-text-stroke:' + st.outline + 'px ' + (st.outlineColor || '#010a13') + ';' : '');
    const obj = new CSS3DObject(el);
    obj.position.set(it.x, -it.y, 0);
    if (st.rotate) obj.rotation.z = -st.rotate * Math.PI / 180;
    obj.userData.id = it.id;
    this.cssScene.add(obj);
  },

  // HTML card → a sandboxed iframe DOM element in the CSS3D layer (same safe render as 2D).
  _addHtml(it) {
    if (!this.cssScene) return;
    const w = it.w || 300, h = it.h || 170;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'width:' + w + 'px;height:' + h + 'px;background:rgba(11,26,44,.82);border:1px solid #2a3f52;border-radius:8px;overflow:hidden;pointer-events:none';
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', '');
    iframe.srcdoc = window.htmlFrameSrcdoc ? window.htmlFrameSrcdoc(it.html || '') : (it.html || '');
    iframe.style.cssText = 'width:100%;height:100%;border:0;display:block;background:transparent';
    wrap.appendChild(iframe);
    const obj = new CSS3DObject(wrap);
    obj.position.set(it.x, -it.y, 0);
    if (it.t3d) obj.rotation.set(it.t3d.rx || 0, it.t3d.ry || 0, it.t3d.rz || 0);
    obj.userData.id = it.id;
    this.cssScene.add(obj);
  },

  // Inserted image → a flat, aspect-correct plane (fits the unit holder; holder scales it to size).
  // Edge fade (radial or straight-from-edge) is applied in-shader, mirroring the 2D `fadeMask`, so
  // faded images look identical in 3D. A per-instance spin rotates the plane when `imgSpin` is set.
  _imagePlane(it, url) {
    const spiral = !!(it.spiral && it.spiral.on && window.DiffSpinGalaxy && it.look && it.look.src);
    const nw = (it.look && (it.look.natW || it.look.w)) || 1, nh = (it.look && (it.look.natH || it.look.h)) || 1;
    const ar = nw / nh; let pw = 2, ph = 2; if (spiral) { pw = ph = 2; } else if (ar >= 1) ph = 2 / ar; else pw = 2 * ar;
    const fade = Math.max(0, Math.min(100, it.fade || 0)) / 100;
    const spread = Math.max(0.01, (it.fadeSpread != null ? it.fadeSpread : 35) / 100);
    const shape = (it.fadeShape || 'radial') === 'edges' ? 1 : 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: null }, uHasMap: { value: 0 }, uColor: { value: new THREE.Color(0x222b3a) }, uFade: { value: fade }, uSpread: { value: spread }, uShape: { value: shape }, uEndA: { value: 1 - fade } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `
        precision mediump float;
        uniform sampler2D uMap; uniform float uHasMap; uniform vec3 uColor;
        uniform float uFade, uSpread, uShape, uEndA; varying vec2 vUv;
        void main(){
          vec4 tex = uHasMap>0.5 ? texture2D(uMap, vUv) : vec4(uColor,1.0);
          float a = tex.a;
          if(uFade > 0.001){
            if(uShape > 0.5){                                  // straight fade in from each edge
              float s = max(0.02, uSpread*0.5);
              float fh = mix(uEndA, 1.0, smoothstep(0.0, s, min(vUv.x, 1.0-vUv.x)));
              float fv = mix(uEndA, 1.0, smoothstep(0.0, s, min(vUv.y, 1.0-vUv.y)));
              a *= min(fh, fv);
            } else {                                           // radial (closest-side) fade
              float r = length(vUv - 0.5) * 2.0;
              a *= mix(1.0, uEndA, smoothstep(1.0 - uSpread, 1.0, r));
            }
          }
          if(a <= 0.003) discard;
          gl_FragColor = vec4(tex.rgb, a);
        }`,
      transparent: true, side: THREE.DoubleSide, depthWrite: false
    });
    if (spiral) {
      // The SAME layered-spiral engine as 2D, rendered to an offscreen canvas and used as a live
      // texture — so the actual image swirls identically in both viewers (not a model/HTML).
      const cv = document.createElement('canvas'); cv.width = cv.height = 256;
      const eng = new window.DiffSpinGalaxy(cv, { rings: it.spiral.rings || 6, corePulse: false });
      eng._fit = function () { this.canvas.width = 256; this.canvas.height = 256; this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.cssW = 256; this.cssH = 256; };
      eng._fit();
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      mat.uniforms.uMap.value = tex; mat.uniforms.uHasMap.value = 1;
      eng.setImage(it.look.src).then(() => { try { eng.fromConfig(it.spiral); } catch (e) { } eng.start(); }).catch(() => { });
      (this._spiralImages = this._spiralImages || []).push({ tex, eng });
    } else {
      new THREE.TextureLoader().load(url, tex => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy(); mat.uniforms.uMap.value = tex; mat.uniforms.uHasMap.value = 1; mat.needsUpdate = true; }, undefined, () => { /* keep the placeholder tint on load error */ });
    }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
    if (it.imgSpin && !spiral) mesh.userData.spin = it.imgSpin;   // deg/s → rotated each frame (spiral has its own motion)
    return mesh;
  },

  // Centre + scale the ortho camera to EXACTLY match the 2D viewer's current view, so toggling 2D⇄3D
  // keeps everything in the same place and size. 2D→3D: world (cx,cy)→(cx,-cy); px-per-unit parity →
  // camera.zoom = (2·H)·scale / heightPx. Returns false if no 2D view bridge is available.
  _syncFromView() {
    if (typeof window.map2dView !== 'function') return false;
    const v = window.map2dView(); if (!v || !isFinite(v.scale) || v.scale <= 0) return false;
    const h = this.container.clientHeight || 1, H = 500;
    this.controls.target.set(v.cx, -v.cy, 0);
    this.camera.position.set(v.cx, -v.cy, 2000);
    this.camera.zoom = Math.max(0.02, Math.min(50, (2 * H) * v.scale / h));
    this.camera.updateProjectionMatrix(); this.controls.update();
    return true;
  },
  // Write the 3D centre/scale back to the 2D view, so returning to 2D lands on the same place.
  _syncToView() {
    if (typeof window.setMap2dView !== 'function' || !this.controls) return;
    const t = this.controls.target, h = this.container.clientHeight || 1, H = 500;
    const scale = this.camera.zoom * h / (2 * H);
    if (isFinite(scale) && scale > 0) window.setMap2dView(t.x, -t.y, scale);
  },

  // Fit the ortho camera to the stored content bounds (2D→3D: y negated).
  _frameBounds() {
    const b = this._bounds; if (!b) return;
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    const cw = Math.max(1, b.maxX - b.minX), ch = Math.max(1, b.maxY - b.minY);
    const aspect = Math.max(0.1, (this.container.clientWidth || 1) / (this.container.clientHeight || 1));
    const H = 500;
    const zoom = Math.max(0.02, (2 * H) / (Math.max(ch, cw / aspect) * 1.25));
    this.controls.target.set(cx, -cy, 0);
    this.camera.position.set(cx, -cy, 2000);
    this.camera.zoom = zoom; this.camera.updateProjectionMatrix();
    this.controls.update();
  },

  resize() {
    if (!this._ready || !this.container) return;
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    if (this.cssRenderer) this.cssRenderer.setSize(w, h);
    const H = 500, a = w / h;
    this.camera.left = -H * a; this.camera.right = H * a; this.camera.top = H; this.camera.bottom = -H;
    this.camera.updateProjectionMatrix();
  },

  show() {
    if (!this._ready) return;
    this._shown = true; this.container.style.display = 'block'; this.resize();
    // Match the 2D viewer's centre + scale exactly (fall back to fitting all bodies if unavailable).
    if (!this._syncFromView()) this._frameBounds();
    this._applyLOD();      // pick full-mesh vs impostor for the current zoom
    const sun = new THREE.Vector3(1, 1, 2).normalize();
    let last = performance.now();
    const loop = (t) => {
      if (!this._shown) return;
      this._raf = requestAnimationFrame(loop);
      const now = t || performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
      for (const p of this._planets) p.model.update(dt, sun);   // live planets spin in real time
      for (const pl of (this._spinPlanes || [])) pl.rotation.z -= pl.userData.spin * Math.PI / 180 * dt;   // spinning images
      for (const s of (this._spiralImages || [])) s.tex.needsUpdate = true;   // re-upload the animated spiral canvas
      if (this._focusGoal) {   // ease the camera toward a right-click Focus target (moves target+camera together → keeps tilt)
        const g = this._focusGoal, t = this.controls.target, s = Math.min(1, dt * 5);
        const dx = (g.x - t.x) * s, dy = (g.y - t.y) * s;
        t.x += dx; t.y += dy; this.camera.position.x += dx; this.camera.position.y += dy;
        this.camera.zoom += (g.zoom - this.camera.zoom) * s; this.camera.updateProjectionMatrix();
        if (Math.hypot(g.x - t.x, g.y - t.y) < 1 && Math.abs(g.zoom - this.camera.zoom) < 0.02) this._focusGoal = null;
      }
      this.controls.update();
      if (this._mode === 'overlay') this._syncFromView();   // hybrid: lock the camera to the 2D map's view every frame
      if (Math.abs(this.camera.zoom - (this._lodZoom || 0)) > (this._lodZoom || 1) * 0.04) this._applyLOD();   // re-LOD on zoom
      this._updateBackground(dt);                                // parallax stars, nebula drift, glow pulse
      this._updateShooters(dt);                                  // colourful meteors
      this.renderer.render(this.scene, this.camera);
      if (this.cssRenderer) this.cssRenderer.render(this.cssScene, this.camera);
    };
    if (!this._raf) loop(last);
  },

  hide() {
    this._syncToView();   // hand the current centre/scale back to the 2D map so it lands in the same place
    this._shown = false;
    if (this.tcontrols) this.tcontrols.detach();
    this._selected = null;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    if (this.container) this.container.style.display = 'none';
  },

  isShown() { return this._shown; },
  isEditing() { return !!(this.tcontrols && this.tcontrols.dragging); },   // true mid gizmo-drag
};

window.Map3D = Map3D;

/* ---- toggle wiring (module scripts are deferred, so the DOM is ready) ---- */
(function wireToggle() {
  const btn = document.getElementById('view3dBtn');
  const gl = document.getElementById('gl3d');
  if (!btn || !gl) return;
  // Which 2D layers to hide when 3D is on — host declares them via `data-hide` on #gl3d.
  const LAYERS = (gl.dataset.hide ? gl.dataset.hide.split(/\s+/) : ['bgLayer', 'svg', 'bodyLayer', 'fxCanvas', 'labelLayer']).filter(Boolean);
  const show2d = () => LAYERS.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = ''; });
  const hide2d = () => LAYERS.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });

  // Three-way view: 2D → 3D → Hybrid → 2D. Hybrid keeps the 2D map visible and overlays a transparent
  // 3D layer (pointer-events:none) that renders only the 3D bodies, camera-locked to the 2D view.
  let mode = '2d';
  const apply = async (next) => {
    document.documentElement.classList.toggle('map-hybrid', next === 'hybrid');   // 2D hides the art of 3D-native bodies
    if (next === '2d') {
      Map3D.hide(); show2d(); gl.style.pointerEvents = ''; btn.classList.remove('aether'); btn.textContent = '⛶ 3D'; mode = '2d'; return;
    }
    if (!Map3D._ready) {
      btn.textContent = '⛶ loading…'; btn.disabled = true;
      const ok = await Map3D.mount(gl); btn.disabled = false;
      if (!ok) { btn.textContent = '⛶ 3D'; if (window.toast) window.toast('3D engine unavailable'); mode = '2d'; return; }
    }
    if (next === '3d') {
      Map3D.setMode('full'); Map3D.setData(typeof window.mapData === 'function' ? window.mapData() : { instances: [] });
      hide2d(); gl.style.pointerEvents = ''; Map3D.show(); btn.classList.add('aether'); btn.textContent = '⧉ Hybrid'; mode = '3d';
    } else if (next === 'hybrid') {
      if (Map3D.isShown() && Map3D._syncToView) Map3D._syncToView();   // carry the current 3D view back to 2D so hybrid preserves it
      Map3D.setMode('overlay'); Map3D.setData(typeof window.mapData === 'function' ? window.mapData() : { instances: [] });
      show2d(); gl.style.pointerEvents = 'none'; Map3D.show(); btn.classList.add('aether'); btn.textContent = '▢ 2D'; mode = 'hybrid';
    }
  };
  btn.addEventListener('click', () => apply({ '2d': '3d', '3d': 'hybrid', 'hybrid': '2d' }[mode]));
})();
