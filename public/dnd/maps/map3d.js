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
let THREE = null, OrbitControls = null, TransformControls = null, CSS3DRenderer = null, CSS3DObject = null, buildPlanetModel = null, buildStarModel = null;

async function loadThree() {
  if (THREE) return;
  THREE = await import('three');
  ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
  ({ TransformControls } = await import('three/addons/controls/TransformControls.js'));
  ({ CSS3DRenderer, CSS3DObject } = await import('three/addons/renderers/CSS3DRenderer.js'));
  ({ buildPlanetModel, buildStarModel } = await import('/dnd/maps/planet3d-model.js'));
}

const NAVY = 0x010a13;
const MAX_LIVE_PLANETS = 16;   // LOD guard: beyond this, extra 3D worlds fall back to flat discs

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

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    renderer.setClearColor(NAVY, 1);
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
    controls.screenSpacePanning = true;         // pan like a 2D map
    controls.minPolarAngle = 0;                  // straight top-down …
    controls.maxPolarAngle = Math.PI * 0.48;     // … up to an almost-flat tilt
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xfff4e0, 1.4); key.position.set(1, 1, 2); scene.add(key);
    this.scene = scene; this._buildStars(); this._buildShooters(); this._buildNebula();   // deep-space FX
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
    el.addEventListener('pointerdown', e => { this._downXY = [e.clientX, e.clientY]; });
    el.addEventListener('pointerup', e => this._onPointerUp(e));
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
    if (hits.length) { let o = hits[0].object; while (o && o.userData.id === undefined && o.parent) o = o.parent; if (o && o.userData.id !== undefined) return this._select(o); }
    this._deselect();
  },
  _select(holder) { this._selected = holder; if (this.tcontrols) this.tcontrols.attach(holder); if (window.map3dSelect) window.map3dSelect(holder.userData.id); },
  _deselect() { this._selected = null; if (this.tcontrols) this.tcontrols.detach(); if (window.map3dSelect) window.map3dSelect(null); },

  // Gizmo edit → 2D schema. Holder transform: position=body center, scale.x*2=size, rotation=t3d.
  _writeBack() {
    const h = this._selected; if (!h || !this.tcontrols) return;
    const size = Math.max(8, Math.round(2 * h.scale.x));
    if (h.scale.y !== h.scale.x || h.scale.z !== h.scale.x) h.scale.setScalar(h.scale.x);   // keep bodies uniform
    const patch = {
      x: Math.round(h.position.x - h.scale.x),
      y: Math.round(-h.position.y - h.scale.x),
      size,
      t3d: { rx: +h.rotation.x.toFixed(4), ry: +h.rotation.y.toFixed(4), rz: +h.rotation.z.toFixed(4) }
    };
    if (window.map3dApply) window.map3dApply(h.userData.id, patch);
    this._applyLOD();   // scaling a body up/down promotes/demotes its 3D representation live
  },

  // Several star layers at different depths. Each follows the camera pan by its own `k` factor
  // (far layers follow more → move less on screen → read as distant), giving true 3D parallax on
  // pan; on orbit/tilt the real z-separation shows depth directly. Constant screen size (no
  // attenuation) keeps stars crisp and adds a depth cue on zoom too.
  _buildStars() {
    this._starLayers = [];
    const specs = [
      { n: 1100, z: -3200, size: 1.4, k: 0.72, bright: 0.5, spread: 9000 },  // far · tiny · dim
      { n: 620,  z: -1900, size: 2.2, k: 0.5,  bright: 0.72, spread: 7200 },
      { n: 300,  z: -1000, size: 3.4, k: 0.28, bright: 1.0,  spread: 5600 },  // near · bigger · bright
    ];
    for (const s of specs) {
      const pos = new Float32Array(s.n * 3), col = new Float32Array(s.n * 3);
      for (let i = 0; i < s.n; i++) {
        pos[i * 3] = (((i * 613) % 1000) / 1000 - 0.5) * s.spread;
        pos[i * 3 + 1] = (((i * 911) % 1000) / 1000 - 0.5) * s.spread;
        pos[i * 3 + 2] = s.z + (((i * 53) % 400) - 200);
        const t = ((i * 97) % 100) / 100; let cr = 0.82, cg = 0.87, cb = 1.0;
        if (t > 0.9) { cr = 1.0; cg = 0.82; cb = 0.62; }        // occasional warm star
        else if (t > 0.78) { cr = 0.68; cg = 0.82; cb = 1.0; }  // occasional cool-blue star
        const bness = s.bright * (0.55 + ((i * 31) % 100) / 100 * 0.5);
        col[i * 3] = cr * bness; col[i * 3 + 1] = cg * bness; col[i * 3 + 2] = cb * bness;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const m = new THREE.PointsMaterial({ size: s.size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
      const pts = new THREE.Points(g, m); pts.userData.k = s.k; pts.renderOrder = -10;
      this.scene.add(pts); this._starLayers.push(pts);
    }
  },
  _updateStars() {
    if (!this._starLayers) return;
    const t = this.controls.target;
    for (const L of this._starLayers) { L.position.x = t.x * L.userData.k; L.position.y = t.y * L.userData.k; }
  },

  // A small pool of colourful shooting stars — each a short additive line (bright head → clear tail)
  // that spawns occasionally and streaks off in a random direction, scaled to the current view.
  _buildShooters() {
    this._shooters = [];
    for (let i = 0; i < 7; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      line.visible = false; line.renderOrder = -5; line.frustumCulled = false;
      this.scene.add(line);
      this._shooters.push({ line, active: false, t: 0, life: 0, next: 0.8 + i * 0.9, pos: new THREE.Vector3(), vel: new THREE.Vector3(), color: new THREE.Color() });
    }
  },
  _updateShooters(dt) {
    if (!this._shooters) return;
    const cam = this.camera, tgt = this.controls.target, zoom = cam.zoom || 1;
    const viewW = (cam.right - cam.left) / zoom, viewH = (cam.top - cam.bottom) / zoom;
    const PAL = [[0.35, 1, 0.92], [1, 0.45, 0.85], [1, 0.85, 0.4], [0.6, 0.8, 1], [0.8, 1, 0.55], [1, 0.62, 0.35]];
    for (const s of this._shooters) {
      if (!s.active) {
        s.next -= dt;
        if (s.next <= 0) {
          s.active = true; s.t = 0; s.life = 0.55 + Math.random() * 0.7; s.line.visible = true;
          s.pos.set(tgt.x + (Math.random() - 0.5) * viewW * 0.9, tgt.y + (Math.random() - 0.5) * viewH * 0.9, -280 - Math.random() * 520);
          const ang = Math.random() * Math.PI * 2, speed = (viewW + viewH) * 0.5 * (0.7 + Math.random() * 0.7);
          s.vel.set(Math.cos(ang) * speed, Math.sin(ang) * speed, 0);
          const c = PAL[(Math.random() * PAL.length) | 0]; s.color.setRGB(c[0], c[1], c[2]);
        }
        continue;
      }
      s.t += dt; s.pos.addScaledVector(s.vel, dt);
      const frac = s.t / s.life;
      if (frac >= 1) { s.active = false; s.line.visible = false; s.next = 1.4 + Math.random() * 4.5; continue; }
      const tailLen = 0.11 * Math.hypot(s.vel.x, s.vel.y), inv = 1 / (Math.hypot(s.vel.x, s.vel.y) || 1);
      const tx = s.pos.x - s.vel.x * inv * tailLen, ty = s.pos.y - s.vel.y * inv * tailLen;
      const p = s.line.geometry.attributes.position, cA = s.line.geometry.attributes.color, fade = (1 - frac) * (frac < 0.15 ? frac / 0.15 : 1);
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
  _buildNebula() {
    this._nebula = []; this._nebT = 0;
    const cols = ['#6a3aaa', '#0ac8b9', '#c94f9a', '#4a86c9', '#7a4ad0'];
    const texes = [this._nebulaTexture(1234), this._nebulaTexture(5771), this._nebulaTexture(9091)];
    for (let i = 0; i < 5; i++) {
      const m = new THREE.SpriteMaterial({ map: texes[i % texes.length], color: new THREE.Color(cols[i % cols.length]), transparent: true, opacity: 0.22 + (i % 3) * 0.05, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
      m.rotation = i * 1.7;
      const sp = new THREE.Sprite(m); const scale = 4200 + i * 1300;
      sp.scale.set(scale, scale * 0.72, 1);
      const bx = ((i * 997) % 2000 - 1000) * 2.4, by = ((i * 613) % 2000 - 1000) * 1.9;
      sp.position.set(bx, by, -2300 - i * 240);
      sp.userData = { k: 0.6 + (i % 3) * 0.06, rot: (i % 2 ? 1 : -1) * 0.018, baseX: bx, baseY: by, phase: i * 1.3 };
      sp.renderOrder = -8;
      this.scene.add(sp); this._nebula.push(sp);
    }
  },
  _updateNebula(dt) {
    if (!this._nebula) return;
    this._nebT += dt; const t = this.controls.target;
    for (const sp of this._nebula) {
      const u = sp.userData;
      sp.material.rotation += u.rot * dt;
      sp.position.x = t.x * u.k + u.baseX + Math.sin(this._nebT * 0.05 + u.phase) * 130;
      sp.position.y = t.y * u.k + u.baseY + Math.cos(this._nebT * 0.04 + u.phase) * 110;
    }
  },

  // Push the current map into the scene.
  setData(map) { this._map = map || { instances: [] }; if (this._ready) this._rebuild(); },

  // Resolve a planet3d instance's saved config — from the instance's look, or its source asset.
  _planetConfig(it) {
    if (it.look && it.look.cfg3d) return it.look.cfg3d;
    const assets = (this._map && this._map.assets) || [];
    const a = assets.find(x => x.id === it.assetId);
    return (a && (a.cfg3d || a.config)) || null;
  },

  _rebuild() {
    const g = this.bodyGroup; if (!g) return;
    if (this.tcontrols) this.tcontrols.detach();
    this._selected = null;
    (this._planets || []).forEach(p => p.model.dispose());
    this._planets = [];
    for (let i = g.children.length - 1; i >= 0; i--) { const c = g.children[i]; g.remove(c); c.traverse?.(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); }
    const cs = this.cssScene; if (cs) { while (cs.children.length) cs.remove(cs.children[0]); }
    const insts = (this._map && this._map.instances) || [];
    const aniso = this.renderer.capabilities.getMaxAnisotropy();
    this._bodies = [];
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const it of insts) {
      if (it.kind === 'text') { this._addText(it); minX = Math.min(minX, it.x); minY = Math.min(minY, it.y); maxX = Math.max(maxX, it.x); maxY = Math.max(maxY, it.y); continue; }
      if (it.kind === 'html') { this._addHtml(it); minX = Math.min(minX, it.x); minY = Math.min(minY, it.y); maxX = Math.max(maxX, it.x); maxY = Math.max(maxY, it.y); continue; }
      const s = it.size || 60, cx = it.x + s / 2, cy = it.y + s / 2;
      // Every body lives in a holder whose transform IS its 2D transform: position = centre,
      // scale·2 = size, rotation = t3d. This lets one gizmo move/scale/rotate any body uniformly.
      const holder = new THREE.Group();
      holder.position.set(cx, -cy, 0);
      holder.scale.setScalar(Math.max(4, s / 2));
      if (it.t3d) holder.rotation.set(it.t3d.rx || 0, it.t3d.ry || 0, it.t3d.rz || 0);
      holder.userData.id = it.id;
      const imgUrl = it.kind === 'image' && it.look ? (it.look.src || it.look.image) : null;
      const cfg = it.kind === 'planet3d' ? this._planetConfig(it) : null;
      // Every body starts as a cheap disc impostor; _applyLOD() promotes the large ones on-screen to
      // full 3D meshes. Unlimited impostors → a whole system fits; only a few big ones cost a mesh.
      let disc = null;
      if (imgUrl) holder.add(this._imagePlane(it, imgUrl));
      else { disc = this._discMesh(it); holder.add(disc); }
      g.add(holder);
      this._bodies.push({ holder, it, disc, isStar: it.kind === 'star', cfg, canFull: !imgUrl && (it.kind === 'star' || !!cfg), hasModel: false, model: null });
      minX = Math.min(minX, it.x); minY = Math.min(minY, it.y); maxX = Math.max(maxX, it.x + s); maxY = Math.max(maxY, it.y + s);
    }
    // Framing needs the container's real pixel size, which is only correct once it's visible; store
    // the bounds and (re)frame from show(). Framing here while hidden gives a degenerate zoom.
    this._bounds = (insts.length && minX < maxX) ? { minX, minY, maxX, maxY } : null;
    if (this._bounds && this._shown) { this._frameBounds(); this._applyLOD(); }
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
  _promote(b, aniso) {
    try {
      const model = b.isStar ? buildStarModel(b.it.look || {}, { anisotropy: aniso }) : buildPlanetModel(b.cfg, { anisotropy: aniso, segments: 64 });
      if (b.disc) b.holder.remove(b.disc);
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

  _discMesh(it) {   // a unit-radius flat disc (holder scales it to size)
    const col = (it.look && (it.look.c1 || it.look.c3)) || '#8f9bd0';
    return new THREE.Mesh(new THREE.CircleGeometry(1, 56), new THREE.MeshBasicMaterial({ color: new THREE.Color(col) }));
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
  _imagePlane(it, url) {
    const nw = (it.look && (it.look.natW || it.look.w)) || 1, nh = (it.look && (it.look.natH || it.look.h)) || 1;
    const ar = nw / nh; let pw = 2, ph = 2; if (ar >= 1) ph = 2 / ar; else pw = 2 * ar;
    const mat = new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, color: 0x222b3a });
    new THREE.TextureLoader().load(url, tex => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy(); mat.map = tex; mat.color.setHex(0xffffff); mat.needsUpdate = true; }, undefined, () => { /* keep the placeholder tint on load error */ });
    return new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
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
    this._frameBounds();   // now the container has real pixel dimensions, so the fit is correct
    this._applyLOD();      // pick full-mesh vs impostor for the current zoom
    const sun = new THREE.Vector3(1, 1, 2).normalize();
    let last = performance.now();
    const loop = (t) => {
      if (!this._shown) return;
      this._raf = requestAnimationFrame(loop);
      const now = t || performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
      for (const p of this._planets) p.model.update(dt, sun);   // live planets spin in real time
      this.controls.update();
      if (Math.abs(this.camera.zoom - (this._lodZoom || 0)) > (this._lodZoom || 1) * 0.04) this._applyLOD();   // re-LOD on zoom
      this._updateStars();                                       // parallax follows the pan
      this._updateShooters(dt);                                  // colourful meteors
      this._updateNebula(dt);                                    // drifting gas clouds
      this.renderer.render(this.scene, this.camera);
      if (this.cssRenderer) this.cssRenderer.render(this.cssScene, this.camera);
    };
    if (!this._raf) loop(last);
  },

  hide() {
    this._shown = false;
    if (this.tcontrols) this.tcontrols.detach();
    this._selected = null;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    if (this.container) this.container.style.display = 'none';
  },

  isShown() { return this._shown; }
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

  btn.addEventListener('click', async () => {
    if (Map3D.isShown()) {
      Map3D.hide(); show2d(); btn.classList.remove('aether'); btn.textContent = '⛶ 3D';
      return;
    }
    btn.textContent = '⛶ loading…'; btn.disabled = true;
    const ok = await Map3D.mount(gl);
    btn.disabled = false;
    if (!ok) { btn.textContent = '⛶ 3D'; if (window.toast) window.toast('3D engine unavailable'); return; }
    Map3D.setData(typeof window.mapData === 'function' ? window.mapData() : { instances: [] });
    hide2d(); Map3D.show(); btn.classList.add('aether'); btn.textContent = '▢ 2D';
  });
})();
