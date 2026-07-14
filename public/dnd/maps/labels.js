/* ============================================================================
   labels.js — shared rich-text label engine for the Stardust map suite.
   Included (classic <script src>) by BOTH map-studio.html and console.html so
   the DM's formatting and the player's view render identically. Exposes globals:

     LABEL_FONTS, LABEL_FONT_STACK(id)
     DEFAULT_LABEL_STYLE, mergeLabelStyle(style)
     labelSVG(text, style)  -> { g, w, h }   // an SVG <g> string centered on (0,0)
     labelControlsHTML(style, p)              // inspector UI markup (studio only)
     wireLabelControls(p, style, onChange)    // wires that UI back to `style`

   A label renders as SVG so every requested effect is achievable: different
   fonts/sizes/weights, colors, letter-spacing, UPPERCASE, multi-line WRAP,
   CURVE (arc via <textPath>), ROTATE, plus outline / glow / shadow effects and
   an optional background plate. The returned <g> is anchored at local (0,0):
   callers translate it to the object's label point; text flows downward from
   there (top-anchored), horizontally per `align`. dx/dy and rotate are applied
   inside the group and pivot on that anchor.
   ============================================================================ */
(function (root) {
  'use strict';

  // Curated, on-theme font set. Stacks fall back to system fonts when the web
  // font can't load (offline / proxy) — formatting still applies.
  var LABEL_FONTS = [
    { id: 'Cinzel',        label: 'Cinzel — engraved serif',   stack: "'Cinzel', Georgia, serif" },
    { id: 'Orbitron',      label: 'Orbitron — techno',         stack: "'Orbitron', system-ui, sans-serif" },
    { id: 'Rajdhani',      label: 'Rajdhani — clean sans',     stack: "'Rajdhani', system-ui, sans-serif" },
    { id: 'Audiowide',     label: 'Audiowide — sci-fi',        stack: "'Audiowide', system-ui, sans-serif" },
    { id: 'Michroma',      label: 'Michroma — wide futura',    stack: "'Michroma', system-ui, sans-serif" },
    { id: 'Cormorant',     label: 'Cormorant — elegant serif', stack: "'Cormorant Garamond', Georgia, serif" },
    { id: 'Caveat',        label: 'Caveat — handwritten',      stack: "'Caveat', 'Segoe Script', cursive" },
    { id: 'ShareTechMono', label: 'Share Tech Mono — console', stack: "'Share Tech Mono', ui-monospace, monospace" },
    { id: 'System',        label: 'System sans',               stack: "system-ui, -apple-system, sans-serif" },
    { id: 'Serif',         label: 'System serif',              stack: "Georgia, 'Times New Roman', serif" }
  ];
  function LABEL_FONT_STACK(id) {
    for (var i = 0; i < LABEL_FONTS.length; i++) if (LABEL_FONTS[i].id === id) return LABEL_FONTS[i].stack;
    return LABEL_FONTS[0].stack;
  }

  var DEFAULT_LABEL_STYLE = {
    show: true,
    font: 'Cinzel', size: 16, weight: 600, italic: false, color: '#f0e6d2',
    tracking: 0.5, uppercase: false, align: 'middle', opacity: 1, lineHeight: 1.18,
    wrap: 0,            // max line width in world px (0 = no auto-wrap; "\n" always breaks)
    curve: 0,           // -100..100 arc amount (0 = straight); positive = arch up
    rotate: 0,          // degrees
    outline: 0, outlineColor: '#010a13',      // stroke halo width (px)
    glow: 0, glowColor: '#0ac8b9',            // glow radius (px), color independent of the font
    pulse: false, pulseSpeed: 1.6,            // animate the glow (or opacity) so the label breathes
    shadow: true,                              // soft drop shadow
    plate: false, plateColor: '#0b1a2c', plateOpacity: 0.7,
    dx: 0, dy: 0
  };
  function mergeLabelStyle(s) {
    var out = {}; for (var k in DEFAULT_LABEL_STYLE) out[k] = DEFAULT_LABEL_STYLE[k];
    if (s) for (var j in s) if (s[j] !== undefined && s[j] !== null) out[j] = s[j];
    return out;
  }

  // ---- helpers ----------------------------------------------------------------
  var _mc = null;
  function measureCtx() { if (!_mc) { var c = (root.document ? root.document.createElement('canvas') : null); _mc = c ? c.getContext('2d') : null; } return _mc; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var _uidn = 0;
  function uid() { _uidn++; return 'lbl' + _uidn.toString(36); }
  function fontShorthand(st) { return (st.italic ? 'italic ' : '') + (st.weight || 600) + ' ' + (st.size || 16) + "px " + LABEL_FONT_STACK(st.font); }

  function measure(text, st) {
    var ctx = measureCtx();
    if (!ctx) return text.length * (st.size || 16) * 0.55;   // headless fallback estimate
    ctx.font = fontShorthand(st);
    var w = ctx.measureText(text).width;
    // canvas measureText ignores letter-spacing; approximate it
    if (st.tracking) w += Math.max(0, text.length - 1) * st.tracking;
    return w;
  }

  // Split into display lines: honor explicit "\n", then greedy word-wrap to `wrap`.
  function layoutLines(text, st) {
    var paras = String(text == null ? '' : text).split('\n');
    if (!st.wrap || st.wrap <= 0) return paras;
    var lines = [];
    for (var p = 0; p < paras.length; p++) {
      var words = paras[p].split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(''); continue; }
      var cur = words[0];
      for (var i = 1; i < words.length; i++) {
        var test = cur + ' ' + words[i];
        if (measure(test, st) <= st.wrap) cur = test;
        else { lines.push(cur); cur = words[i]; }
      }
      lines.push(cur);
    }
    return lines;
  }

  // Circular arc path through (-w/2,0) and (w/2,0) with a signed sagitta.
  function arcPath(w, curve) {
    var s = (curve / 100) * Math.min(w * 0.6, 500);   // signed rise in px
    var half = w / 2;
    if (Math.abs(s) < 0.6 || w < 2) return { d: 'M ' + (-half) + ' 0 L ' + half + ' 0', flat: true };
    var as = Math.abs(s);
    var R = (as / 2) + (w * w) / (8 * as);
    // apex sits above (y<0) for curve>0 → sweep so the arc bulges toward the apex
    var sweep = s > 0 ? 1 : 0;
    return { d: 'M ' + (-half).toFixed(2) + ' 0 A ' + R.toFixed(2) + ' ' + R.toFixed(2) + ' 0 0 ' + sweep + ' ' + half.toFixed(2) + ' 0', flat: false, rise: s };
  }

  /* Build a label group. Returns { g, w, h }. */
  function labelSVG(text, style) {
    var st = mergeLabelStyle(style);
    var raw = st.uppercase ? String(text == null ? '' : text).toUpperCase() : String(text == null ? '' : text);
    if (st.show === false || raw.trim() === '') return { g: '', w: 0, h: 0 };

    var id = uid();
    var anchor = st.align === 'left' ? 'start' : st.align === 'right' ? 'end' : (st.align || 'middle');
    var textAnchor = anchor === 'start' ? 'start' : anchor === 'end' ? 'end' : 'middle';
    var common =
      ' font-family="' + LABEL_FONT_STACK(st.font).replace(/"/g, '&quot;') + '"' +
      ' font-size="' + st.size + '"' +
      ' font-weight="' + (st.weight || 600) + '"' +
      (st.italic ? ' font-style="italic"' : '') +
      ' letter-spacing="' + (st.tracking || 0) + '"' +
      ' fill="' + st.color + '"';

    // effects → CSS filter on the text (drop-shadow glow, independently colored, animatable for
    // pulse); outline is a paint-order stroke halo. Font color and effect colors are independent.
    var shadowFilter = st.shadow ? 'drop-shadow(0 1px 1.4px rgba(0,0,0,0.85))' : '';
    var filters = [];
    if (st.shadow) filters.push('drop-shadow(0 1px 1.4px rgba(0,0,0,0.85))');
    var animCss = '', animRule = '';
    if (st.glow && st.glow > 0) {
      var g = st.glow, gc = st.glowColor;
      filters.push('drop-shadow(0 0 ' + g + 'px ' + gc + ')');
      filters.push('drop-shadow(0 0 ' + (g * 0.5).toFixed(1) + 'px ' + gc + ')');
      if (st.pulse) {
        var an = 'plz' + id, spd = st.pulseSpeed || 1.6, sp = shadowFilter ? shadowFilter + ' ' : '';
        var dim = sp + 'drop-shadow(0 0 ' + (g * 0.5).toFixed(1) + 'px ' + gc + ')';
        var bright = sp + 'drop-shadow(0 0 ' + (g * 1.9).toFixed(1) + 'px ' + gc + ') drop-shadow(0 0 ' + (g * 1.0).toFixed(1) + 'px ' + gc + ')';
        animCss = '<style>@keyframes ' + an + '{0%,100%{filter:' + dim + ';}50%{filter:' + bright + ';}}</style>';
        animRule = 'animation:' + an + ' ' + spd + 's ease-in-out infinite';
      }
    } else if (st.pulse) {
      // pulse with no glow → gentle opacity breathe
      var an2 = 'plo' + id, spd2 = st.pulseSpeed || 1.6;
      animCss = '<style>@keyframes ' + an2 + '{0%,100%{opacity:1;}50%{opacity:0.45;}}</style>';
      animRule = 'animation:' + an2 + ' ' + spd2 + 's ease-in-out infinite';
    }
    var styleParts = [];
    if (st.outline && st.outline > 0) styleParts.push('paint-order:stroke');
    if (filters.length) styleParts.push('filter:' + filters.join(' '));
    if (animRule) styleParts.push(animRule);
    var styleAttr = styleParts.length ? ' style="' + styleParts.join(';') + '"' : '';
    var outlineAttr = (st.outline && st.outline > 0)
      ? ' stroke="' + st.outlineColor + '" stroke-width="' + (st.outline * 2) + '" stroke-linejoin="round"'
      : '';

    var body, w, h, defs = '';
    if (st.curve && st.curve !== 0) {
      // curved → single line following an arc
      var line = raw.replace(/\n/g, ' ');
      w = measure(line, st);
      var arc = arcPath(w, st.curve);
      h = st.size * 1.3 + Math.abs(arc.rise || 0);
      defs = '<defs><path id="p' + id + '" d="' + arc.d + '"/></defs>';
      body = animCss + '<text' + common + outlineAttr + styleAttr + ' dominant-baseline="middle">' +
                '<textPath href="#p' + id + '" xlink:href="#p' + id + '" startOffset="50%" text-anchor="middle">' + esc(line) + '</textPath>' +
             '</text>';
    } else {
      var lines = layoutLines(raw, st);
      var lh = (st.lineHeight || 1.18) * st.size;
      w = 0; for (var i = 0; i < lines.length; i++) w = Math.max(w, measure(lines[i], st));
      h = lines.length * lh;
      var tspans = '';
      for (var j = 0; j < lines.length; j++) {
        var dy = j === 0 ? st.size * 0.82 : lh;
        tspans += '<tspan x="0" dy="' + dy.toFixed(2) + '">' + (lines[j] === '' ? '&#8203;' : esc(lines[j])) + '</tspan>';
      }
      body = animCss + '<text' + common + outlineAttr + styleAttr + ' text-anchor="' + textAnchor + '">' + tspans + '</text>';
    }

    // optional background plate (straight text only)
    var plate = '';
    if (st.plate && !(st.curve && st.curve !== 0)) {
      var padX = st.size * 0.55, padY = st.size * 0.35;
      var px = anchor === 'start' ? -padX : anchor === 'end' ? -(w + padX) : -(w / 2 + padX);
      plate = '<rect x="' + px.toFixed(1) + '" y="' + (-padY).toFixed(1) + '" width="' + (w + padX * 2).toFixed(1) +
              '" height="' + (h + padY * 2).toFixed(1) + '" rx="' + (st.size * 0.3).toFixed(1) +
              '" fill="' + st.plateColor + '" fill-opacity="' + st.plateOpacity + '"/>';
    }

    var inner = defs + plate + body;
    var xform = 'translate(' + (st.dx || 0) + ',' + (st.dy || 0) + ')' + (st.rotate ? ' rotate(' + st.rotate + ')' : '');
    var g = '<g transform="' + xform + '" opacity="' + (st.opacity != null ? st.opacity : 1) + '">' + inner + '</g>';
    return { g: g, w: w, h: h };
  }

  /* ---- shared inspector UI (used by the studio; harmless if unused) ---------- */
  function labelControlsHTML(style, p) {
    var st = mergeLabelStyle(style);
    var fontOpts = LABEL_FONTS.map(function (f) { return '<option value="' + f.id + '"' + (st.font === f.id ? ' selected' : '') + '>' + f.label + '</option>'; }).join('');
    var alignOpts = [['start', 'Left'], ['middle', 'Center'], ['end', 'Right']].map(function (a) { return '<option value="' + a[0] + '"' + (st.align === a[0] ? ' selected' : '') + '>' + a[1] + '</option>'; }).join('');
    function slider(idp, lab, min, max, val, suffix) {
      return '<div class="field"><label>' + lab + ' <span style="float:right;color:var(--gold)" id="' + p + idp + 'V">' + val + (suffix || '') + '</span></label><div class="slider"><input type="range" id="' + p + idp + '" min="' + min + '" max="' + max + '" value="' + val + '"></div></div>';
    }
    return '' +
      '<label class="chk"><input type="checkbox" id="' + p + 'Show"' + (st.show ? ' checked' : '') + '> Show label on map</label>' +
      '<div class="field"><label>Font</label><select id="' + p + 'Font">' + fontOpts + '</select></div>' +
      '<div class="rowc"><div class="field"><label>Color</label><input type="color" id="' + p + 'Color" value="' + st.color + '"></div>' +
        '<div class="field"><label>Align</label><select id="' + p + 'Align">' + alignOpts + '</select></div></div>' +
      slider('Size', 'Size', 8, 90, st.size, 'px') +
      slider('Weight', 'Weight', 300, 900, st.weight) +
      slider('Track', 'Letter-spacing', -2, 20, st.tracking, 'px') +
      '<label class="chk"><input type="checkbox" id="' + p + 'Italic"' + (st.italic ? ' checked' : '') + '> Italic</label>' +
      '<label class="chk"><input type="checkbox" id="' + p + 'Upper"' + (st.uppercase ? ' checked' : '') + '> UPPERCASE</label>' +
      '<h4>Shape</h4>' +
      slider('Wrap', 'Wrap width (0 = off)', 0, 600, st.wrap, 'px') +
      slider('Curve', 'Curve', -100, 100, st.curve) +
      slider('Rotate', 'Rotate', -180, 180, st.rotate, '°') +
      '<h4>Effects</h4>' +
      slider('Outline', 'Outline', 0, 8, st.outline, 'px') +
      '<div class="field" style="margin:2px 0 8px"><label>Outline color</label><input type="color" id="' + p + 'OutlineC" value="' + st.outlineColor + '"></div>' +
      slider('Glow', 'Glow', 0, 12, st.glow, 'px') +
      '<div class="field" style="margin:2px 0 8px"><label>Glow color</label><input type="color" id="' + p + 'GlowC" value="' + st.glowColor + '"></div>' +
      '<label class="chk"><input type="checkbox" id="' + p + 'Pulse"' + (st.pulse ? ' checked' : '') + '> ✦ Pulse (animated glow)</label>' +
      slider('PulseSpd', 'Pulse speed', 4, 60, Math.round(st.pulseSpeed * 10), '') +
      '<label class="chk"><input type="checkbox" id="' + p + 'Shadow"' + (st.shadow ? ' checked' : '') + '> Drop shadow</label>' +
      '<label class="chk"><input type="checkbox" id="' + p + 'Plate"' + (st.plate ? ' checked' : '') + '> Background plate</label>' +
      '<div class="field" style="margin:2px 0 8px"><label>Plate color</label><input type="color" id="' + p + 'PlateC" value="' + st.plateColor + '"></div>' +
      '<div class="rowc"><div class="field"><label>Offset X</label><input type="number" id="' + p + 'Dx" value="' + (st.dx || 0) + '"></div>' +
        '<div class="field"><label>Offset Y</label><input type="number" id="' + p + 'Dy" value="' + (st.dy || 0) + '"></div></div>';
  }

  function wireLabelControls(p, style, onChange) {
    var doc = root.document; if (!doc) return;
    var $ = function (id) { return doc.getElementById(p + id); };
    function on(el, ev, fn) { if (el) el[ev] = fn; }
    function num(id, key, disp, suffix) { var el = $(id); on(el, 'oninput', function (e) { style[key] = +e.target.value; var v = $(disp || (id + 'V')); if (v) v.textContent = (+e.target.value) + (suffix || ''); onChange(); }); }
    on($('Show'), 'onchange', function (e) { style.show = e.target.checked; onChange(); });
    on($('Font'), 'onchange', function (e) { style.font = e.target.value; onChange(); });
    on($('Color'), 'oninput', function (e) { style.color = e.target.value; onChange(); });
    on($('Align'), 'onchange', function (e) { style.align = e.target.value; onChange(); });
    num('Size', 'size', 'SizeV', 'px'); num('Weight', 'weight', 'WeightV', ''); num('Track', 'tracking', 'TrackV', 'px');
    on($('Italic'), 'onchange', function (e) { style.italic = e.target.checked; onChange(); });
    on($('Upper'), 'onchange', function (e) { style.uppercase = e.target.checked; onChange(); });
    num('Wrap', 'wrap', 'WrapV', 'px'); num('Curve', 'curve', 'CurveV', ''); num('Rotate', 'rotate', 'RotateV', '°');
    num('Outline', 'outline', 'OutlineV', 'px'); on($('OutlineC'), 'oninput', function (e) { style.outlineColor = e.target.value; onChange(); });
    num('Glow', 'glow', 'GlowV', 'px'); on($('GlowC'), 'oninput', function (e) { style.glowColor = e.target.value; onChange(); });
    on($('Pulse'), 'onchange', function (e) { style.pulse = e.target.checked; onChange(); });
    on($('PulseSpd'), 'oninput', function (e) { style.pulseSpeed = (+e.target.value) / 10; var v = $('PulseSpdV'); if (v) v.textContent = style.pulseSpeed.toFixed(1); onChange(); });
    on($('Shadow'), 'onchange', function (e) { style.shadow = e.target.checked; onChange(); });
    on($('Plate'), 'onchange', function (e) { style.plate = e.target.checked; onChange(); });
    on($('PlateC'), 'oninput', function (e) { style.plateColor = e.target.value; onChange(); });
    on($('Dx'), 'oninput', function (e) { style.dx = +e.target.value; onChange(); });
    on($('Dy'), 'oninput', function (e) { style.dy = +e.target.value; onChange(); });
  }

  root.LABEL_FONTS = LABEL_FONTS;
  root.LABEL_FONT_STACK = LABEL_FONT_STACK;
  root.DEFAULT_LABEL_STYLE = DEFAULT_LABEL_STYLE;
  root.mergeLabelStyle = mergeLabelStyle;
  root.labelSVG = labelSVG;
  root.labelControlsHTML = labelControlsHTML;
  root.wireLabelControls = wireLabelControls;
})(typeof window !== 'undefined' ? window : this);
