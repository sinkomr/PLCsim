/*
 * Scene registry + a small shared toolkit for the animated process scenes.
 *
 * A scene file calls
 *   PLC.registerScene('<id>', function create(host, api) { ...; return { update(dtMs), reset(), destroy() }; });
 *
 * api: out(addr) get(addr) set(addr, v) running() def message(text, level)
 * Addresses are always the MicroLogix-1000 style ones from scene-defs.js.
 *
 * PLC.sceneKit holds the shared bits: a DPR-aware canvas stage with its own
 * logical coordinate system, theme colours read from CSS custom properties,
 * an edge-preserving sensor helper, a message rate limiter and a few
 * drawing primitives (lamps, I/O tags, motors, valves).
 */
(function (g) {
  'use strict';
  const PLC = (g.PLC = g.PLC || {});

  PLC.SCENES = PLC.SCENES || {};
  PLC.registerScene = (id, create) => { PLC.SCENES[id] = create; };

  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const FALLBACK = {
    bg: '#ffffff', panel: '#f1f3f6', fg: '#1d2430', muted: '#8a94a3', accent: '#2563eb',
    on: '#16a34a', red: '#dc2626', amber: '#f59e0b', water: '#3b82f6',
  };

  // ---------- colour helpers ----------
  let normCtx = null;
  const rgbCache = new Map();
  function toRGB(color) {
    if (rgbCache.has(color)) return rgbCache.get(color);
    if (!normCtx) normCtx = document.createElement('canvas').getContext('2d');
    normCtx.fillStyle = '#000';
    normCtx.fillStyle = color;
    const s = normCtx.fillStyle;
    let rgb = [0, 0, 0];
    if (s[0] === '#') rgb = [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    else { const m = s.match(/[\d.]+/g); if (m) rgb = [+m[0], +m[1], +m[2]]; }
    if (rgbCache.size > 200) rgbCache.clear();
    rgbCache.set(color, rgb);
    return rgb;
  }
  function mix(a, b, t) {
    const A = toRGB(a), B = toRGB(b);
    const c = (i) => Math.round(A[i] + (B[i] - A[i]) * t);
    return `rgb(${c(0)},${c(1)},${c(2)})`;
  }
  function alpha(a, al) { const A = toRGB(a); return `rgba(${A[0]},${A[1]},${A[2]},${al})`; }
  function lum(a) { const A = toRGB(a); return (0.2126 * A[0] + 0.7152 * A[1] + 0.0722 * A[2]) / 255; }

  function readColors(el) {
    const cs = getComputedStyle(el);
    const c = {};
    for (const k in FALLBACK) c[k] = cs.getPropertyValue('--' + k).trim() || FALLBACK[k];
    c.dark = lum(c.bg) < 0.45;
    // derived tones
    c.line = mix(c.fg, c.bg, 0.35);          // equipment outlines
    c.soft = mix(c.muted, c.bg, 0.55);       // faint structure
    c.metal = mix(c.muted, c.panel, c.dark ? 0.55 : 0.45);
    c.metalDark = mix(c.muted, c.fg, 0.25);
    c.ground = mix(c.panel, c.fg, c.dark ? 0.06 : 0.04);
    return c;
  }

  // Labels grow a little when the scene is drawn small, so they stay readable.
  let fontBoost = 1;

  // ---------- stage ----------
  // A canvas that fills host's width and keeps a W×H logical coordinate system.
  function stage(host, W, H) {
    host.classList.add('scene-host');
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;width:100%;';
    const canvas = document.createElement('canvas');
    canvas.style.cssText = `display:block;width:100%;height:auto;aspect-ratio:${W}/${H};border-radius:6px;`;
    canvas.setAttribute('role', 'img');
    wrap.appendChild(canvas);
    const controls = document.createElement('div');
    controls.className = 'scene-controls';
    controls.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;align-items:center;';
    host.appendChild(wrap);
    host.appendChild(controls);
    const ctx = canvas.getContext('2d');
    let cssW = host.clientWidth || W;
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => { cssW = wrap.clientWidth || cssW; }) : null;
    if (ro) ro.observe(wrap);
    const cleanups = [];

    const st = {
      canvas, ctx, W, H, controls, colors: null,
      // Prepare the canvas for a frame. Returns the colour set.
      begin() {
        const dpr = Math.min(3, g.devicePixelRatio || 1);
        const w = Math.max(1, cssW || wrap.clientWidth || W);
        const pw = Math.round(w * dpr), ph = Math.round((w * H / W) * dpr);
        if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
        ctx.setTransform(pw / W, 0, 0, ph / H, 0, 0);
        fontBoost = Math.max(1, Math.min(1.22, (W * 0.82) / w));
        const C = (st.colors = readColors(host));
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = C.panel;
        ctx.fillRect(0, 0, W, H);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        return C;
      },
      button(label, fn, title) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'scene-btn';
        b.textContent = label;
        if (title) b.title = title;
        b.addEventListener('click', fn);
        controls.appendChild(b);
        return b;
      },
      // Toggle button (aria-pressed); returns {el, value}
      toggle(label, initial, fn, title) {
        const t = { value: !!initial };
        const b = st.button(label, () => { t.set(!t.value); if (fn) fn(t.value); }, title);
        b.classList.add('scene-toggle');
        t.el = b;
        t.set = (v) => {
          t.value = !!v;
          b.setAttribute('aria-pressed', String(t.value));
          b.classList.toggle('on', t.value);
          b.textContent = label + (t.value ? ': ON' : ': OFF');
        };
        t.set(t.value);
        return t;
      },
      onCleanup(fn) { cleanups.push(fn); },
      destroy() {
        if (ro) ro.disconnect();
        for (const fn of cleanups) try { fn(); } catch (e) { /* ignore */ }
        host.innerHTML = '';
        host.classList.remove('scene-host');
      },
    };
    return st;
  }

  // ---------- sensors ----------
  // The PLC only sees the input value that is present at the end of each
  // animation frame, and a frame can cover up to ~250 ms of simulated time.
  // sense() is called at every physics sub-step; flush() at the end of the
  // frame reports at most one queued transition per frame, so no edge (and no
  // gap between two pulses) is ever lost, however long the frame.
  function Sensor(api, addr, initial) {
    this.api = api; this.addr = addr;
    this.force(initial);
  }
  Sensor.prototype.sense = function (v) {
    v = v ? 1 : 0;
    if (v !== this.phys) {
      this.phys = v;
      this.q.push(v);
      if (this.q.length > 6) this.q.splice(0, 2);
    }
  };
  Sensor.prototype.flush = function () {
    if (this.q.length) this.rep = this.q.shift();
    this.api.set(this.addr, this.rep); // re-assert every frame (host may reload inputs)
  };
  Sensor.prototype.force = function (v) {
    this.phys = this.rep = v ? 1 : 0;
    this.q = [];
    this.api.set(this.addr, this.rep);
  };
  Object.defineProperty(Sensor.prototype, 'value', { get() { return this.rep; } });

  // ---------- messages ----------
  function messenger(api, gapMs) {
    const last = new Map();
    return function say(text, level, key) {
      const k = key || text;
      const now = (g.performance && performance.now()) || Date.now();
      if (last.has(k) && now - last.get(k) < (gapMs || 4000)) return;
      last.set(k, now);
      if (api.message) api.message(text, level || 'info');
    };
  }

  // Run fn(stepMs) in sub-steps no longer than maxStep.
  function substep(dtMs, maxStep, fn) {
    if (!(dtMs > 0)) return;
    const n = Math.max(1, Math.ceil(dtMs / maxStep));
    const h = dtMs / n;
    for (let i = 0; i < n; i++) fn(h);
  }

  // ---------- drawing ----------
  function font(size, weight) { return `${weight || 400} ${(size * fontBoost).toFixed(2)}px ${FONT}`; }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function text(ctx, s, x, y, o) {
    o = o || {};
    ctx.font = font(o.size || 11, o.weight || 400);
    ctx.fillStyle = o.color || '#000';
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.baseline || 'middle';
    ctx.fillText(s, x, y);
    return ctx.measureText(s).width;
  }
  // "O:0/0 FILL" style tag: address in accent, name in fg. align: left|right|center
  function tag(ctx, C, x, y, addr, name, o) {
    o = o || {};
    const size = o.size || 10, bs = size * fontBoost;
    ctx.font = font(size, 700);
    const wa = ctx.measureText(addr).width;
    ctx.font = font(size, 500);
    const wn = name ? ctx.measureText(' ' + name).width : 0;
    const total = wa + wn;
    let x0 = x;
    if (o.align === 'right') x0 = x - total;
    else if (o.align === 'center') x0 = x - total / 2;
    if (o.bg !== false) {
      ctx.fillStyle = alpha(C.panel, 0.85);
      rr(ctx, x0 - 3, y - bs * 0.75, total + 6, bs * 1.5, 3);
      ctx.fill();
    }
    text(ctx, addr, x0, y, { size, weight: 700, color: o.addrColor || C.accent });
    if (name) text(ctx, ' ' + name, x0 + wa, y, { size, weight: 500, color: o.color || C.fg });
    return total;
  }
  // Pilot light
  function lamp(ctx, C, x, y, r, on, color) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2);
    ctx.fillStyle = C.metal; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = C.line; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (on) {
      ctx.shadowColor = color; ctx.shadowBlur = r * 1.8;
      ctx.fillStyle = color; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
    } else {
      ctx.fillStyle = mix(color, C.dark ? '#111' : '#777', 0.72); ctx.fill();
    }
    ctx.restore();
  }
  // End view of an electric motor with a spinning cooling fan.
  function motor(ctx, C, x, y, r, angle, energised, o) {
    o = o || {};
    ctx.save();
    // feet
    ctx.fillStyle = C.metalDark;
    rr(ctx, x - r * 0.95, y + r * 0.78, r * 1.9, r * 0.28, 3); ctx.fill();
    // fins
    ctx.fillStyle = C.metal; ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      rr(ctx, -r * 0.07, -r * 1.08, r * 0.14, r * 0.3, 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(x, y, r * 0.93, 0, Math.PI * 2);
    ctx.fillStyle = C.metal; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = energised ? C.on : C.line; ctx.stroke();
    if (energised) {
      ctx.save(); ctx.shadowColor = C.on; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(x, y, r * 0.93, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    // fan cowl
    ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
    ctx.fillStyle = C.dark ? mix(C.panel, '#000', 0.35) : mix(C.panel, C.fg, 0.12); ctx.fill();
    // blades
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.fillStyle = o.bladeColor || C.accent;
    for (let i = 0; i < 5; i++) {
      ctx.rotate((Math.PI * 2) / 5);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(r * 0.35, -r * 0.2, r * 0.66, -r * 0.08);
      ctx.quadraticCurveTo(r * 0.5, r * 0.18, 0, 0);
      ctx.fill();
    }
    ctx.restore();
    // guard rings
    ctx.strokeStyle = alpha(C.fg, 0.25); ctx.lineWidth = 1;
    for (const k of [0.3, 0.5, 0.7]) { ctx.beginPath(); ctx.arc(x, y, r * k, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(x, y, r * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = C.metalDark; ctx.fill();
    ctx.restore();
  }
  // Pipe valve (bow-tie) with actuator; horizontal pipe through (x, y).
  function valve(ctx, C, x, y, s, open) {
    ctx.save();
    const fill = open ? C.on : C.metal;
    ctx.fillStyle = fill; ctx.strokeStyle = C.line; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s * 0.65); ctx.lineTo(x, y); ctx.lineTo(x - s, y + s * 0.65); ctx.closePath();
    ctx.moveTo(x + s, y - s * 0.65); ctx.lineTo(x, y); ctx.lineTo(x + s, y + s * 0.65); ctx.closePath();
    if (open) { ctx.shadowColor = C.on; ctx.shadowBlur = 10; }
    ctx.fill(); ctx.shadowBlur = 0; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - s * 1.1); ctx.stroke();
    rr(ctx, x - s * 0.6, y - s * 1.6, s * 1.2, s * 0.6, 2);
    ctx.fillStyle = open ? C.on : C.metal; ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  PLC.sceneKit = {
    FONT, stage, Sensor, messenger, substep, readColors, mix, alpha,
    draw: { font, rr, text, tag, lamp, motor, valve },
  };
})(typeof window !== 'undefined' ? window : globalThis);
