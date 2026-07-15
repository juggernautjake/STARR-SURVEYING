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
let THREE = null, OrbitControls = null;

async function loadThree() {
  if (THREE) return;
  THREE = await import('three');
  ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
}

const NAVY = 0x010a13;

const Map3D = {
  _ready: false, _shown: false, _raf: null,
  container: null, renderer: null, scene: null, camera: null, controls: null,
  bodyGroup: null, _map: null, _ro: null,

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

    this.renderer = renderer; this.scene = scene; this.camera = cam; this.controls = controls; this.bodyGroup = bodyGroup;
    this._ready = true;

    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
    return true;
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

  _rebuild() {
    const g = this.bodyGroup; if (!g) return;
    for (let i = g.children.length - 1; i >= 0; i--) { const c = g.children[i]; g.remove(c); c.geometry?.dispose?.(); c.material?.dispose?.(); }
    const insts = (this._map && this._map.instances) || [];
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const it of insts) {
      if (it.kind === 'text') continue;                 // free text handled in a later slice
      const s = it.size || 60, cx = it.x + s / 2, cy = it.y + s / 2, rad = Math.max(4, s / 2);
      const col = (it.look && (it.look.c1 || it.look.c3)) || '#8f9bd0';
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(rad, 56),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(col) })
      );
      disc.position.set(cx, -cy, 0);
      disc.userData.id = it.id;
      g.add(disc);
      minX = Math.min(minX, it.x); minY = Math.min(minY, it.y); maxX = Math.max(maxX, it.x + s); maxY = Math.max(maxY, it.y + s);
    }
    // Framing needs the container's real pixel size, which is only correct once it's visible; store
    // the bounds and (re)frame from show(). Framing here while hidden gives a degenerate zoom.
    this._bounds = (insts.length && minX < maxX) ? { minX, minY, maxX, maxY } : null;
    if (this._bounds && this._shown) this._frameBounds();
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
    const H = 500, a = w / h;
    this.camera.left = -H * a; this.camera.right = H * a; this.camera.top = H; this.camera.bottom = -H;
    this.camera.updateProjectionMatrix();
  },

  show() {
    if (!this._ready) return;
    this._shown = true; this.container.style.display = 'block'; this.resize();
    this._frameBounds();   // now the container has real pixel dimensions, so the fit is correct
    const loop = () => { if (!this._shown) return; this._raf = requestAnimationFrame(loop); this.controls.update(); this.renderer.render(this.scene, this.camera); };
    if (!this._raf) loop();
  },

  hide() {
    this._shown = false;
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
