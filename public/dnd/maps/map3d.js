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
let THREE = null, OrbitControls = null, TransformControls = null, CSS3DRenderer = null, CSS3DObject = null, buildPlanetModel = null;

async function loadThree() {
  if (THREE) return;
  THREE = await import('three');
  ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
  ({ TransformControls } = await import('three/addons/controls/TransformControls.js'));
  ({ CSS3DRenderer, CSS3DObject } = await import('three/addons/renderers/CSS3DRenderer.js'));
  ({ buildPlanetModel } = await import('/dnd/maps/planet3d-model.js'));
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
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    renderer.setClearColor(NAVY, 1);
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
    container.appendChild(renderer.domElement);

    const hint = document.createElement('div');
    hint.textContent = 'Click a body to select · G move · R rotate · S scale · Esc deselect · drag pan · wheel zoom · right-drag tilt';
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
    scene.add(this._starfield());
    const bodyGroup = new THREE.Group(); scene.add(bodyGroup);

    // Move/rotate/scale gizmo — grab, move, resize and rotate objects; writes back to the 2D map.
    const tc = new TransformControls(cam, renderer.domElement);
    tc.setSize(0.9);
    tc.addEventListener('dragging-changed', e => { controls.enabled = !e.value; });
    tc.addEventListener('mouseDown', () => { if (window.map3dBeginEdit) window.map3dBeginEdit(); });
    tc.addEventListener('objectChange', () => this._writeBack());
    scene.add(tc);

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
      if (!this._shown) return;
      const k = e.key.toLowerCase();
      if (k === 'g') tc.setMode('translate'); else if (k === 'r') tc.setMode('rotate'); else if (k === 's') tc.setMode('scale');
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
    if (moved > 4 || this.tcontrols.dragging) return;   // that was a pan / gizmo drag, not a pick
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this._ray.setFromCamera(ndc, this.camera);
    const hits = this._ray.intersectObjects(this.bodyGroup.children, true);
    if (hits.length) { let o = hits[0].object; while (o && o.userData.id === undefined && o.parent) o = o.parent; if (o && o.userData.id !== undefined) return this._select(o); }
    this._deselect();
  },
  _select(holder) { this._selected = holder; this.tcontrols.attach(holder); if (window.map3dSelect) window.map3dSelect(holder.userData.id); },
  _deselect() { this._selected = null; this.tcontrols.detach(); if (window.map3dSelect) window.map3dSelect(null); },

  // Gizmo edit → 2D schema. Holder transform: position=body center, scale.x*2=size, rotation=t3d.
  _writeBack() {
    const h = this._selected; if (!h) return;
    const size = Math.max(8, Math.round(2 * h.scale.x));
    if (h.scale.y !== h.scale.x || h.scale.z !== h.scale.x) h.scale.setScalar(h.scale.x);   // keep bodies uniform
    const patch = {
      x: Math.round(h.position.x - h.scale.x),
      y: Math.round(-h.position.y - h.scale.x),
      size,
      t3d: { rx: +h.rotation.x.toFixed(4), ry: +h.rotation.y.toFixed(4), rz: +h.rotation.z.toFixed(4) }
    };
    if (window.map3dApply) window.map3dApply(h.userData.id, patch);
  },

  _starfield() {
    const n = 1800, pos = new Float32Array(n * 3);
    // deterministic-ish spread (avoid Math.random dependence on determinism concerns — fine here)
    for (let i = 0; i < n; i++) {
      const r = 6000 + (i % 37) * 60, t = (i * 2.399963), ph = Math.acos(((i * 977) % 2000) / 1000 - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(t);
      pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(t);
      pos[i * 3 + 2] = -Math.abs(r * Math.cos(ph)) - 1500;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbcd4ff, size: 7, sizeAttenuation: true, transparent: true, opacity: 0.7 }));
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
    let live = 0, minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
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
      if (imgUrl) {
        holder.add(this._imagePlane(it, imgUrl));                 // inserted picture on a flat plane
      } else if (cfg && live < MAX_LIVE_PLANETS) {
        try {
          const model = buildPlanetModel(cfg, { anisotropy: aniso, segments: 72 });   // unit radius
          holder.add(model.group);
          this._planets.push({ model });
          live++;
        } catch (e) { console.error('[map3d] planet build failed', e); holder.add(this._discMesh(it)); }
      } else {
        holder.add(this._discMesh(it));
      }
      g.add(holder);
      minX = Math.min(minX, it.x); minY = Math.min(minY, it.y); maxX = Math.max(maxX, it.x + s); maxY = Math.max(maxY, it.y + s);
    }
    // Framing needs the container's real pixel size, which is only correct once it's visible; store
    // the bounds and (re)frame from show(). Framing here while hidden gives a degenerate zoom.
    this._bounds = (insts.length && minX < maxX) ? { minX, minY, maxX, maxY } : null;
    if (this._bounds && this._shown) this._frameBounds();
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
    const sun = new THREE.Vector3(1, 1, 2).normalize();
    let last = performance.now();
    const loop = (t) => {
      if (!this._shown) return;
      this._raf = requestAnimationFrame(loop);
      const now = t || performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
      for (const p of this._planets) p.model.update(dt, sun);   // live planets spin in real time
      this.controls.update();
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
  const LAYERS = ['bgLayer', 'svg', 'bodyLayer', 'fxCanvas', 'labelLayer'];
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
